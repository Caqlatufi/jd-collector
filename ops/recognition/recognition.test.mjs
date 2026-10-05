import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {enqueue, hash} from './queue.mjs';
import {runProcess, codexArguments} from './worker.mjs';
import {recognitionSettings} from './settings.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'jd-recognition-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC', 'base64');
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

test('actual CLI loads every image and reads stdin without treating the prompt marker as an image',
  {skip: !process.env.JD_RECOGNITION_TEST_CODEX}, async t => {
    const {root, task} = await fixture(t);
    const secondImage = path.join(root, 'second image.png');
    await fs.copyFile(task.captures[0].filePath, secondImage);
    task.captures.push({...task.captures[0], captureId: 'capture-2', filePath: secondImage});
    const cliHome = path.join(root, 'cli-home');
    await fs.mkdir(cliHome);
    let requestBody;
    // A local Responses fixture captures CLI input and stops before any model inference.
    const server = http.createServer((request, response) => {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', chunk => { body += chunk; });
      request.on('end', () => {
        if (request.url === '/v1/responses') requestBody = JSON.parse(body);
        response.writeHead(400, {'content-type': 'application/json'});
        response.end(JSON.stringify({error: {type: 'invalid_request_error', message: 'LOCAL_FIXTURE_STOP'}}));
      });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => { server.closeAllConnections(); server.close(); });
    const args = codexArguments(task, root, path.join(root, 'result.json'));
    args.splice(1, 0, '--ignore-user-config', '--ignore-rules', '--ephemeral',
      '-c', 'model_provider="image_fixture"',
      '-c', 'model_providers.image_fixture.name="Local image fixture"',
      '-c', `model_providers.image_fixture.base_url="http://127.0.0.1:${server.address().port}/v1"`,
      '-c', 'model_providers.image_fixture.wire_api="responses"',
      '-c', 'model_providers.image_fixture.requires_openai_auth=false',
      '-c', 'model_providers.image_fixture.supports_websockets=false');
    const child = spawn(process.env.JD_RECOGNITION_TEST_CODEX, args, {cwd: root, windowsHide: true,
      env: {...process.env, CODEX_HOME: cliHome}, stdio: ['pipe', 'ignore', 'ignore']});
    const exit = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    const timeout = setTimeout(() => child.kill(), 20000);
    child.stdin.on('error', () => {});
    child.stdin.end('IMAGE_ARGUMENT_REGRESSION_STDIN', 'utf8');
    try {
      assert.equal(await exit, 1, 'The local fixture deliberately returns HTTP 400');
    } finally {
      clearTimeout(timeout);
    }
    assert.ok(requestBody, 'CLI must reach the local fixture');
    const content = requestBody.input.flatMap(item => item.content || []);
    assert.equal(content.filter(item => item.type === 'input_image').length, 2);
    const text = content.filter(item => item.type === 'input_text').map(item => item.text).join('\n');
    assert.ok(text.includes('IMAGE_ARGUMENT_REGRESSION_STDIN'));
    assert.ok(!text.includes('could not read the local image'), 'No phantom image loading warning');
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
