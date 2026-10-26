import test from 'node:test';
import assert from 'node:assert/strict';
import {ImportError, createImportGraph, importPosting, jobUrl, sameFrame, validateDecision as strictDecision} from './importer.mjs';
import {codexArguments} from './model.mjs';
import {localApi} from './worker.mjs';
import {FileCheckpointer} from './checkpointer.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const task = {taskId: 'fixture', tabKey: 'jd-import:fixture', sourceUrl: 'https://www.zhipin.com/job_detail/fixture.html'};
const capture = n => ({captureId: 'capture-' + n, key: task.tabKey, sourceUrl: task.sourceUrl, pageRevision: 1,
  sha256: 'pixels-' + n, rect: {x: 0, y: 80, width: 1200, height: 920}, viewport: {width: 1200, height: 1000}, zoomFactor: 1});
const job = () => ({coverage: 'COMPLETE', title: 'Go 全栈工程师', companyName: '夹具公司', companyAlias: null,
  rawJd: '岗位职责：使用 Go 和 Vue 构建后端服务及管理界面，维护 MySQL 数据库。任职要求：有完整项目开发和部署经验。',
  direction: 'FULL_STACK', businessType: 'UNKNOWN', productOwnership: 'UNKNOWN', matchPoints: 'Kantar Go 后端', skillGaps: 'Go 框架待确认',
  riskNotes: '匹配有实际 Go 经历；公司未知；发布日期未知；通勤时间未知0分；薪资未知。', requiredSkills: 'Go、Vue、MySQL',
  blockingRisk: false, matchScore: 30, companyScore: 8, freshnessScore: 0, commuteScore: 0, salaryScore: 0,
  evidence: {title: ['capture-1'], company: ['capture-1'], bodyStart: ['capture-1'], bodyEnd: ['capture-1']},
  terms: [{term: 'Go', priority: 'HIGH'}]});
const protocol = (result, captures = [capture(1)]) => ({pageType: {LOGIN: 'LOGIN', CHALLENGE: 'CHALLENGE', WAIT: 'LOADING', INVALID: 'NOT_JD'}[result.action] || 'JD',
  identity: {title: job().title, companyName: job().companyName},
  coverage: {start: true, end: true, continuous: true, captureIds: [...new Set(captures.map(c => c.captureId))]}, ...result});
const validateDecision = (result, task, captures) => strictDecision(protocol(result, captures), task, captures);
function fixture(actions = []) {
  const writes = [], workflowCalls = [], records = new Map(); let captures = 0; let modelCalls = 0; let lastDecision;
  const directions = [{value: 'FULL_STACK', label: '全栈', description: '前后端开发'}];
  let savedDirection = 'FULL_STACK';
  const deps = {
    wait: async () => {}, progress: async () => {}, remember: async (key, value) => records.set(key, value),
    workflow: async (action, payload) => {
      workflowCalls.push({action, payload});
      if (action === 'info') return {backgroundJobCapture: true, genericJobCapture: true};
      if (action === 'tabs') return [{key: task.tabKey, active: false, status: 'ready'}];
      if (action === 'capture') {
        captures++; return capture(1); // Stable viewport unless a test overrides it.
      }
      return {};
    },
    model: async input => {
      modelCalls++;
      const result = actions.shift() || lastDecision || {taskId: task.taskId, action: 'COMPLETE', job: job()};
      if (result.action === 'COMPLETE') lastDecision = result;
      return protocol(result, input.captures);
    },
    api: async (method, route, body, full) => {
      if (method !== 'GET') writes.push({method, route, body});
      if (route.startsWith('/postings/source')) return [];
      if (route.includes('/resume-versions?')) return [{id: 1}];
      if (route === '/resume-versions/1') return {id: 1, contentMarkdown: 'Kantar Live Go 后端研发，Vue/Vite，MySQL。'};
      if (route === '/criteria') return {version: 'fixture', sections: []};
      if (route === '/posting-directions') return directions;
      if (route.startsWith('/companies?')) return {result: [{id: 8, name: '夹具公司'}], page: {totalElements: 1}};
      if (route === '/postings' && method === 'POST') {
        if (body.newDirection) directions.push({value: 'DIR_fixture', ...body.newDirection});
        savedDirection = body.direction || 'DIR_fixture';
        return {id: 9, title: body.title, direction: savedDirection, tier: 'B'};
      }
      if (route === '/postings/9') return {id: 9, sourceUrl: task.sourceUrl, rawJd: job().rawJd, direction: savedDirection, stage: 'SCREENED'};
      if (route.endsWith('/terms')) return {processed: true, stale: false};
      throw Error('Unexpected API ' + method + route);
    },
  };
  return {deps, writes, workflowCalls, records, calls: () => modelCalls};
}

