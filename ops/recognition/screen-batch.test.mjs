import test from 'node:test';
import assert from 'node:assert/strict';
import {validateTask, fingerprint} from './queue.mjs';
import {processScreenBatch, validateScreenResult} from './screen-batch.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {taskFromScreenPlan} from './screen.mjs';
import {reusableScreenPhase} from './worker.mjs';
import {duplicateKey, findListDuplicates, normalizeCompany, normalizeTitle} from './screen-dedupe.mjs';

function task() {
  return {schemaVersion: 1, taskId: 'screen-test', platform: 'BOSS', mode: 'SCREEN_BATCH',
    requestedFields: [], criteria: 'AI应用或全栈开发', listCaptureId: 'list',
    cards: [1, 2].map(n => ({cardId: 'card-' + n, listBbox: [0, (n - 1) / 2, 1, 0.5], detailCaptureIds: ['detail-' + n]})),
    captures: ['list', 'detail-1', 'detail-2'].map((captureId, i) => ({captureId, platform: 'BOSS',
      sha256: 'a'.repeat(64), image: {width: 100, height: 100}, sequence: i + 1,
      sourceUrl: 'https://www.zhipin.com/web/geek/jobs'}))};
}
function card(id, decision, captureId, extra = {}) {
  return {cardId: id, title: '岗位', company: '公司', salary: '15-20K', decision, reason: '截图依据',
    evidence: [{captureId, bbox: [0, 0, 1, 1]}], ...extra};
}

test('each preview belongs to exactly one list card; mappings participate in deduplication', () => {
  const t = task();
  validateTask(t);
  const changed = structuredClone(t);
  changed.cards.reverse();
  assert.notEqual(fingerprint(t), fingerprint(changed));
  changed.cards[0].detailCaptureIds = changed.cards[1].detailCaptureIds;
  assert.throws(() => validateTask(changed), /INVALID_CARD_MAPPING/);
  assert.throws(() => validateTask({...t, captures: t.captures.slice(0, 2)}), /INVALID_CARD_MAPPING/);
});

test('list exclusions never send their preview to the detail model; missing URL does not force recapture', async () => {
  const t = task();
  const calls = [];
  const result = await processScreenBatch(t, async (phase, cards, captures) => {
    calls.push({phase, ids: captures.map(c => c.captureId)});
    return {taskId: t.taskId, phase, pageStatus: 'READABLE', cards: phase === 'LIST' ? [
      card('card-1', 'EXCLUDE', 'list'), card('card-2', 'READ_DETAIL', 'list'),
    ] : [card('card-2', 'KEEP', 'detail-2', {identity: 'MATCH', summary: 'AI应用职责',
      missingForArchive: ['sourceUrl', '通勤'], nextCapture: null})]};
  });
  assert.deepEqual(calls, [{phase: 'LIST', ids: ['list']}, {phase: 'DETAIL', ids: ['detail-2']}]);
  assert.deepEqual(result.counts, {total: 2, detailRead: 1, kept: 1, excluded: 1, duplicates: 0, needsMore: 0});
  assert.equal(result.candidates[1].sourceUrl, null);
  assert.equal(result.formalPostingWrites, 0);
});

test('list identity dedupe skips known previews before the detail model', async () => {
  const t = task();
  const calls = [];
  const result = await processScreenBatch(t, async (phase, cards, captures) => {
    calls.push({phase, ids: captures.map(c => c.captureId)});
    return {taskId: t.taskId, phase, pageStatus: 'READABLE', cards: phase === 'LIST' ? [
      card('card-1', 'READ_DETAIL', 'list', {company: '姚记潮品有限公司', title: '全栈开发工程师'}),
      card('card-2', 'READ_DETAIL', 'list', {company: '本原智数', title: 'AI产品全栈开发工程师（Java）'}),
    ] : [card('card-2', 'KEEP', 'detail-2', {identity: 'MATCH', summary: '全栈职责',
      missingForArchive: [], nextCapture: null})]};
  }, listCards => findListDuplicates(t, listCards, {entries: [
    {matchType: 'DATABASE', postingId: 90, company: '姚记潮品', title: '全栈开发工程师'},
    {matchType: 'DATABASE', postingId: 86, company: '本原智数', title: 'AI产品全栈开发工程师（Python）'},
  ], metadata: {databaseEntries: 2, sessionEntries: 0, warnings: []}}));
  assert.deepEqual(calls, [{phase: 'LIST', ids: ['list']}, {phase: 'DETAIL', ids: ['detail-2']}]);
  assert.equal(result.candidates[0].decision, 'DUPLICATE');
  assert.equal(result.candidates[0].duplicateOf.postingId, 90);
  assert.equal(result.candidates[1].decision, 'KEEP');
  assert.deepEqual(result.counts, {total: 2, detailRead: 1, kept: 1, excluded: 0, duplicates: 1, needsMore: 0});
});

