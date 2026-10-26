import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverCompanyAddress} from './address-graph.mjs';
import {FileCheckpointer} from './checkpointer.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const task = {taskId: 'c48a6fba-9110-483d-b74a-4f2881fc6e25', companyId: 1, companyName: '地址夹具公司', tabKey: 'company-address:fixture'};
const posting = {id: 2, companyId: 1, sourceUrl: 'https://careers.example.com/jobs/42', title: '数据工程师', location: '上海'};
const address = '上海市徐汇区虹梅路1801号';
const found = (type = 'JOB_OFFICE') => ({taskId: task.taskId, action: 'FOUND', pageType: type === 'JOB_OFFICE' ? 'OFFICIAL' : 'SEARCH',
  companyConfirmed: true, companyName: task.companyName, title: posting.title, address, addressType: type,
  evidenceText: '地址夹具公司上海办公地点：' + address, evidenceCaptureIds: ['c-1']});
function fixture(decisions = [found()], noJd = false) {
  const calls = [], frames = []; let sourceUrl = ''; let location = posting.location; let saved;
  const deps = {wait: async () => {}, remember: async () => {}, progress: async () => {},
    workflow: async (action, data) => {
      calls.push({action, data});
      if (action === 'info') return {genericJobCapture: true, companyAddressCapture: true};
      if (action === 'openJob') { sourceUrl = data.url; return {}; }
      if (action === 'tabs') return [{key: task.tabKey, status: 'ready'}];
      if (action === 'capture') return {captureId: 'c-1', key: task.tabKey, sourceUrl, pageRevision: sourceUrl,
        sha256: 'pixels', viewport: {width: 1000, height: 800}, rect: {x: 0, y: 0, width: 1000, height: 800}, zoomFactor: 1};
      return {};
    },
    model: async input => {
      frames.push(input);
      const value = structuredClone(decisions.shift() || found());
      if (value.action === 'NO_ADDRESS' && !value.coverage) value.coverage = {start: true, end: true, continuous: true,
        captureIds: input.captures.map(c => c.captureId)};
      return value;
    },
    api: async (method, route, body) => {
      calls.push({method, route, body});
      if (route === '/companies/1') return {id: 1, name: task.companyName};
      if (route === '/companies/address-discoveries') return saved ? [saved] : [];
      if (route.startsWith('/postings?')) return {result: noJd ? [] : [posting], page: {totalPages: 1}};
      if (route.endsWith('/address-discoveries') && method === 'POST') {
        const isJd = route.startsWith('/postings/');
        saved = {id: 3, companyId: 1, taskId: task.taskId, address: body.address, sourceType: isJd ? 'JD' : 'COMPANY'};
        if (isJd) location = body.address;
        return saved;
      }
      if (route === '/postings/2') return {...posting, location};
      if (route === '/companies/location-positions') return {address, longitude: 121.4, latitude: 31.2};
      throw Error('Unexpected route ' + route);
    },
  };
  return {deps, calls, frames, writes: () => calls.filter(c => c.method === 'POST')};
}

test('reads JD first and saves only the exact posting address plus provenance', async () => {
  const f = fixture();
  const result = await discoverCompanyAddress(task, f.deps);
  assert.equal(result.sourceType, 'JD');
  assert.equal(result.address, address);
  assert.equal(f.calls.find(c => c.action === 'openJob').data.url, posting.sourceUrl);
  assert.equal(f.writes()[0].route, '/postings/2/address-discoveries');
  assert.equal(f.writes()[0].body.expectedLocation, '上海');
  assert.equal(f.writes()[0].body.expectedCompanyName, task.companyName);
});
test('official JD without an address goes directly to company search and preserves JD location', async () => {
  const f = fixture([{taskId: task.taskId, action: 'NO_ADDRESS', pageType: 'OFFICIAL'}, found('COMPANY_OFFICE')]);
  const result = await discoverCompanyAddress(task, f.deps);
  assert.equal(result.sourceType, 'COMPANY');
  const opened = f.calls.filter(c => c.action === 'openJob');
  assert.equal(opened[0].data.url, posting.sourceUrl);
  assert(opened[1].data.url.startsWith('https://cn.bing.com/search?q='));
  assert.equal(f.writes()[0].route, '/companies/1/address-discoveries');
  assert.equal(f.writes()[0].body.expectedPostingUrl, undefined);
  assert.equal(f.writes().some(c => c.route.startsWith('/postings')), false);
});
test('no JD link queries company address directly', async () => {
  const f = fixture([found('COMPANY_OFFICE')], true);
  assert.equal((await discoverCompanyAddress(task, f.deps)).sourceType, 'COMPANY');
  assert.equal(f.frames[0].target.kind, 'SEARCH');
});
test('registration, other companies, other cities, districts and wrong jobs never write', async () => {
  for (const override of [{addressType: 'REGISTERED'}, {companyName: '另一家公司'}, {address: '上海·闵行区'},
    {address: '北京市朝阳区建国路1号'}, {title: '其他岗位'}, {evidenceCaptureIds: ['invented']}, {companyConfirmed: false}]) {
    const f = fixture([{...found(), ...override}]);
    await assert.rejects(discoverCompanyAddress(task, f.deps));
    assert.equal(f.writes().length, 0);
  }
});
test('missing page coverage cannot trigger an official-page fallback search', async () => {
  const f = fixture([{taskId: task.taskId, action: 'NO_ADDRESS', pageType: 'OFFICIAL', coverage: {start: true, end: false}}]);
  await assert.rejects(discoverCompanyAddress(task, f.deps), {code: 'INCOMPLETE_ADDRESS_PAGE'});
  assert.equal(f.calls.filter(c => c.action === 'openJob').length, 1);
});
test('login pauses durably and resumes with new observations', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'address-graph-'));
  try {
    const file = path.join(directory, 'graph.checkpoint');
    const f = fixture([{taskId: task.taskId, action: 'LOGIN', pageType: 'LOGIN'}]);
    f.deps.checkpointer = new FileCheckpointer(file);
    await assert.rejects(discoverCompanyAddress(task, f.deps), {code: 'LOGIN_REQUIRED', status: 'WAITING_USER'});
    assert.equal(f.writes().length, 0);
    const resumed = fixture(); resumed.deps.checkpointer = new FileCheckpointer(file);
    assert.equal((await discoverCompanyAddress(task, resumed.deps)).address, address);
    assert(resumed.calls.some(c => c.action === 'openJob'));
  } finally { await fs.rm(directory, {force: true, recursive: true}); }
});
test('unsafe scroll and navigation before save do not execute stale input or mutation', async () => {
  const f = fixture([{taskId: task.taskId, action: 'SCROLL', pageType: 'OFFICIAL', scroll: {x: 1, y: 1, deltaY: -9000}}]);
  await assert.rejects(discoverCompanyAddress(task, f.deps), {code: 'INVALID_SCROLL'});
  assert.equal(f.calls.some(c => c.action === 'scroll'), false);
  assert.equal(f.writes().length, 0);
});
test('optional geocoding failure preserves address and reports coordinates are pending', async () => {
  const f = fixture(); const api = f.deps.api;
  f.deps.api = async (m, r, b) => { if (r === '/companies/location-positions') throw Error('offline'); return api(m, r, b); };
  const result = await discoverCompanyAddress(task, f.deps);
  assert.equal(result.address, address); assert.equal(result.positioned, false);
});
