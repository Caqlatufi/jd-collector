import {Annotation, StateGraph, START, END, MemorySaver, Command, interrupt} from '@langchain/langgraph';
import {ImportError, jobUrl, sameFrame} from './importer.mjs';

const fail = (code, message, status = 'FAILED') => { throw new ImportError(code, message, status); };
const key = text => typeof text === 'string' ? text.normalize('NFKC').replace(/\s/g, '').toLowerCase() : '';
const State = Annotation.Root(Object.fromEntries(['company', 'targets', 'index', 'target', 'captures', 'decision',
  'candidate', 'changed', 'waits', 'pause', 'route', 'result'].map(name => [name, Annotation()])));
const searchTargets = company => [
  `${company.name} 上海 办公地址`, `${company.name} 上海 联系我们 办公地点`,
].map(query => ({kind: 'SEARCH', url: 'https://cn.bing.com/search?q=' + encodeURIComponent(query)}));

export function validateAddressDecision(result, task, state) {
  const {captures, target, company} = state;
  const ids = new Set(captures.map(c => c.captureId));
  if (!result || result.taskId !== task.taskId || !['FOUND', 'SCROLL', 'NO_ADDRESS', 'WAIT', 'LOGIN', 'CHALLENGE', 'REVIEW'].includes(result.action)
      || !['RECRUITING', 'OFFICIAL', 'SEARCH', 'INVALID', 'UNAVAILABLE', 'LOGIN', 'CHALLENGE', 'LOADING'].includes(result.pageType))
    fail('INVALID_RESULT', '地址识别结果格式无效，尚未保存');
  if (result.action === 'SCROLL') {
    const s = result.scroll, c = captures.at(-1);
    if (!s || !['x', 'y', 'deltaY'].every(k => Number.isInteger(s[k])) || s.x < c.rect.x || s.y < c.rect.y
        || s.x >= c.rect.x + c.rect.width || s.y >= c.rect.y + c.rect.height || s.deltaY >= 0
        || Math.abs(s.deltaY) > Math.floor(c.viewport.height * 0.65)) fail('INVALID_SCROLL', '地址读取请求了无效滚动，未执行');
  }
  if (result.action === 'NO_ADDRESS' && !['INVALID', 'UNAVAILABLE'].includes(result.pageType)) {
    const coverage = result.coverage;
    if (!coverage?.start || !coverage?.end || !coverage?.continuous || !Array.isArray(coverage.captureIds)
        || coverage.captureIds.length !== ids.size || new Set(coverage.captureIds).size !== ids.size
        || coverage.captureIds.some(id => !ids.has(id)))
      fail('INCOMPLETE_ADDRESS_PAGE', '尚未确认地址区域已完整读取，未推断页面没有地址', 'NEEDS_REVIEW');
  }
  if (result.action !== 'FOUND') return result;
  const address = result.address;
  const names = [company.name, company.alias].filter(Boolean).map(key);
  if (result.companyConfirmed !== true || !names.includes(key(result.companyName)) || typeof address !== 'string'
      || address.length > 255 || !address.includes('上海') || key(address).length < 8
      || /^上海市?([·-]?[\p{Script=Han}]{2,4}区)?$/u.test(key(address))
      || typeof result.evidenceText !== 'string' || !result.evidenceText.trim() || result.evidenceText.length > 1800
      || !Array.isArray(result.evidenceCaptureIds) || !result.evidenceCaptureIds.length || result.evidenceCaptureIds.some(id => !ids.has(id)))
    fail('UNVERIFIED_ADDRESS', '公司身份、上海详细地址或截图证据不完整，尚未保存', 'NEEDS_REVIEW');
  if (target.kind === 'JD') {
    if (!['RECRUITING', 'OFFICIAL'].includes(result.pageType) || result.addressType !== 'JOB_OFFICE'
        || key(result.title) !== key(target.title))
      fail('UNVERIFIED_JOB_ADDRESS', '地址并非当前岗位的明确办公点，尚未保存', 'NEEDS_REVIEW');
  } else if (result.pageType !== 'SEARCH' || result.addressType !== 'COMPANY_OFFICE') {
    fail('UNVERIFIED_COMPANY_ADDRESS', '查询结果未确认公司上海办公地址，注册地址或其他城市地址不会保存', 'NEEDS_REVIEW');
  }
  return result;
}

