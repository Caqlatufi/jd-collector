import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {audit, directoryFiles, projectRoot} from './public-source.mjs';

test('public source audit rejects contacts, keys and private paths without returning their values', async () => {
  const root = await mkdtemp(path.join(projectRoot, 'runtime/audit-fixture-'));
  const contact = ['138', '0013', '8000'].join('');
  const email = ['fixture', '@', 'private.invalid'].join('');
  const key = ['sk-', 'a'.repeat(32)].join('');
  await writeFile(path.join(root, 'sample.md'), [contact, email, key].join('\n'));
  await writeFile(path.join(root, '.env'), 'JD_FIXTURE=value');
  const findings = await audit(root, await directoryFiles(root));
  assert.deepEqual(new Set(findings.map(item => item.rule)), new Set(['phone-number', 'personal-email', 'api-key', 'private-file']));
  assert.equal(JSON.stringify(findings).includes(contact), false);
  assert.equal(JSON.stringify(findings).includes(email), false);
  assert.equal(JSON.stringify(findings).includes(key), false);
});

test('public criteria example rejects confirmed answers while allowing loopback service addresses', async () => {
  const root = await mkdtemp(path.join(projectRoot, 'runtime/audit-fixture-'));
  const {mkdir} = await import('node:fs/promises');
  await mkdir(path.join(root, 'config'));
  await writeFile(path.join(root, 'README.md'), 'http://127.0.0.1:7890/');
  await writeFile(path.join(root, 'config/criteria.example.json'), JSON.stringify({
    baselineRules: [], agentNotes: [], sections: [{fields: [{value: 'fixture', status: 'CONFIRMED'}]}],
  }));
  const findings = await audit(root, await directoryFiles(root));
  assert.deepEqual(findings, [{file: 'config/criteria.example.json', rule: 'personal-criteria-answer'}]);
});
