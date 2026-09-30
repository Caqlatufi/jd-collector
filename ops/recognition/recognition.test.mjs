import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {enqueue, hash} from './queue.mjs';
import {runProcess, codexArguments} from './worker.mjs';
import {recognitionSettings} from './settings.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'jd-recognition-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jAfcAAAAASUVORK5CYII=', 'base64');
  const filePath = path.join(root, 'source.png');
  await fs.writeFile(filePath, bytes);
  return {root, task: {schemaVersion: 1, taskId: 'job-1', platform: 'BOSS', mode: 'DETAIL', requestedFields: [],
    captures: [{captureId: 'capture-1', platform: 'BOSS', filePath, sha256: hash(bytes),
      image: {width: 1, height: 1}, sequence: 1, sourceUrl: 'https://www.zhipin.com/job_detail/test.html'}]}};
}

test('publishes an immutable batch, deduplicates resubmission and rejects conflicting IDs', async t => {
  const {root, task} = await fixture(t);
  const result = await enqueue(task, root);
  const saved = JSON.parse(await fs.readFile(path.join(result.directory, 'task.json')));
  await fs.writeFile(task.captures[0].filePath, 'source changed');
  assert.equal(hash(await fs.readFile(saved.captures[0].filePath)), task.captures[0].sha256);
  assert.equal((await enqueue(task, root)).duplicate, true);
  await assert.rejects(enqueue({...task, scope: 'changed'}, root), /TASK_ID_CONFLICT/);
});

test('incomplete or tampered batches never become visible jobs', async t => {
  const {root, task} = await fixture(t);
  task.captures[0].sha256 = '0'.repeat(64);
  await assert.rejects(enqueue(task, root), /CAPTURE_HASH_OR_SIZE_MISMATCH/);
  assert.deepEqual((await fs.readdir(path.join(root, 'jobs'))).filter(x => !x.startsWith('.')), []);
  await assert.rejects(enqueue({...task, captures: []}, root), /INVALID_TASK/);
});

test('different job sources cannot be merged into one detail', async t => {
  const {root, task} = await fixture(t);
  task.captures.push({...task.captures[0], captureId: 'capture-2', sourceUrl: 'https://www.zhipin.com/job_detail/other.html'});
  await assert.rejects(enqueue(task, root), /MIXED_JOB_SOURCES/);
});

test('CLI receives the requested model, effort and every original image', async t => {
  const {root, task} = await fixture(t);
  const args = codexArguments(task, root, path.join(root, 'result.json'));
  assert.equal(args[args.indexOf('--model') + 1], 'gpt-6-astra');
  assert.ok(args.includes('model_reasoning_effort="medium"'));
  assert.equal(args[args.indexOf('--image') + 1], task.captures[0].filePath);
});

test('configured recognition parameters reach the CLI and unsafe settings are rejected', async t => {
  const {root, task} = await fixture(t);
  const settings = recognitionSettings({JD_RECOGNITION_MODEL: 'example-vision-model', JD_RECOGNITION_REASONING_EFFORT: 'high'});
  const args = codexArguments(task, root, path.join(root, 'result.json'), settings);
  assert.equal(args[args.indexOf('--model') + 1], 'example-vision-model');
  assert.ok(args.includes('model_reasoning_effort="high"'));
  assert.throws(() => recognitionSettings({JD_RECOGNITION_REASONING_EFFORT: 'high"; injected'}), /INVALID_RECOGNITION_SETTINGS/);
  assert.throws(() => recognitionSettings({JD_RECOGNITION_MODEL: 'model with flags'}), /INVALID_RECOGNITION_SETTINGS/);
});

test('a timed-out CLI process is terminated before failure is recorded', async t => {
  const {root} = await fixture(t);
  const pidFile = path.join(root, 'child.pid');
  await assert.rejects(runProcess(process.execPath, ['-e',
    'require("fs").writeFileSync(process.argv[1],String(process.pid));setInterval(()=>{},1000)', pidFile], '', root, 1000), /CODEX_TIMEOUT/);
  const pid = Number(await fs.readFile(pidFile, 'utf8'));
  assert.throws(() => process.kill(pid, 0));
});

test('terminal CLI failure is preserved instead of a success record', async t => {
  const {root} = await fixture(t);
  await assert.rejects(runProcess(process.execPath, ['-e', 'process.exit(7)'], '', root, 5000), /CODEX_EXIT_7/);
});
