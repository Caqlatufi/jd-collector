import {Annotation, StateGraph, START, END, MemorySaver, Command, interrupt} from '@langchain/langgraph';
import {normalizeJobUrl} from '../../frontend/src/common/desktop/jobUrl.mjs';

export class ImportError extends Error {
  constructor(code, message, status = 'FAILED') { super(message); this.code = code; this.status = status; }
}
const fail = (code, message, status) => { throw new ImportError(code, message, status); };
export function jobUrl(value) {
  try {
    return normalizeJobUrl(value);
  } catch { fail('INVALID_URL', '请填写完整的 HTTPS 岗位详情链接'); }
}
const normalize = text => text?.normalize('NFKC').replace(/\s/g, '').toLowerCase() || '';
function optionalDate(value, label, notes) {
  if (value == null) return null;
  if (typeof value !== 'string') fail('INVALID_RESULT', `${label}格式无效：须为 YYYY-MM-DD 或 null，尚未入库`);
  const text = value.trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text) && !text.startsWith('0000-')) {
    const date = new Date(text + 'T00:00:00.000Z');
    if (!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text) return text;
  }
  // Relative activity labels are evidence, not calendar dates. Do not invent a date
  // from the capture time or let optional metadata discard an otherwise complete JD.
  const original = text.replace(/[\r\n\t]/g, ' ').slice(0, 100);
  notes.push(`${label}原文“${original}”无法确认为具体日期，按未知保存，未推算日期。`);
  return null;
}
export function validateDecision(result, task, captures) {
  if (!result || result.taskId !== task.taskId || !['SCROLL', 'COMPLETE', 'LOGIN', 'CHALLENGE', 'WAIT', 'REVIEW', 'INVALID'].includes(result.action) ||
      !['JD', 'LOGIN', 'CHALLENGE', 'LOADING', 'NOT_JD', 'UNAVAILABLE', 'UNCERTAIN'].includes(result.pageType)) {
    fail('INVALID_RESULT', '子 Agent 返回的结果格式无效，请重试');
  }
  const capture = captures.at(-1);
  if (['SCROLL', 'COMPLETE'].includes(result.action) && (result.pageType !== 'JD' ||
      !result.identity?.title?.trim() || !result.identity?.companyName?.trim())) {
    fail('INVALID_JD_PAGE', '截图中无法确认岗位与公司身份，尚未收录', 'NEEDS_REVIEW');
  }
  if (result.action === 'SCROLL') {
    const s = result.scroll;
    if (!s || !['x', 'y', 'deltaY'].every(key => Number.isInteger(s[key])) || s.x < capture.rect.x ||
        s.y < capture.rect.y || s.x >= capture.rect.x + capture.rect.width || s.y >= capture.rect.y + capture.rect.height ||
        s.deltaY >= 0 || Math.abs(s.deltaY) > Math.floor(capture.viewport.height * 0.65)) {
      fail('INVALID_SCROLL', '子 Agent 请求的滚动超出当前截图区域，未执行操作', 'NEEDS_REVIEW');
    }
    return result;
  }
  if (result.action !== 'COMPLETE') return result;
  const coverage = result.coverage;
  const ids = new Set(captures.map(c => c.captureId));
  if (!coverage || coverage.start !== true || coverage.end !== true || coverage.continuous !== true ||
      !Array.isArray(coverage.captureIds) || coverage.captureIds.length !== ids.size ||
      new Set(coverage.captureIds).size !== ids.size || coverage.captureIds.some(id => !ids.has(id))) {
    fail('INCOMPLETE_JD', '正文开头、结尾或中间连续性未确认，尚未收录', 'NEEDS_REVIEW');
  }
  if (!result.job) return result; // READ phase ends here; SCORE is a separate graph node.
  const j = result.job && {...result.job};
  if (!j || j.coverage !== 'COMPLETE' || !['title', 'companyName', 'rawJd', 'matchPoints', 'skillGaps', 'riskNotes', 'requiredSkills'].every(k => typeof j[k] === 'string') ||
      !j.title.trim() || j.title.length > 160 || /[…]|\.{3}/.test(j.title) || !j.companyName.trim() || j.companyName.length > 120 ||
      j.rawJd.trim().length < 40 || !j.riskNotes.trim() || !j.matchPoints.trim() ||
      !['title', 'company', 'bodyStart', 'bodyEnd'].every(k => Array.isArray(j.evidence?.[k]) && j.evidence[k].length && j.evidence[k].every(id => ids.has(id)))) {
    fail('INCOMPLETE_JD', '岗位身份或正文完整性无法确认，已保留截图，尚未入库', 'NEEDS_REVIEW');
  }
  if (j.newDirection != null) {
    if (j.direction != null && j.direction !== '') fail('INVALID_DIRECTION', '已有岗位方向与新增分类不能同时填写，尚未入库');
    for (const [key, max] of Object.entries({label: 60, description: 400, reason: 500})) {
      if (typeof j.newDirection[key] !== 'string' || !j.newDirection[key].trim() || j.newDirection[key].length > max)
        fail('INVALID_DIRECTION', `新增岗位分类 ${key} 缺失或格式无效，尚未入库`);
    }
  } else if (typeof j.direction !== 'string' || !j.direction.trim() || j.direction.length > 40) {
    fail('INVALID_DIRECTION', '岗位方向 direction 缺失或格式无效；不匹配时须提供 newDirection，尚未入库');
  }
  for (const [key, values] of Object.entries({businessType: ['PRODUCT', 'TO_B_PRODUCT', 'DELIVERY', 'OUTSOURCING', 'UNKNOWN'],
    productOwnership: ['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']})) {
    if (!values.includes(j[key])) fail('INVALID_RESULT', `${key} 格式无效，允许值：${values.join('、')}，尚未入库`);
  }
  if (typeof j.blockingRisk !== 'boolean') fail('INVALID_RESULT', 'blockingRisk 须为布尔值，尚未入库');
  for (const [key, max] of Object.entries({matchScore: 35, companyScore: 20, freshnessScore: 15, commuteScore: 0, salaryScore: 15})) {
    if (!Number.isInteger(j[key]) || j[key] < 0 || j[key] > max) fail('INVALID_SCORE', '评分超出范围或填入了未经核实的通勤分，尚未入库');
  }
  for (const key of ['salaryMinK', 'salaryMaxK', 'salaryMonths', 'experienceMin', 'experienceMax']) {
    if (j[key] != null && (!Number.isInteger(j[key]) || j[key] < (key === 'salaryMonths' ? 1 : 0) || j[key] > (key === 'salaryMonths' ? 24 : 1000))) {
      fail('INVALID_RESULT', '岗位薪资或经验格式无效，尚未入库');
    }
  }
  if (j.salaryMinK != null && j.salaryMaxK != null && j.salaryMinK > j.salaryMaxK) fail('INVALID_RESULT', '薪资上下限不一致');
  const dateNotes = [];
  for (const [key, label] of Object.entries({publishedAt: '岗位发布时间', recruiterActiveAt: '招聘者活跃时间'})) {
    j[key] = optionalDate(j[key], label, dateNotes);
  }
  if (dateNotes.length) j.riskNotes += '\n自动收录日期说明：' + dateNotes.join(' ');
  if (!Array.isArray(j.terms) || j.terms.length > 30 || j.terms.some(t => typeof t.term !== 'string' || !t.term.trim() || t.term.length > 100 || !['HIGH', 'MEDIUM', 'LOW'].includes(t.priority)) ||
      new Set(j.terms.map(t => normalize(t.term))).size !== j.terms.length) fail('INVALID_TERMS', '知识词格式无效，尚未入库');
  for (const key of ['location', 'officeAddress']) if (j[key] != null && (typeof j[key] !== 'string' || j[key].length > 255)) fail('INVALID_RESULT', '办公地点格式无效');
  return {...result, job: j};
}
export function sameFrame(before, after) {
  return before.key === after.key && before.sourceUrl === after.sourceUrl && before.pageRevision === after.pageRevision &&
    before.sha256 === after.sha256 && before.zoomFactor === after.zoomFactor &&
    JSON.stringify(before.viewport) === JSON.stringify(after.viewport) && JSON.stringify(before.rect) === JSON.stringify(after.rect);
}