test('generic URLs preserve job query and SPA identity; BOSS retains historical canonical form', () => {
  assert.equal(jobUrl(task.sourceUrl + '?from=search#x'), task.sourceUrl);
  const tildeUrl = 'https://www.zhipin.com/job_detail/527ac1dd43f4112103x_0tS1FlU~.html';
  assert.equal(jobUrl(tildeUrl + '?from=search#top'), tildeUrl);
  const official = 'https://nio.jobs.feishu.cn/index/position/7697199510845622566/detail';
  assert.equal(jobUrl(official), official);
  assert.equal(jobUrl('https://careers.example.com/jobs?id=42&utm_source=x#/position/42'), 'https://careers.example.com/jobs?id=42#/position/42');
  for (const url of ['http://www.zhipin.com/job_detail/a.html',
    'https://x@www.zhipin.com/job_detail/a.html', 'https://www.zhipin.com:8443/job_detail/a.html', 'javascript:alert(1)']) {
    assert.throws(() => jobUrl(url), {code: 'INVALID_URL'});
  }
  assert.throws(() => localApi('https://remote.test/jd-collector/api'), {code: 'INVALID_API'});
});
test('preexisting duplicate makes no model, browser or mutation calls', async () => {
  const f = fixture();
  f.deps.api = async () => [{id: 132, title: '已有岗位', stage: 'APPLIED'}];
  const result = await importPosting(task, f.deps);
  assert.equal(result.duplicate, true); assert.equal(f.calls(), 0);
  assert.equal(f.workflowCalls.length, 0); assert.equal(f.writes.length, 0);
});
test('full capture yields screened JD and validated terms, preserving existing company', async () => {
  const f = fixture(); const result = await importPosting(task, f.deps);
  assert.equal(result.postingId, 9);
  assert.deepEqual(f.writes.map(w => [w.method, w.route]), [['POST', '/postings'], ['PUT', '/posting-knowledge/postings/9/terms']]);
  assert.equal(f.writes[0].body.companyId, 8); assert.equal(f.writes[0].body.commuteScore, 0);
  assert.equal(f.writes[0].body.salaryMonths, null);
  assert.equal(f.writes[0].body.matchPoints, 'Kantar Go 后端');
  assert.equal(f.writes[1].body.extractorVersion, 'jd-term-v1');
  assert.ok(f.records.has('saved-posting'));
  assert.equal(f.workflowCalls.some(c => c.action === 'focus'), false);
});

test('old client pauses before opening any tab', async () => {
  const f = fixture();
  const original = f.deps.workflow;
  f.deps.workflow = async (action, payload) => action === 'info' ? {} : original(action, payload);
  await assert.rejects(importPosting(task, f.deps), {code: 'CLIENT_UPGRADE_REQUIRED', status: 'WAITING_USER'});
  assert.equal(f.workflowCalls.length, 0);
  assert.equal(f.writes.length, 0);
});

