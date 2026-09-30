import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {build} from 'esbuild';

// Native/file failure injection only. Real Electron is exercised by capture.spec.ts separately.
const compiled = await build({entryPoints: ['src/common/desktop/main/capture.ts'], bundle: true, write: false,
  format: 'esm', platform: 'node', plugins: [{name: 'native-fixture', setup(builder) {
    builder.onResolve({filter: /^(electron|\.\/browserWindows)$/}, args => ({path: args.path, namespace: 'fixture'}));
    builder.onLoad({filter: /.*/, namespace: 'fixture'}, args => ({contents: args.path === 'electron'
      ? 'export const screen={getDisplayMatching:()=>({scaleFactor:1})};'
      : 'export class PlatformOperationError extends Error {constructor(code,message){super(message);this.code=code}}', loader: 'js'}));
  }}]});
const {VisualCapture} = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const request = {platform: 'BOSS', key: 'fixture'};
const bounds = {x: 0, y: 0, width: 800, height: 600};
const png = Buffer.alloc(32); png.writeUInt32BE(800, 16); png.writeUInt32BE(600, 20);
const native = {isEmpty: () => false, toPNG: () => png, toBitmap: () => Buffer.from('pixels')};
function setup(root, capturePage = async () => native) {
  const target = {revision: 1, epoch: 0, sourceUrl: 'https://www.zhipin.com/job_detail/fixture.html', title: 'fixture',
    host: {getBounds: () => bounds}, view: {getBounds: () => bounds, webContents: {capturePage, getZoomFactor: () => 1}}};
  return {target, visual: new VisualCapture(root, () => ({...target}))};
}
test('timeout retains native lock and rejects late publication', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'jd-late-capture-'));
  let release;
  const {visual} = setup(root, () => new Promise(resolve => { release = resolve; }));
  const pending = visual.capture(request);
  await assert.rejects(pending, error => error.code === 'CAPTURE_TIMEOUT');
  await assert.rejects(visual.capture(request), error => error.code === 'READ_BUSY');
  release(native);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(await readdir(root), []);
  visual.dispose();
});
test('write failure never returns a valid capture', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'jd-write-failure-'));
  const root = path.join(temporary, 'file-not-directory'); await writeFile(root, 'fixture');
  const {visual} = setup(root);
  await assert.rejects(visual.capture(request), error => error.code === 'CAPTURE_WRITE_FAILED');
  visual.dispose();
});
test('empty native image fails explicitly', async () => {
  const {visual} = setup(await mkdtemp(path.join(tmpdir(), 'jd-empty-capture-')), async () => ({isEmpty: () => true}));
  await assert.rejects(visual.capture(request), error => error.code === 'CAPTURE_EMPTY'); visual.dispose();
});
test('navigation or disposal invalidates a pending capture', async () => {
  for (const change of ['navigation', 'dispose']) {
    let release;
    const {visual, target} = setup(await mkdtemp(path.join(tmpdir(), 'jd-changed-capture-')),
      () => new Promise(resolve => { release = resolve; }));
    const pending = visual.capture(request);
    await new Promise(resolve => setTimeout(resolve, 0));
    if (change === 'navigation') target.revision++; else visual.dispose();
    release(native);
    await assert.rejects(pending, error => error.code === (change === 'navigation' ? 'PAGE_CHANGED' : 'TAB_NOT_FOUND'));
    visual.dispose();
  }
});
test('oversized image is rejected without silent downsampling', async () => {
  const large = Buffer.from(png); large.writeUInt32BE(8193, 16);
  const {visual} = setup(await mkdtemp(path.join(tmpdir(), 'jd-large-capture-')), async () => ({...native, toPNG: () => large}));
  await assert.rejects(visual.capture(request), error => error.code === 'CAPTURE_TOO_LARGE'); visual.dispose();
});
