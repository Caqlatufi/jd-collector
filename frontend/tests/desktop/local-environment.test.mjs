import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {localEnvironment} from '../../src/common/desktop/main/localEnvironment.mjs';

test('isolated clients ignore inherited connection and backend settings', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jd-local-env-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  fs.mkdirSync(path.join(root, 'local'));
  const file = path.join(root, 'local/env.json');
  const inherited = {PATH: 'test-path', JD_DESKTOP_USER_DATA: 'other-session', JD_DESKTOP_URL: 'http://127.0.0.1:7891/jd-collector/'};
  const settings = {JD_COLLECTOR_ISOLATED: 'true', JD_DESKTOP_USER_DATA: 'own-session', JD_DESKTOP_URL: 'http://127.0.0.1:7890/jd-collector/'};
  fs.writeFileSync(file, JSON.stringify(settings));
  const actual = localEnvironment(inherited, root);
  assert.equal(actual.JD_DESKTOP_USER_DATA, 'own-session');
  assert.equal(actual.JD_DESKTOP_URL, settings.JD_DESKTOP_URL);
  assert.equal(actual.PATH, 'test-path');
  assert.equal(inherited.JD_DESKTOP_USER_DATA, 'other-session');
  fs.writeFileSync(file, JSON.stringify({JD_COLLECTOR_ISOLATED: 'true'}));
  assert.throws(() => localEnvironment(inherited, root), /ISOLATED_DESKTOP_CONFIG_REQUIRED/);
});