test('manual takeover while the model reads pauses before saving', async () => {
  const f = fixture();
  let takenOver = false;
  const original = f.deps.workflow;
  f.deps.workflow = async (action, payload) => {
    if (takenOver && action === 'capture') throw Object.assign(Error('user takeover'), {code: 'TARGET_IN_USE'});
    return original(action, payload);
  };
  f.deps.model = async () => { takenOver = true; return protocol({taskId: task.taskId, action: 'COMPLETE', job: job()}); };
  await assert.rejects(importPosting(task, f.deps), {code: 'TARGET_IN_USE'});
  assert.equal(f.writes.length, 0);
});
test('relative activity and publication labels do not prevent saving a complete JD', async () => {
  const decision = {taskId: task.taskId, action: 'COMPLETE', job: {...job(), publishedAt: '今日发布', recruiterActiveAt: '刚刚活跃'}};
  const f = fixture([decision]);
  const result = await importPosting(task, f.deps);
  assert.equal(result.postingId, 9);
  const saved = f.writes.find(w => w.route === '/postings').body;
  assert.equal(saved.publishedAt, null); assert.equal(saved.recruiterActiveAt, null);
  assert.ok(saved.riskNotes.includes('岗位发布时间原文“今日发布”'));
  assert.ok(saved.riskNotes.includes('招聘者活跃时间原文“刚刚活跃”'));
  assert.equal(saved.rawJd, decision.job.rawJd);
  assert.equal(saved.freshnessScore, decision.job.freshnessScore);
  assert.equal(decision.job.recruiterActiveAt, '刚刚活跃');
  assert.equal(f.writes.filter(w => w.route === '/postings').length, 1);
});
test('dates preserve exact calendar dates and keep unknown or invalid optional strings unknown', () => {
  for (const date of ['2026-10-14', '2024-02-29', '2000-02-29']) {
    const result = validateDecision({taskId: task.taskId, action: 'COMPLETE', job: {...job(), publishedAt: date, recruiterActiveAt: date}}, task, [capture(1)]);
    assert.equal(result.job.publishedAt, date); assert.equal(result.job.recruiterActiveAt, date);
    assert.equal(result.job.riskNotes, job().riskNotes);
  }
  for (const date of [null, undefined, '', '  ', '未知', '3日内活跃', '一周内活跃', '2026-02-30', '2025-02-29', '1900-02-29', '2026-13-01', '0000-01-01', '2026-10-14T10:00:00Z']) {
    const result = validateDecision({taskId: task.taskId, action: 'COMPLETE', job: {...job(), publishedAt: date, recruiterActiveAt: date}}, task, [capture(1)]);
    assert.equal(result.job.publishedAt, null); assert.equal(result.job.recruiterActiveAt, null);
    if (date?.trim()) assert.ok(result.job.riskNotes.includes(date));
  }
});
test('date fields of the wrong JSON type return the concrete field error before any writes', async () => {
  for (const [key, label] of Object.entries({publishedAt: '岗位发布时间', recruiterActiveAt: '招聘者活跃时间'})) {
    for (const value of [20261014, {}, ['2026-10-14'], true]) {
      const f = fixture([{taskId: task.taskId, action: 'COMPLETE', job: {...job(), [key]: value}}]);
      await assert.rejects(importPosting(task, f.deps), error => error.code === 'INVALID_RESULT' && error.message.includes(label) && error.message.includes('YYYY-MM-DD'));
      assert.equal(f.writes.length, 0);
    }
  }
});
test('login and verification pause without mutation', async () => {
  for (const action of ['LOGIN', 'CHALLENGE']) {
    const f = fixture([{taskId: task.taskId, action, job: null}]);
    await assert.rejects(importPosting(task, f.deps), error => error.status === 'WAITING_USER');
    assert.equal(f.writes.length, 0);
  }
});
test('invalid or partial identity/body and invented commute are rejected before saving', async () => {
  for (const patch of [{coverage: 'PARTIAL'}, {title: 'Go...'}, {rawJd: '摘要'}, {commuteScore: 10}, {evidence: {}}]) {
    const f = fixture([{taskId: task.taskId, action: 'COMPLETE', job: {...job(), ...patch}}]);
    await assert.rejects(importPosting(task, f.deps)); assert.equal(f.writes.length, 0);
  }
});
test('scroll rebinds fresh pixels and enforces viewport bounds', async () => {
  const scroll = {taskId: task.taskId, action: 'SCROLL', scroll: {x: 600, y: 600, deltaY: -500}, job: null};
  const f = fixture([scroll]); await importPosting(task, f.deps);
  const input = f.workflowCalls.find(c => c.action === 'scroll');
  assert.equal(input.payload.deltaX, 0); assert.equal(input.payload.captureId, 'capture-1');
  assert.throws(() => validateDecision({...scroll, scroll: {x: 600, y: 600, deltaY: -2000}}, task, [capture(1)]), {code: 'INVALID_SCROLL'});
  assert.equal(sameFrame(capture(1), {...capture(1), sha256: 'changed'}), false);
  assert.equal(sameFrame(capture(1), {...capture(1), viewport: {width: 800, height: 1000}}), false);
});
test('pixels changed while model reasons are reread and no stale input is executed', async () => {
  const scroll = {taskId: task.taskId, action: 'SCROLL', scroll: {x: 600, y: 600, deltaY: -500}};
  const f = fixture([scroll]); let count = 0;
  const original = f.deps.workflow;
  f.deps.workflow = async (action, payload) => {
    if (action === 'capture') return capture(++count >= 2 ? 2 : 1);
    return original(action, payload);
  };
  // The image changes on the fresh capture and the old decision must not be executed.
  f.deps.model = async input => input.captures.at(-1).captureId === 'capture-2'
    ? protocol({taskId: task.taskId, action: 'INVALID', pageType: 'NOT_JD'}, input.captures) : protocol(scroll, input.captures);
  await assert.rejects(importPosting(task, f.deps));
  assert.equal(f.workflowCalls.filter(c => c.action === 'scroll').length, 0);
  assert.equal(f.writes.length, 0);
});

