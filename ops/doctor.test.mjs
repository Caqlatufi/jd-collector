import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {databaseTarget, doctor} from './doctor.mjs';

test('database checks reject placeholders and malformed URLs without echoing credentials', () => {
  assert.throws(() => databaseTarget({}), /DB_CONFIG_REQUIRED/);
  assert.throws(() => databaseTarget({JD_COLLECTOR_DB_URL: 'invalid:private-test-value', JD_COLLECTOR_DB_USERNAME: 'test'}),
    error => error.message === 'INVALID_DB_URL' && !error.message.includes('private-test-value'));
  assert.deepEqual(databaseTarget({JD_COLLECTOR_DB_URL: 'jdbc:mysql://127.0.0.1:3307/test?password=private-test-value',
    JD_COLLECTOR_DB_USERNAME: 'test', JD_COLLECTOR_DB_PASSWORD: 'test'}), {host: '127.0.0.1', port: 3307});
});

test('doctor honors custom files and separates unavailable dependencies from runtime readiness', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'jd-doctor-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  await fs.writeFile(path.join(root, 'criteria.json'), '{}');
  await fs.writeFile(path.join(root, 'resume.md'), '# Test\n## Experience');
  const server = net.createServer(socket => socket.end());
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const env = {JD_COLLECTOR_DB_URL: `jdbc:mysql://127.0.0.1:${server.address().port}/test`,
    JD_COLLECTOR_DB_USERNAME: 'test', JD_COLLECTOR_DB_PASSWORD: 'private-test-value',
    JD_COLLECTOR_CRITERIA_FILE: 'criteria.json', JD_RESUME_STARTER_FILE: 'resume.md',
    JD_RECOGNITION_ENABLED: 'true', JD_RECOGNITION_CODEX: path.join(root, 'missing-codex.exe'),
    JD_RECOGNITION_REASONING_EFFORT: 'invalid', JAVA_HOME: path.join(root, 'missing-java')};
  const checks = await doctor({root, env});
  const status = name => checks.find(check => check.name === name)?.status;
  assert.equal(status('数据库端口'), 'PASS');
  assert.equal(status('local/JD门槛.json'), 'PASS');
  assert.equal(status('local/resume-starter.md'), 'PASS');
  assert.equal(status('Codex CLI'), 'FAIL');
  assert.equal(status('识别参数'), 'FAIL');
  assert.equal(status('构建产物'), 'WARN');
  assert.equal(status('后端健康'), undefined);
  assert.ok(!JSON.stringify(checks).includes('private-test-value'));
  const seen = [];
  const request = async resource => {
    seen.push(resource);
    if (resource === 'system/health') return {service: 'jd-collector', status: 'UP'};
    if (resource === 'recognition/config') return {enabled: true, model: 'gpt-6-astra', reasoningEffort: 'medium',
      workDirectory: path.join(root, 'runtime/jd-screenshots')};
    if (resource === 'resume-versions?active=true&type=MASTER') return [{contentReady: true}];
    if (resource === 'criteria') return {revision: 'test', document: {sections: [{fields: [{status: 'CONFIRMED', value: 'test range'}]}]}};
    throw new Error('Unexpected request');
  };
  const activeEnv = {...env, JD_RECOGNITION_REASONING_EFFORT: 'medium'};
  const ready = await doctor({root, env: activeEnv, running: true, request, checkDesktop: async () => true});
  for (const name of ['后端健康', '运行配置', '简历母版', '采集门槛', '桌面连接']) {
    assert.equal(ready.find(check => check.name === name)?.status, 'PASS', name);
  }
  assert.equal(seen.length, 4);
  const mismatch = await doctor({root, env: {...activeEnv, JD_RECOGNITION_MODEL: 'example-vision-model'},
    running: true, request, checkDesktop: async () => false});
  assert.equal(mismatch.find(check => check.name === '运行配置').status, 'FAIL');
  assert.equal(mismatch.find(check => check.name === '桌面连接').status, 'FAIL');
});
