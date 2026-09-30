import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseOptions, validateStep, validateGeometry, executeStep} from '../../src/common/desktop/main/visualFilterRunner.mjs';
const ref = {engine: 'electron-native-v1', key: 'one', platform: 'BOSS', captureId: 'fresh', viewport: {width: 1000, height: 700},
  zoomFactor: 1, displayScaleFactor: 1, sourceUrl: 'https://www.zhipin.com/web/geek/jobs',
  rect: {x: 10, y: 20, width: 100, height: 50}, sha256: 'pixels'};
const step = {...ref, kind: 'click', x: 40, y: 35};
function fixture(current = ref) {
  const events = [];
  return {events, request: async (_platform, action, payload) => {
    if (action === 'capture') return current;
    events.push({action, payload}); return {accepted: true};
  }};
}
test('strict options and bounded native action validation', () => {
  assert.deepEqual(parseOptions(['--key', 'one']), {key: 'one'});
  for (const args of [['--url', 'https://x'], ['--key', 'one', '--key', 'two'], ['--key']]) assert.throws(() => parseOptions(args));
  for (const change of [{x: 999}, {kind: 'evaluate'}, {kind: 'text', text: 'a\nb'}, {kind: 'wheel', delta: 9000}, {kind: 'key', keyCode: 'F12'}])
    assert.throws(() => validateStep({...step, ...change}));
});
test('changed pixels, geometry, scale and old recipes reject before input', async () => {
  assert.throws(() => validateGeometry({...ref, zoomFactor: 1.2}, step), /LAYOUT_CHANGED/);
  for (const change of [{sha256: 'changed'}, {displayScaleFactor: 2}]) {
    const {request, events} = fixture({...ref, ...change});
    await assert.rejects(executeStep(request, 'BOSS', 'one', step), /ANCHOR_CHANGED/);
    assert.deepEqual(events, []);
  }
  const {request, events} = fixture();
  for (const change of [{engine: undefined}, {platform: 'LIEPIN'}, {key: 'other'}])
    await assert.rejects(executeStep(request, 'BOSS', 'one', {...step, ...change}), /RECALIBRATION_REQUIRED/);
  assert.deepEqual(events, []);
});
test('actions bind fresh capture; replacing text does not submit', async () => {
  const {request, events} = fixture();
  await executeStep(request, 'BOSS', 'one', step);
  await executeStep(request, 'BOSS', 'one', {...step, kind: 'text', text: 'AI应用开发'});
  assert.deepEqual(events.map(event => event.action), ['click', 'click', 'type']);
  assert.ok(events.every(event => event.payload.captureId === 'fresh'));
  assert.equal(events.at(-1).payload.replace, true);
  await executeStep(request, 'BOSS', 'one', {...step, kind: 'wheel', delta: 200});
  assert.equal(events.at(-1).payload.deltaY, -200);
});
test('native stale rejection propagates without input retry', async () => {
  let inputs = 0;
  await assert.rejects(executeStep(async (_platform, action) => {
    if (action === 'capture') return ref;
    inputs++; throw Error('STALE_CAPTURE');
  }, 'BOSS', 'one', step), /STALE_CAPTURE/);
  assert.equal(inputs, 1);
});
test('platform runner has no content reading or debugger connection', async () => {
  const source = await readFile('src/common/desktop/main/visualFilterRunner.mjs', 'utf8');
  assert.doesNotMatch(source, /\.(?:locator|getByText|getByRole|evaluate|evaluateHandle|content|innerText|textContent|ariaSnapshot|waitForResponse|connectOverCDP)\s*\(/);
});