test('non-JD, expired job, ambiguous identity and missing continuity never score or write', async () => {
  for (const result of [
    {action: 'INVALID', pageType: 'NOT_JD'}, {action: 'INVALID', pageType: 'UNAVAILABLE'},
    {action: 'COMPLETE', identity: null}, {action: 'COMPLETE', coverage: {start: true, end: true, continuous: false, captureIds: ['capture-1']}},
  ]) {
    const f = fixture([{taskId: task.taskId, job: null, ...result}]);
    await assert.rejects(importPosting(task, f.deps));
    assert.equal(f.calls(), 1); assert.equal(f.writes.length, 0);
  }
  assert.throws(() => strictDecision({taskId: task.taskId, action: 'COMPLETE', job: job()}, task, [capture(1)]), {code: 'INVALID_RESULT'});
});

test('first screenshot validates JD; long JD reads each screen then scores once', async () => {
  const f = fixture(); let screen = 0; const phases = [];
  const original = f.deps.workflow;
  f.deps.workflow = async (action, payload) => {
    if (action === 'capture') return capture(screen ? 2 : 1);
    if (action === 'scroll') screen++;
    return original(action, payload);
  };
  f.deps.model = async input => {
    phases.push(input.mode);
    if (input.mode === 'READ') {
      assert.equal(input.master, undefined);
      return protocol({taskId: task.taskId, action: input.captures.length === 1 ? 'SCROLL' : 'COMPLETE',
        scroll: {x: 600, y: 600, deltaY: -400}, job: null}, input.captures);
    }
    assert(input.master.includes('Kantar'));
    return protocol({taskId: task.taskId, action: 'COMPLETE', job: {...job(), evidence: {...job().evidence, bodyEnd: ['capture-2']}}}, input.captures);
  };
  await importPosting(task, f.deps);
  assert.deepEqual(phases, ['READ', 'READ', 'SCORE']);
  assert.equal(f.writes.filter(w => w.route === '/postings').length, 1);
});

test('durable interrupt resumes in a new checkpointer with fresh screenshots and context', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jd-import-graph-'));
  try {
    const file = path.join(directory, 'checkpoint');
    const f = fixture([{taskId: task.taskId, action: 'LOGIN', job: null}]);
    f.deps.checkpointer = new FileCheckpointer(file);
    await assert.rejects(importPosting(task, f.deps), {code: 'LOGIN_REQUIRED', status: 'WAITING_USER'});
    assert.equal(f.writes.length, 0);
    const resumed = fixture();
    resumed.deps.checkpointer = new FileCheckpointer(file);
    const prior = resumed.deps.workflow;
    resumed.deps.workflow = async (action, payload) => action === 'capture' ? capture(2) : prior(action, payload);
    resumed.deps.model = async input => {
      assert.equal(input.captures.length, 1);
      assert.equal(input.captures[0].captureId, 'capture-2');
      const nextJob = job();
      nextJob.evidence = Object.fromEntries(Object.keys(nextJob.evidence).map(k => [k, ['capture-2']]));
      return protocol({taskId: task.taskId, action: 'COMPLETE', job: nextJob}, input.captures);
    };
    assert.equal((await importPosting(task, resumed.deps)).postingId, 9);
    assert(resumed.workflowCalls.some(c => c.action === 'openJob'));
  } finally { await fs.rm(directory, {recursive: true, force: true}); }
});