export function resolveDirection(job, directions) {
  if (!Array.isArray(directions) || !directions.length) fail('DIRECTIONS_UNAVAILABLE', '岗位分类加载失败，尚未入库');
  if (!job.newDirection) {
    if (!directions.some(d => d.value === job.direction))
      fail('INVALID_DIRECTION', 'direction 不在当前分类中；确实不匹配时须提供新分类名称、定义和理由，尚未入库');
    return job;
  }
  const key = normalize(job.newDirection.label);
  const existing = directions.find(d => normalize(d.label) === key || normalize(d.value) === key);
  return existing ? {...job, direction: existing.value, newDirection: null} : {...job, direction: null};
}

const State = Annotation.Root(Object.fromEntries([
  'sourceUrl', 'master', 'criteria', 'directions', 'captures', 'decision', 'identity', 'changed', 'waits', 'pause', 'route', 'result',
].map(key => [key, Annotation()])));
const reset = () => ({captures: [], decision: null, identity: null, changed: 0, waits: 0, result: null, pause: null});
const duplicateResult = posting => ({postingId: posting.id, title: posting.title, duplicate: true, message: '该链接已收录，保留已有评分和阶段'});

async function scoringContext(api) {
  const versions = await api('GET', '/resume-versions?active=true&type=MASTER');
  if (versions.length !== 1) fail('MASTER_REQUIRED', '需要唯一启用且有正文的标准母版简历，才能自动评分');
  const master = await api('GET', '/resume-versions/' + versions[0].id);
  if (!master.contentMarkdown?.trim()) fail('MASTER_REQUIRED', '标准母版简历正文为空，无法自动评分');
  const directions = await api('GET', '/posting-directions');
  if (!Array.isArray(directions) || !directions.length) fail('DIRECTIONS_UNAVAILABLE', '岗位分类加载失败，请重试');
  return {master, directions, criteria: await api('GET', '/criteria')};
}