export function createAddressGraph(task, deps) {
  const {api, workflow, model, remember, progress, wait = ms => new Promise(resolve => setTimeout(resolve, ms))} = deps;
  const capture = async () => {
    const c = await workflow('capture', {key: task.tabKey});
    if (c.viewport.width < 420 || c.viewport.height < 220) fail('VIEWPORT_TOO_SMALL', '客户端视口过小，请调整后继续', 'WAITING_USER');
    await remember('capture-' + c.captureId, c);
    return c;
  };
  const guard = fn => async state => {
    try { return await fn(state); }
    catch (error) {
      if (error instanceof ImportError && error.status === 'WAITING_USER') return {pause: {code: error.code, message: error.message}, route: 'pause'};
      throw error;
    }
  };
  const graph = new StateGraph(State)
    .addNode('prepare', guard(async () => {
      const company = await api('GET', '/companies/' + task.companyId);
      if (company.name !== task.companyName) fail('COMPANY_CHANGED', '公司名称已变化，请重新发起地址查询', 'NEEDS_REVIEW');
      const prior = (await api('GET', '/companies/address-discoveries')).find(row => row.taskId === task.taskId && row.companyId === company.id);
      if (prior) return {result: {address: prior.address, sourceType: prior.sourceType, message: '本任务地址已保存，保留现有岗位与公司资料'}, route: 'done'};
      const targets = [];
      for (let page = 1; ; page++) {
        const data = await api('GET', `/postings?companyId=${company.id}&number=${page}&size=100`, undefined, true);
        for (const posting of data.result) {
          if (posting.companyId !== company.id || !posting.sourceUrl) continue;
          let url;
          try { url = jobUrl(posting.sourceUrl); } catch { continue; }
          if (!targets.some(t => t.url === url)) targets.push({kind: 'JD', url, postingId: posting.id, title: posting.title,
            expectedPostingUrl: posting.sourceUrl, expectedLocation: posting.location ?? null});
        }
        if (page >= (data.page.totalPages ?? Math.ceil(data.page.totalElements / 100))) break;
        if (page >= 100) fail('POSTINGS_LOOKUP_FAILED', '岗位列表无法完整核对，未开始查询');
      }
      // Try JD links first. Company search follows only after these targets fail to provide an office.
      return {company, targets: [...targets.slice(0, 5), ...searchTargets(company)], index: 0, changed: 0, route: 'select'};
    }))
    .addNode('select', guard(async state => {
      if (state.index >= state.targets.length) fail('ADDRESS_NOT_FOUND', '未找到可确认的上海办公地址，已保留截图，需人工核实', 'NEEDS_REVIEW');
      return {target: state.targets[state.index], captures: [], waits: 0, changed: 0, candidate: null, route: 'open'};
    }))
    .addNode('open', guard(async state => {
      const capabilities = await workflow('info');
      if (!capabilities?.genericJobCapture || !capabilities?.companyAddressCapture)
        fail('CLIENT_UPGRADE_REQUIRED', '请保存输入并重启客户端后继续地址查询', 'WAITING_USER');
      await progress({phase: state.target.kind === 'JD' ? 'READING_JD' : 'SEARCHING_COMPANY',
        message: state.target.kind === 'JD' ? '优先打开 JD 链接核对工作地址' : '正在查询公司在上海的办公地址'});
      await workflow('openJob', {key: task.tabKey, url: state.target.url});
      for (let n = 0; n < 15; n++) {
        const tab = (await workflow('tabs')).find(t => t.key === task.tabKey);
        if (!tab) fail('TAB_NOT_FOUND', '地址查询标签已关闭，请继续查询', 'WAITING_USER');
        if (tab.status === 'ready') { await wait(1500); return {route: 'capture'}; }
        if (['failed', 'blank'].includes(tab.status)) return {index: state.index + 1, route: 'select'};
        await wait(1000);
      }
      fail('PAGE_LOAD_TIMEOUT', '地址页面仍在加载，请稍后继续', 'WAITING_USER');
    }))
    .addNode('capture', guard(async state => {
      if (state.captures.length >= 10) return {index: state.index + 1, route: 'select'};
      const c = await capture(), first = state.captures[0];
      if (first && (c.sourceUrl !== first.sourceUrl || c.pageRevision !== first.pageRevision))
        fail('PAGE_CHANGED', '地址读取期间页面发生导航，请重新核对', 'NEEDS_REVIEW');
      return {captures: [...state.captures, c], route: 'read'};
    }))
    .addNode('read', guard(async state => {
      const input = {taskId: task.taskId, mode: 'ADDRESS', company: {name: state.company.name, alias: state.company.alias},
        target: state.target, captures: state.captures};
      const decision = validateAddressDecision(await model(input), task, state);
      await remember('decision-' + state.index + '-' + state.captures.length, decision);
      if (decision.action === 'LOGIN' || decision.pageType === 'LOGIN') fail('LOGIN_REQUIRED', '请在查询标签登录后返回继续', 'WAITING_USER');
      if (decision.action === 'CHALLENGE' || decision.pageType === 'CHALLENGE') fail('VERIFICATION_REQUIRED', '请在查询标签完成网站验证后返回继续', 'WAITING_USER');
      if (decision.action === 'WAIT') {
        if (state.waits >= 2) fail('PAGE_UNREADABLE', '地址页面仍未显示，请检查后继续', 'WAITING_USER');
        await wait(2000);
        return {captures: state.captures.slice(0, -1), waits: state.waits + 1, route: 'capture'};
      }
      if (decision.action === 'REVIEW') fail('ADDRESS_NEEDS_REVIEW', decision.reason || '地址存在歧义，需人工核实', 'NEEDS_REVIEW');
      if (decision.action === 'FOUND') return {candidate: decision, route: 'save'};
      if (decision.action === 'SCROLL') return {decision, route: 'scroll'};
      let index = state.index + 1;
      // An official JD with no office address goes directly to company address search.
      if (state.target.kind === 'JD' && decision.pageType === 'OFFICIAL') index = state.targets.findIndex(t => t.kind === 'SEARCH');
      return {index, route: 'select'};
    }))
    .addNode('scroll', guard(async state => {
      const fresh = await capture();
      if (!sameFrame(state.captures.at(-1), fresh)) {
        if (state.changed >= 3) fail('PAGE_CHANGED', '地址页面持续变化，请稳定后继续', 'WAITING_USER');
        return {captures: state.captures.slice(0, -1), changed: state.changed + 1, route: 'capture'};
      }
      await workflow('scroll', {key: task.tabKey, captureId: fresh.captureId, ...state.decision.scroll, deltaX: 0});
      await wait(700);
      return {route: 'capture'};
    }))
    .addNode('save', guard(async state => {
      const fresh = await capture();
      if (!sameFrame(state.captures.at(-1), fresh)) {
        if (state.changed >= 3) fail('PAGE_CHANGED', '保存前页面持续变化，请稳定后继续', 'WAITING_USER');
        return {captures: [], candidate: null, changed: state.changed + 1, route: 'capture'};
      }
      const c = state.candidate, isJd = state.target.kind === 'JD';
      const request = {expectedCompanyName: state.company.name, address: c.address,
        sourceUrl: isJd ? state.target.expectedPostingUrl : state.target.url, taskId: task.taskId,
        evidenceText: c.evidenceText + '\n截图证据：' + c.evidenceCaptureIds.join('、'),
        ...(isJd ? {expectedPostingUrl: state.target.expectedPostingUrl, expectedLocation: state.target.expectedLocation} : {})};
      await progress({phase: 'SAVING', message: '正在保存地址与来源证据并回读验证'});
      await remember('validated-address', {target: state.target, request});
      const path = isJd ? `/postings/${state.target.postingId}/address-discoveries` : `/companies/${state.company.id}/address-discoveries`;
      const saved = await api('POST', path, request);
      const verified = (await api('GET', '/companies/address-discoveries')).find(row => row.id === saved.id);
      if (!verified || verified.companyId !== state.company.id || key(verified.address) !== key(c.address)
          || verified.sourceType !== (isJd ? 'JD' : 'COMPANY')) fail('ADDRESS_READBACK_FAILED', '地址回读不一致，请核对；重试不会覆盖其他资料');
      if (isJd && key((await api('GET', '/postings/' + state.target.postingId)).location) !== key(saved.address))
        fail('ADDRESS_READBACK_FAILED', '岗位地址回读不一致，请核对后重试');
      let positioned = false;
      try { const p = await api('POST', '/companies/location-positions', {address: saved.address}); positioned = p.longitude != null && p.latitude != null; }
      catch { /* The address is saved even if optional coordinate lookup is unavailable. */ }
      return {result: {address: saved.address, sourceType: saved.sourceType, positioned,
        message: (isJd ? '已补全 JD 工作地址' : '已保存公司上海办公地址参考，未替代 JD 工作地点') + (positioned ? '，已定位' : '；地点坐标尚待匹配')}, route: 'done'};
    }))
    .addNode('waitForUser', state => { interrupt(state.pause); return {route: 'prepare'}; })
    .addEdge(START, 'prepare').addEdge('waitForUser', 'prepare');
  const routes = {select: 'select', open: 'open', capture: 'capture', read: 'read', scroll: 'scroll', save: 'save', pause: 'waitForUser', done: END};
  for (const node of ['prepare', 'select', 'open', 'capture', 'read', 'scroll', 'save']) graph.addConditionalEdges(node, s => s.route, routes);
  return graph.compile({checkpointer: deps.checkpointer || new MemorySaver()});
}

export async function discoverCompanyAddress(task, deps) {
  const graph = createAddressGraph(task, deps);
  const config = {configurable: {thread_id: task.taskId}, recursionLimit: 220};
  const prior = await graph.getState(config);
  let input = {};
  if (prior.tasks?.some(t => t.interrupts?.length)) input = new Command({resume: true});
  else if (prior.createdAt) { await graph.updateState(config, {route: 'prepare'}, 'waitForUser'); input = null; }
  const state = await graph.invoke(input, config);
  if (state.result) return state.result;
  const pause = (await graph.getState(config)).values.pause;
  if (pause) fail(pause.code, pause.message, 'WAITING_USER');
  fail('ADDRESS_LOOKUP_FAILED', '地址流程未返回结果，请重试');
}