test('generic official URL imports as a non-BOSS source and retains query identity', async () => {
  const genericTask = {...task, sourceUrl: 'https://careers.example.com/position?id=42'};
  const f = fixture();
  const prior = f.deps.workflow, priorApi = f.deps.api;
  f.deps.workflow = async (action, payload) => action === 'capture' ? {...capture(1), sourceUrl: genericTask.sourceUrl} : prior(action, payload);
  f.deps.api = async (m, r, b, full) => r === '/postings/9' ? {id: 9, sourceUrl: genericTask.sourceUrl, rawJd: job().rawJd, direction: 'FULL_STACK', stage: 'SCREENED'} : priorApi(m, r, b, full);
  await importPosting(genericTask, f.deps);
  const saved = f.writes.find(w => w.route === '/postings').body;
  assert.equal(saved.source, 'OTHER'); assert.equal(saved.sourceUrl, genericTask.sourceUrl);
});

test('failed READ resumes from disk without reopening the page or repeating completed nodes', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jd-import-retry-'));
  try {
    const file = path.join(directory, 'checkpoint');
    const first = fixture();
    first.deps.checkpointer = new FileCheckpointer(file);
    first.deps.model = async () => { throw new ImportError('CODEX_TIMEOUT', 'fixture timeout'); };
    await assert.rejects(importPosting(task, first.deps), {code: 'CODEX_TIMEOUT'});
    const next = fixture();
    next.deps.checkpointer = new FileCheckpointer(file);
    assert.equal((await importPosting(task, next.deps)).postingId, 9);
    assert.equal(next.workflowCalls.filter(c => c.action === 'openJob').length, 0);
    assert.equal(next.workflowCalls.filter(c => c.action === 'scroll').length, 0);
    assert.equal(next.calls(), 2);
    assert.equal(next.writes.filter(w => w.route === '/postings').length, 1);
  } finally { await fs.rm(directory, {recursive: true, force: true}); }
});

test('second-screen READ timeout retains previous screens and never repeats the completed scroll', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jd-import-read-resume-'));
  t.after(() => fs.rm(directory, {recursive: true, force: true}));
  const file = path.join(directory, 'checkpoint');
  const first = fixture(); let screen = 1;
  first.deps.checkpointer = new FileCheckpointer(file);
  const workflow = first.deps.workflow;
  first.deps.workflow = async (action, payload) => {
    if (action === 'capture') return capture(screen);
    if (action === 'scroll') screen++;
    return workflow(action, payload);
  };
  first.deps.model = async input => {
    if (input.captures.length === 2) throw new ImportError('CODEX_TIMEOUT', 'fixture timeout');
    return protocol({taskId: task.taskId, action: 'SCROLL', scroll: {x: 600, y: 600, deltaY: -400}}, input.captures);
  };
  await assert.rejects(importPosting(task, first.deps), {code: 'CODEX_TIMEOUT'});
  const next = fixture(); const modes = [];
  next.deps.checkpointer = new FileCheckpointer(file);
  next.deps.workflow = async action => { assert.equal(action, 'capture'); return capture(2); };
  next.deps.model = async input => {
    modes.push(input.mode);
    assert.deepEqual(input.captures.map(c => c.captureId), ['capture-1', 'capture-2']);
    return protocol({taskId: task.taskId, action: 'COMPLETE', job: input.mode === 'READ' ? null : job()}, input.captures);
  };
  assert.equal((await importPosting(task, next.deps)).postingId, 9);
  assert.deepEqual(modes, ['READ', 'SCORE']);
  assert.equal(next.writes.filter(w => w.route === '/postings').length, 1);
});

