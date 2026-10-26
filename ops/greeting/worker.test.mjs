import {test} from 'node:test';
import assert from 'node:assert/strict';
import {codexArguments, model, reasoningEffort, prompt} from './worker.mjs';
import {compareVersions, resolveGreetingCodex} from './codex.mjs';

test('Greeting pins model and effort and isolates tools and persistent sessions', () => {
  const args = codexArguments('C:/temporary-greeting');
  assert.equal(model, 'gpt-6.1-sol');
  assert.equal(reasoningEffort, 'medium');
  assert.equal(args[args.indexOf('--model') + 1], model);
  assert.ok(args.includes('model_reasoning_effort="medium"'));
  for (const flag of ['--ignore-user-config', '--ignore-rules', '--ephemeral', '--output-schema']) assert.ok(args.includes(flag));
  assert.ok(args.includes('read-only'));
  assert.ok(args.includes('shell_tool'));
  assert.ok(args.includes('mcp_servers={}'));
  assert.match(prompt, /resume是候选人事实的唯一来源/);
  assert.match(prompt, /参与不能写成主导/);
  assert.match(prompt, /严格100–500字/);
  assert.match(prompt, /每行只对应一个需求点/);
  assert.match(prompt, /任职资格与加分项之间必须保留一个空行/);
  assert.match(prompt, /每个编号条目恰好对应一组/);
  assert.match(prompt, /省略整个加分项分组/);
});

test('Executable version ordering chooses new CLI even when extension date is numerically smaller', async () => {
  assert.ok(compareVersions('0.162.0-alpha.2', '0.155.0-alpha.16.3') > 0);
  assert.ok(compareVersions('0.160.1', '0.160.0') > 0);
  assert.equal(await resolveGreetingCodex('C:/explicit/codex.exe'), 'C:/explicit/codex.exe');
});