test('dedupe keeps direction parentheses and refuses truncated identities', () => {
  assert.equal(normalizeCompany(' 姚记潮品有限公司 '), normalizeCompany('姚记潮品'));
  assert.notEqual(normalizeTitle('全栈工程师（偏Agent前端）'), normalizeTitle('全栈工程师（Java）'));
  assert.equal(duplicateKey('BOSS', '公司...', '全栈工程师'), null);
  assert.equal(duplicateKey('BOSS', '公司', '全栈工程师（Java'), null);
});

test('wrong card evidence and stale details cannot be approved', () => {
  const t = task();
  const result = {taskId: t.taskId, phase: 'DETAIL', pageStatus: 'READABLE',
    cards: [card('card-1', 'KEEP', 'detail-2', {identity: 'MATCH', summary: '', missingForArchive: [], nextCapture: null})]};
  assert.throws(() => validateScreenResult(result, t, [t.cards[0]], 'DETAIL'), /INVALID_SCREEN_EVIDENCE/);
  result.cards[0].evidence[0].captureId = 'detail-1';
  result.cards[0].identity = 'MISMATCH';
  assert.throws(() => validateScreenResult(result, t, [t.cards[0]], 'DETAIL'), /INVALID_SCREEN_DETAIL/);
  result.cards[0].decision = 'NEEDS_MORE';
  result.cards[0].nextCapture = '重新点击并确认右侧标题';
  validateScreenResult(result, t, [t.cards[0]], 'DETAIL');
});

test('all-excluded list ends without detail calls and unreadable pages never succeed', async () => {
  const t = task();
  let calls = 0;
  const result = await processScreenBatch(t, async phase => {
    calls++;
    assert.equal(phase, 'LIST');
    return {taskId: t.taskId, phase, pageStatus: 'READABLE', cards: t.cards.map(c => card(c.cardId, 'EXCLUDE', 'list'))};
  });
  assert.equal(calls, 1);
  assert.equal(result.counts.excluded, 2);
  await assert.rejects(processScreenBatch(t, async phase => ({taskId: t.taskId, phase, pageStatus: 'CHALLENGE', cards: []})),
    /INVALID_SCREEN_PAGE_CHALLENGE/);
});

test('retry reuses only validated results with exactly the same prompt, mapping, criteria and model', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'jd-screen-cache-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const input = task();
  const result = {taskId: input.taskId, phase: 'LIST', pageStatus: 'READABLE',
    cards: input.cards.map(c => card(c.cardId, 'EXCLUDE', 'list'))};
  await fs.writeFile(path.join(root, 'prompt.txt'), 'exact prompt with task data');
  await fs.writeFile(path.join(root, 'raw-result.json'), JSON.stringify(result));
  await fs.writeFile(path.join(root, 'invocation.json'), JSON.stringify({model: 'gpt-6-astra', reasoningEffort: 'medium'}));
  assert.ok(await reusableScreenPhase(root, 'exact prompt with task data', input, input.cards, 'LIST'));
  assert.equal(await reusableScreenPhase(root, 'exact prompt with task data', input, input.cards, 'LIST',
    {model: 'example-vision-model', reasoningEffort: 'medium'}), null);
  assert.equal(await reusableScreenPhase(root, 'exact prompt with task data', input, input.cards, 'LIST',
    {model: 'gpt-6-astra', reasoningEffort: 'high'}), null);
  assert.equal(await reusableScreenPhase(root, 'changed criteria', input, input.cards, 'LIST'), null);
  result.cards[0].evidence[0].bbox = [0.4, 0, 0.9, 1];
  await fs.writeFile(path.join(root, 'raw-result.json'), JSON.stringify(result));
  assert.equal(await reusableScreenPhase(root, 'exact prompt with task data', input, input.cards, 'LIST'), null);
});

test('screen plan preserves native metadata and requires explicit IDs for multi-capture manifests', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'jd-screen-plan-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const input = task();
  await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify({captures: input.captures}));
  const ref = captureId => ({manifest: 'manifest.json', captureId});
  const plan = {taskId: input.taskId, criteria: input.criteria, list: ref('list'),
    cards: input.cards.map(c => ({cardId: c.cardId, listBbox: c.listBbox, detail: ref(c.detailCaptureIds[0])}))};
  const assembled = await taskFromScreenPlan(plan, root);
  validateTask(assembled);
  assert.deepEqual(assembled.captures, input.captures);
  delete plan.list.captureId;
  await assert.rejects(taskFromScreenPlan(plan, root), /AMBIGUOUS_CAPTURE_REFERENCE/);
});