async function scoringTimeout(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jd-import-score-resume-'));
  t.after(() => fs.rm(directory, {recursive: true, force: true}));
  const file = path.join(directory, 'checkpoint');
  const first = fixture();
  first.deps.checkpointer = new FileCheckpointer(file);
  first.deps.model = async input => {
    if (input.mode === 'SCORE') throw new ImportError('CODEX_TIMEOUT', 'fixture timeout');
    return protocol({taskId: task.taskId, action: 'COMPLETE', job: null}, input.captures);
  };
  await assert.rejects(importPosting(task, first.deps), {code: 'CODEX_TIMEOUT'});
  assert.equal(first.writes.length, 0);
  const next = fixture();
  next.deps.checkpointer = new FileCheckpointer(file);
  return {file, next};
}

test('SCORE timeout resumes only scoring in a new worker, keeping capture identities', async t => {
  const {next} = await scoringTimeout(t);
  next.deps.model = async input => {
    assert.equal(input.mode, 'SCORE');
    assert.deepEqual(input.captures.map(c => c.captureId), ['capture-1']);
    return protocol({taskId: task.taskId, action: 'COMPLETE', job: job()}, input.captures);
  };
  assert.equal((await importPosting(task, next.deps)).postingId, 9);
  assert.deepEqual(next.workflowCalls.map(c => c.action), ['capture', 'capture']);
  assert.equal(next.writes.filter(w => w.route === '/postings').length, 1);
});

test('retry refreshes changed master, criteria and directions without rereading complete JD', async t => {
  const {next} = await scoringTimeout(t);
  const api = next.deps.api;
  next.deps.api = async (m, r, b, full) => {
    if (r.includes('/resume-versions?')) return [{id: 2}];
    if (r === '/resume-versions/2') return {id: 2, contentMarkdown: '最新母版正文'};
    if (r === '/criteria') return {version: 'updated', sections: []};
    if (r === '/posting-directions') return [{value: 'FULL_STACK', label: '全栈', description: '最新分类定义'}];
    return api(m, r, b, full);
  };
  next.deps.model = async input => {
    assert.equal(input.mode, 'SCORE');
    assert.equal(input.master, '最新母版正文');
    assert.equal(input.criteria.version, 'updated');
    assert.equal(input.directions[0].description, '最新分类定义');
    return protocol({taskId: task.taskId, action: 'COMPLETE', job: job()}, input.captures);
  };
  assert.equal((await importPosting(task, next.deps)).postingId, 9);
  assert.equal(next.workflowCalls.some(c => c.action === 'openJob'), false);
  assert(next.writes[0].body.riskNotes.includes('评分母版 ID：2'));
});

test('changed pixels, revision, source or geometry discard stale evidence and recollect', async t => {
  const {file} = await scoringTimeout(t);
  const original = await fs.readFile(file);
  for (const patch of [{sha256: 'changed'}, {pageRevision: 2}, {sourceUrl: 'https://example.com/other'},
    {viewport: {width: 720, height: 1000}}, {zoomFactor: 0.8}]) {
    await fs.writeFile(file, original);
    const next = fixture(); let firstCapture = true;
    next.deps.checkpointer = new FileCheckpointer(file);
    const workflow = next.deps.workflow;
    next.deps.workflow = async (action, payload) => {
      if (action === 'capture' && firstCapture) { firstCapture = false; return {...capture(1), ...patch}; }
      return workflow(action, payload);
    };
    assert.equal((await importPosting(task, next.deps)).postingId, 9);
    assert.equal(next.calls(), 2);
    assert.equal(next.workflowCalls.filter(c => c.action === 'openJob').length, 1);
  }
});

test('closed target restarts observation instead of resuming old screenshots', async t => {
  const {next} = await scoringTimeout(t);
  const workflow = next.deps.workflow; let closed = true;
  next.deps.workflow = async (action, payload) => {
    if (action === 'capture' && closed) { closed = false; throw new ImportError('TAB_NOT_FOUND', 'fixture closed', 'WAITING_USER'); }
    return workflow(action, payload);
  };
  assert.equal((await importPosting(task, next.deps)).postingId, 9);
  assert.equal(next.calls(), 2);
  assert.equal(next.workflowCalls.filter(c => c.action === 'openJob').length, 1);
});