export function createImportGraph(task, deps) {
  const {api, workflow, model, progress, remember, wait = ms => new Promise(resolve => setTimeout(resolve, ms))} = deps;
  const capture = async () => {
    // Generic pages may put company/role identity at the very top; do not use a BOSS crop.
    const c = await workflow('capture', {key: task.tabKey});
    if (c.viewport.height < 220 || c.viewport.width < 420) fail('VIEWPORT_TOO_SMALL', '客户端可见区域过小，请调整后继续', 'WAITING_USER');
    await remember('capture-' + c.captureId, c);
    return c;
  };
  const input = (state, mode) => ({taskId: task.taskId, sourceUrl: state.sourceUrl, captures: state.captures, mode,
    identity: state.identity, ...(mode === 'SCORE' ? {master: state.master.contentMarkdown, criteria: state.criteria, directions: state.directions} : {}),
    today: new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Shanghai'}).format(new Date())});
  // The interrupt itself lives in a separate node and is never swallowed by an error catch.
  const guarded = fn => async state => {
    try { return await fn(state); }
    catch (error) {
      if (error instanceof ImportError && error.status === 'WAITING_USER') {
        return {pause: {code: error.code, message: error.message, status: error.status}, route: 'pause'};
      }
      throw error;
    }
  };
  const route = state => state.route;
  const graph = new StateGraph(State)
    .addNode('prepare', guarded(async () => {
      const sourceUrl = jobUrl(task.sourceUrl);
      const existing = await api('GET', '/postings/source?url=' + encodeURIComponent(sourceUrl));
      if (existing.length) return {result: await deps.repairExisting?.(existing[0]) || duplicateResult(existing[0]), route: 'done'};
      return {...reset(), sourceUrl, ...await scoringContext(api), route: 'open'};
    }))
    .addNode('open', guarded(async state => {
      const capabilities = await workflow('info');
      if (!capabilities?.genericJobCapture) fail('CLIENT_UPGRADE_REQUIRED', '客户端尚未加载通用后台收录功能，请保存输入并重启客户端后继续', 'WAITING_USER');
      await progress({phase: 'OPENING', message: '正在后台打开岗位详情标签'});
      await workflow('openJob', {key: task.tabKey, url: state.sourceUrl});
      let ready = false;
      for (let n = 0; n < 15; n++) {
        const tab = (await workflow('tabs')).find(t => t.key === task.tabKey);
        if (!tab) fail('TAB_NOT_FOUND', '收录标签已关闭，请继续以重新打开', 'WAITING_USER');
        if (tab.status === 'ready') { ready = true; break; }
        if (['failed', 'blank'].includes(tab.status)) fail('PAGE_LOAD_FAILED', '岗位页面加载失败或空白，请在客户端检查后继续', 'WAITING_USER');
        await wait(1000);
      }
      if (!ready) fail('PAGE_LOAD_TIMEOUT', '岗位页面仍在加载，请稍后继续', 'WAITING_USER');
      await wait(1500);
      return {route: 'capture'};
    }))
    .addNode('capture', guarded(async state => {
      if (state.captures.length >= 12) fail('CAPTURE_LIMIT', '已达到单个岗位截图上限，正文完整性尚未确认，未保存半篇 JD', 'NEEDS_REVIEW');
      const c = await capture();
      const first = state.captures[0];
      if (first && (c.sourceUrl !== first.sourceUrl || c.pageRevision !== first.pageRevision))
        fail('SOURCE_CHANGED', '收集正文期间页面已导航，请重试以重新核对岗位身份', 'NEEDS_REVIEW');
      return {captures: [...state.captures, c], route: 'read'};
    }))
    .addNode('read', guarded(async state => {
      await progress({phase: state.identity ? 'READING' : 'VALIDATING',
        message: state.identity ? `正在核对第 ${state.captures.length} 张截图的正文连续性` : '正在判断是否为有效岗位详情页', captureCount: state.captures.length});
      const decision = validateDecision(await model(input(state, 'READ')), task, state.captures);
      await remember('decision-' + state.captures.length, decision);
      if (decision.action === 'LOGIN' || decision.pageType === 'LOGIN') fail('LOGIN_REQUIRED', '该网站需要登录，请在收录标签登录后返回工作台继续', 'WAITING_USER');
      if (decision.action === 'CHALLENGE' || decision.pageType === 'CHALLENGE') fail('VERIFICATION_REQUIRED', '该网站需要安全验证，请在收录标签完成后返回工作台继续', 'WAITING_USER');
      if (decision.action === 'INVALID' || ['NOT_JD', 'UNAVAILABLE'].includes(decision.pageType))
        fail('INVALID_JD_PAGE', '当前页面不是有效的岗位详情页，可能是列表、首页或已失效岗位，请更换详情链接');
      if (decision.action === 'REVIEW') fail('INCOMPLETE_JD', '岗位身份或正文完整性无法确认，请检查原页面后重试', 'NEEDS_REVIEW');
      if (decision.action === 'WAIT') {
        if (state.waits >= 2) fail('PAGE_UNREADABLE', '岗位页面仍未显示可读正文，请检查后继续', 'WAITING_USER');
        await wait(2000);
        return {captures: state.captures.slice(0, -1), waits: state.waits + 1, route: 'capture'};
      }
      if (state.identity && (normalize(state.identity.title) !== normalize(decision.identity.title) || normalize(state.identity.companyName) !== normalize(decision.identity.companyName)))
        fail('IDENTITY_CHANGED', '截图中的岗位或公司发生变化，停止收录以避免混入其他岗位', 'NEEDS_REVIEW');
      return {decision, identity: decision.identity, route: decision.action === 'SCROLL' ? 'scroll' : 'score'};
    }))
    .addNode('scroll', guarded(async state => {
      const fresh = await capture();
      if (!sameFrame(state.captures.at(-1), fresh)) {
        if (state.changed >= 3) fail('PAGE_CHANGED', '岗位画面持续变化，请待页面稳定后继续', 'WAITING_USER');
        return {captures: state.captures.slice(0, -1), changed: state.changed + 1, route: 'capture'};
      }
      await workflow('scroll', {key: task.tabKey, captureId: fresh.captureId, ...state.decision.scroll, deltaX: 0});
      await wait(700);
      return {route: 'capture'};
    }))
    .addNode('score', guarded(async state => {
      await progress({phase: 'SCORING', message: '正文已完整，正在整理 JD 并结合简历与门槛评分'});
      const decision = validateDecision(await model(input(state, 'SCORE')), task, state.captures);
      if (decision.action !== 'COMPLETE' || !decision.job ||
          normalize(decision.job.title) !== normalize(state.identity.title) || normalize(decision.job.companyName) !== normalize(state.identity.companyName))
        fail('INVALID_RESULT', '整理后的岗位身份与截图不一致，尚未收录', 'NEEDS_REVIEW');
      await remember('scored-decision', decision);
      return {decision, route: 'classify'};
    }))
    .addNode('classify', guarded(async state => {
      const directions = await api('GET', '/posting-directions');
      const job = resolveDirection(state.decision.job, directions);
      await remember('classified-direction', {direction: job.direction, newDirection: job.newDirection ?? null});
      return {directions, decision: {...state.decision, job}, route: 'save'};
    }))
    .addNode('save', guarded(async state => {
      const currentPage = await capture();
      const last = state.captures.at(-1);
      if (currentPage.pageRevision !== last.pageRevision || currentPage.sourceUrl !== last.sourceUrl)
        fail('PAGE_CHANGED', '读取期间岗位页面已导航，请重试以读取最新页面', 'NEEDS_REVIEW');
      if (!sameFrame(last, currentPage)) {
        if (state.changed >= 3) fail('PAGE_CHANGED', '保存前岗位画面持续变化，请待页面稳定后继续', 'WAITING_USER');
        return {captures: state.captures.slice(0, -1), changed: state.changed + 1, route: 'capture'};
      }
      const versions = await api('GET', '/resume-versions?active=true&type=MASTER');
      const current = await api('GET', '/resume-versions/' + state.master.id);
      if (versions.length !== 1 || versions[0].id !== state.master.id || current.contentMarkdown !== state.master.contentMarkdown ||
          JSON.stringify(await api('GET', '/criteria')) !== JSON.stringify(state.criteria))
        fail('SCORING_CONTEXT_CHANGED', '简历母版或门槛在读取期间发生变化，请重试以使用最新资料评分', 'NEEDS_REVIEW');
      await progress({phase: 'SAVING', message: '正在查重、保存 JD 与评分并回读验证'});
      return {result: await savePosting(state.decision.job, {...task, sourceUrl: state.sourceUrl}, deps, state.captures, state.master.id), route: 'done'};
    }))
    .addNode('waitForUser', state => {
      interrupt(state.pause);
      // The browser may have been rebuilt or navigated during manual login. Discard stale
      // coordinates/evidence, reopen from the submitted URL and visually verify again.
      return {...reset(), route: 'prepare'};
    })
    .addEdge(START, 'prepare')
    .addEdge('waitForUser', 'prepare');
  for (const node of ['prepare', 'open', 'capture', 'read', 'scroll', 'score', 'classify', 'save'])
    graph.addConditionalEdges(node, route, {open: 'open', capture: 'capture', read: 'read', scroll: 'scroll', score: 'score', classify: 'classify', save: 'save', pause: 'waitForUser', done: END});
  return graph.compile({checkpointer: deps.checkpointer || new MemorySaver()});
}

export async function importPosting(task, deps) {
  const graph = createImportGraph(task, deps);
  const config = {configurable: {thread_id: task.taskId}, recursionLimit: 120};
  const previous = await graph.getState(config);
  let input = {};
  if (previous.tasks?.some(t => t.interrupts?.length)) input = new Command({resume: true});
  else if (previous.createdAt) {
    // READ/SCORE have no browser or business mutations. Resume the pending model node
    // after verifying the target still matches; never replay an uncertain browser action.
    const pending = previous.next?.length === 1 ? previous.next[0] : null;
    const state = previous.values;
    let resumeModel = ['read', 'score'].includes(pending) && state.captures?.length > 0 &&
      state.sourceUrl === jobUrl(task.sourceUrl);
    if (resumeModel) {
      const existing = await deps.api('GET', '/postings/source?url=' + encodeURIComponent(state.sourceUrl));
      if (existing.length) return await deps.repairExisting?.(existing[0]) || duplicateResult(existing[0]);
      try {
        const fresh = await deps.workflow('capture', {key: task.tabKey});
        resumeModel = sameFrame(state.captures.at(-1), fresh);
      } catch (error) {
        if (!(error instanceof ImportError) || error.status !== 'WAITING_USER') throw error;
        resumeModel = false;
      }
    }
    if (resumeModel) {
      const context = await scoringContext(deps.api);
      if (context.master.id !== state.master.id || context.master.contentMarkdown !== state.master.contentMarkdown ||
          JSON.stringify(context.criteria) !== JSON.stringify(state.criteria) ||
          JSON.stringify(context.directions) !== JSON.stringify(state.directions)) {
        // Context updates invalidate scoring, not the already verified page coverage.
        await graph.updateState(config, {...context, route: pending}, pending === 'read' ? 'capture' : 'read');
      }
      await deps.progress({phase: pending === 'score' ? 'SCORING' : state.identity ? 'READING' : 'VALIDATING',
        message: pending === 'score' ? '已恢复断点，保留完整正文截图，继续整理 JD 与评分' : '已恢复断点，继续核对尚未完成的截图',
        captureCount: state.captures.length});
    } else {
      await graph.updateState(config, {...reset(), route: 'prepare'}, 'waitForUser');
    }
    input = null;
  }
  const result = await graph.invoke(input, config);
  if (result.result) return result.result;
  const state = await graph.getState(config);
  const paused = state.values.pause;
  if (paused) throw new ImportError(paused.code, paused.message, paused.status);
  fail('IMPORT_FAILED', '收录流程未返回完成结果，请重试');
}

async function savePosting(job, task, deps, captures, masterId) {
  const {api, remember} = deps;
  // Recheck immediately before mutation, including retries after an uncertain previous save.
  const duplicate = await api('GET', '/postings/source?url=' + encodeURIComponent(task.sourceUrl));
  if (duplicate.length) return {postingId: duplicate[0].id, title: duplicate[0].title, duplicate: true, message: '该链接已收录，保留已有评分和阶段'};
  const companies = [];
  for (let page = 1; ; page++) {
    const data = await api('GET', `/companies?number=${page}&size=100`, undefined, true);
    companies.push(...data.result);
    if (companies.length >= data.page.totalElements || !data.result.length) break;
    if (page >= 100) fail('COMPANY_LOOKUP_FAILED', '公司库无法完整核对，未保存');
  }
  const names = [job.companyName, job.companyAlias].filter(Boolean).map(normalize);
  const matched = companies.filter(c => names.includes(normalize(c.name)) || (c.alias && names.includes(normalize(c.alias))));
  if (matched.length > 1) fail('AMBIGUOUS_COMPANY', '公司库存在多个同名或同简称记录，暂停收录以避免关联错误', 'NEEDS_REVIEW');
  const company = matched[0] || await api('POST', '/companies', {name: job.companyName, alias: job.companyAlias,
    businessType: job.businessType, productOwnership: job.productOwnership, address: job.officeAddress,
    qualityScore: job.companyScore, active: true, notes: '来源：用户提交岗位详情链接，原生截图自动收录；未知信息未补全。'});
  const classified = resolveDirection(job, await api('GET', '/posting-directions'));
  const allowed = ['title', 'direction', 'newDirection', 'rawJd', 'location', 'salaryMinK', 'salaryMaxK', 'salaryMonths', 'experienceMin',
    'experienceMax', 'publishedAt', 'recruiterActiveAt', 'requiredSkills', 'bonusSkills', 'matchPoints', 'skillGaps',
    'blockingRisk', 'matchScore', 'companyScore', 'freshnessScore', 'commuteScore', 'salaryScore'];
  const request = Object.fromEntries(allowed.map(key => [key, classified[key] ?? null]));
  const hostname = new URL(task.sourceUrl).hostname;
  const source = /(^|\.)zhipin\.com$/.test(hostname) ? 'BOSS' : /(^|\.)liepin\.com$/.test(hostname) ? 'LIEPIN' : 'OTHER';
  Object.assign(request, {companyId: company.id, source, sourceUrl: task.sourceUrl, officialSynchronized: false,
    riskNotes: job.riskNotes + `\n自动收录任务：${task.taskId}；评分母版 ID：${masterId}；通勤时间未填写；截图证据：` +
      captures.map(c => c.captureId).join('、')});
  await remember('validated-posting', {request, terms: job.terms, masterId, captures});
  let posting;
  try { posting = await api('POST', '/postings', request); }
  catch (error) {
    if (error.httpStatus !== 409) throw error;
    const already = await api('GET', '/postings/source?url=' + encodeURIComponent(task.sourceUrl));
    if (already.length) return {postingId: already[0].id, title: already[0].title, duplicate: true, message: '该链接已由其他操作收录，保留原记录'};
    if (!request.newDirection) throw error;
    const refreshed = resolveDirection(classified, await api('GET', '/posting-directions'));
    if (refreshed.newDirection) throw error;
    Object.assign(request, {direction: refreshed.direction, newDirection: null});
    posting = await api('POST', '/postings', request);
  }
  await remember('saved-posting', {postingId: posting.id, sourceUrl: task.sourceUrl});
  const verified = await api('GET', '/postings/' + posting.id);
  const directions = await api('GET', '/posting-directions');
  if (verified.sourceUrl !== task.sourceUrl || verified.rawJd !== job.rawJd || verified.stage !== 'SCREENED' ||
      !verified.direction || verified.direction !== posting.direction ||
      !directions.some(d => d.value === verified.direction && (!request.newDirection || normalize(d.label) === normalize(request.newDirection.label)))) {
    fail('SAVE_READBACK_FAILED', 'JD 保存后回读不一致，请检查记录，重试不会覆盖已有岗位', 'PARTIAL');
  }
  // Terms are derived from this new JD, independent of the cancelled historical backfill.
  try {
    await api('PUT', `/posting-knowledge/postings/${posting.id}/terms`, {extractorVersion: 'jd-term-v1', terms: job.terms});
    const terms = await api('GET', `/posting-knowledge/postings/${posting.id}/terms`);
    if (!terms.processed || terms.stale) throw new Error();
  } catch {
    return {postingId: posting.id, title: posting.title, tier: posting.tier, status: 'PARTIAL', errorCode: 'TERMS_SAVE_FAILED',
      message: 'JD 和评分已保存，知识词保存失败；重试会补充本任务知识词，保留岗位阶段'};
  }
  return {postingId: posting.id, title: posting.title, tier: posting.tier, duplicate: false, message: 'JD 已收录并评分，阶段为已筛选'};
}
