import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';

const {code} = await transform(await readFile(new URL('../../src/common/desktop/client.ts', import.meta.url), 'utf8'), {loader: 'ts', format: 'esm', target: 'es2020'});
const {desktop, DesktopError} = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

test('web fallback rejects desktop requests and allows subscription cleanup', async () => {
  assert.equal(desktop.available(), false);
  await assert.rejects(desktop.request('runtime.info', {}), error => error instanceof DesktopError && error.code === 'DESKTOP_UNAVAILABLE');
  desktop.on('window.changed', () => assert.fail('Web fallback should not emit'))();
});

test('bridge unwraps results, preserves errors and supports event cleanup', async () => {
  let listener;
  let unsubscribed = false;
  globalThis.window = {jdDesktop: {
    request: async command => command === 'runtime.info' ? {ok: true, data: {version: 'fixture', platform: 'win32'}} : {ok: false, error: {code: 'INVALID_INPUT', message: '测试校验失败'}},
    onEvent: callback => { listener = callback; return () => { unsubscribed = true; listener = undefined; }; },
  }};
  try {
    assert.deepEqual(await desktop.request('runtime.info', {}), {version: 'fixture', platform: 'win32'});
    await assert.rejects(desktop.request('browser.close', {key: ''}), error => error.code === 'INVALID_INPUT');
    const events = [];
    const off = desktop.on('window.changed', event => events.push(event));
    listener({type: 'browser.changed', payload: {key: 'ignored'}});
    listener({type: 'window.changed', payload: {maximized: true, minimized: false}});
    assert.deepEqual(events, [{maximized: true, minimized: false}]);
    off(); assert.equal(unsubscribed, true);
  } finally { delete globalThis.window; }
});