test('duplicate discovered before model resume bypasses browser/model and repairs only this task', async t => {
  const {next} = await scoringTimeout(t);
  next.deps.api = async () => [{id: 132, title: '已有岗位', stage: 'APPLIED'}];
  next.deps.repairExisting = async posting => ({postingId: posting.id, message: '本任务知识词已补齐'});
  assert.equal((await importPosting(task, next.deps)).message, '本任务知识词已补齐');
  assert.equal(next.calls(), 0);
  assert.equal(next.workflowCalls.length, 0);
  assert.equal(next.writes.length, 0);
});

test('uncertain scroll failure restarts observation instead of replaying saved coordinates', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jd-import-scroll-retry-'));
  t.after(() => fs.rm(directory, {recursive: true, force: true}));
  const file = path.join(directory, 'checkpoint');
  const first = fixture([{taskId: task.taskId, action: 'SCROLL', scroll: {x: 600, y: 600, deltaY: -400}}]);
  first.deps.checkpointer = new FileCheckpointer(file);
  const workflow = first.deps.workflow;
  first.deps.workflow = async (action, payload) => {
    if (action === 'scroll') throw new ImportError('CLIENT_OPERATION_FAILED', 'fixture uncertain scroll');
    return workflow(action, payload);
  };
  await assert.rejects(importPosting(task, first.deps), {code: 'CLIENT_OPERATION_FAILED'});
  const next = fixture();
  next.deps.checkpointer = new FileCheckpointer(file);
  assert.deepEqual((await createImportGraph(task, next.deps).getState({configurable: {thread_id: task.taskId}})).next, ['scroll']);
  assert.equal((await importPosting(task, next.deps)).postingId, 9);
  assert.equal(next.workflowCalls.filter(c => c.action === 'openJob').length, 1);
  assert.equal(next.workflowCalls.filter(c => c.action === 'scroll').length, 0);
});

test('capture limit, mixed identities and changed scoring context stop before writes', async () => {
  const looping = fixture();
  looping.deps.model = async input => protocol({taskId: task.taskId, action: 'SCROLL', scroll: {x: 600, y: 600, deltaY: -400}, job: null}, input.captures);
  await assert.rejects(importPosting(task, looping.deps), {code: 'CAPTURE_LIMIT'});
  assert.equal(looping.writes.length, 0);
  const mixed = fixture([{taskId: task.taskId, action: 'SCROLL', scroll: {x: 600, y: 600, deltaY: -400}, job: null},
    {taskId: task.taskId, action: 'COMPLETE', identity: {title: '另一个岗位', companyName: '另一家公司'}, job: null}]);
  await assert.rejects(importPosting(task, mixed.deps), {code: 'IDENTITY_CHANGED'});
  assert.equal(mixed.writes.length, 0);
  const changed = fixture(); let calls = 0; const prior = changed.deps.api;
  changed.deps.api = async (method, route, body, full) => route === '/criteria' ? {version: ++calls} : prior(method, route, body, full);
  await assert.rejects(importPosting(task, changed.deps), {code: 'SCORING_CONTEXT_CHANGED'});
  assert.equal(changed.writes.length, 0);
});
test('ambiguous companies are not created or merged; missing terms preserves saved JD', async () => {
  const f = fixture(); const original = f.deps.api;
  f.deps.api = async (m, r, b, full) => r.startsWith('/companies?')
    ? {result: [{id: 1, name: '夹具公司'}, {id: 2, alias: '夹具公司', name: '另一个法定名'}], page: {totalElements: 2}}
    : original(m, r, b, full);
  await assert.rejects(importPosting(task, f.deps), {code: 'AMBIGUOUS_COMPANY'}); assert.equal(f.writes.length, 0);
  const g = fixture(); const prior = g.deps.api;
  g.deps.api = async (m, r, b, full) => { if (r.endsWith('/terms') && m === 'PUT') throw Error('fixture'); return prior(m, r, b, full); };
  assert.equal((await importPosting(task, g.deps)).status, 'PARTIAL');
  assert.equal(g.writes.filter(w => w.route === '/postings').length, 1);
});
test('no master prevents browser work; Codex has no shell/web/app browser capabilities', async () => {
  const f = fixture(); const original = f.deps.api;
  f.deps.api = async (m, r) => r.includes('/resume-versions?') ? [] : original(m, r);
  await assert.rejects(importPosting(task, f.deps), {code: 'MASTER_REQUIRED'});
  assert.equal(f.workflowCalls.length, 0);
  const args = codexArguments('fixture', [], 'gpt-6-astra', 'medium');
  assert.ok(args.includes('--ignore-user-config')); assert.ok(args.includes('shell_tool'));
  assert.ok(args.includes('browser_use')); assert.ok(args.includes('read-only'));
});

const proposal = () => ({label: '数据工程', description: '以数据管道、数仓和数据处理为核心职责', reason: 'JD核心为数据管道与数仓建设，现有应用、平台和测试开发分类均不适用'});
test('unmatched direction is submitted atomically with the JD and read back from the registry', async () => {
  const f = fixture([{taskId: task.taskId, action: 'COMPLETE', job: {...job(), direction: null, newDirection: proposal()}}]);
  const model = f.deps.model;
  f.deps.model = async input => {
    if (input.mode === 'SCORE') assert.equal(input.directions[0].value, 'FULL_STACK');
    return model(input);
  };
  assert.equal((await importPosting(task, f.deps)).postingId, 9);
  const write = f.writes.find(w => w.route === '/postings');
  assert.equal(write.body.direction, null);
  assert.deepEqual(write.body.newDirection, proposal());
  assert.equal(f.writes.some(w => w.route === '/posting-directions'), false);
  assert.equal(f.records.get('classified-direction').newDirection.label, '数据工程');
});

test('new direction with normalized existing label reuses its code', async () => {
  const f = fixture([{taskId: task.taskId, action: 'COMPLETE', job: {...job(), direction: null,
    newDirection: {...proposal(), label: ' 全 栈 '}}}]);
  await importPosting(task, f.deps);
  const write = f.writes.find(w => w.route === '/postings');
  assert.equal(write.body.direction, 'FULL_STACK');
  assert.equal(write.body.newDirection, null);
});

test('already added dynamic category is reusable without another proposal', async () => {
  const f = fixture([{taskId: task.taskId, action: 'COMPLETE', job: {...job(), direction: 'DIR_existing'}}]);
  const api = f.deps.api;
  f.deps.api = async (m, r, b, full) => r === '/posting-directions'
    ? [{value: 'DIR_existing', label: '数据工程'}] : api(m, r, b, full);
  await importPosting(task, f.deps);
  assert.equal(f.writes.find(w => w.route === '/postings').body.direction, 'DIR_existing');
});

test('unknown code or incomplete new category fails before any mutation', async () => {
  for (const category of [{direction: 'INVENTED'}, {direction: null, newDirection: {...proposal(), reason: ''}},
    {direction: 'FULL_STACK', newDirection: proposal()}]) {
    const f = fixture([{taskId: task.taskId, action: 'COMPLETE', job: {...job(), ...category}}]);
    await assert.rejects(importPosting(task, f.deps), {code: 'INVALID_DIRECTION'});
    assert.equal(f.writes.length, 0);
  }
});

test('company metadata errors identify the field instead of suggesting a new direction', async () => {
  for (const [field, value] of [['businessType', 'OTHER'], ['productOwnership', null], ['blockingRisk', 'false']]) {
    const f = fixture([{taskId: task.taskId, action: 'COMPLETE', job: {...job(), [field]: value}}]);
    await assert.rejects(importPosting(task, f.deps), error => error.code === 'INVALID_RESULT' && error.message.includes(field));
    assert.equal(f.writes.length, 0);
  }
});

test('concurrent category creation retries once using the committed category', async () => {
  const f = fixture([{taskId: task.taskId, action: 'COMPLETE', job: {...job(), direction: null, newDirection: proposal()}}]);
  const api = f.deps.api; let raced = false;
  f.deps.api = async (m, r, b, full) => {
    if (r === '/postings' && m === 'POST' && !raced) {
      raced = true;
      throw Object.assign(Error('category exists'), {httpStatus: 409});
    }
    if (r === '/posting-directions' && raced) return [{value: 'DIR_existing', ...proposal()}];
    return api(m, r, b, full);
  };
  assert.equal((await importPosting(task, f.deps)).postingId, 9);
  assert.equal(f.writes.find(w => w.route === '/postings').body.direction, 'DIR_existing');
  assert.equal(f.writes.find(w => w.route === '/postings').body.newDirection, null);
});
