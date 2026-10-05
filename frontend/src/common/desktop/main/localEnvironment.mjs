import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');

export function localEnvironment(env = process.env, root = projectRoot) {
  const file = path.join(root, 'local/env.json');
  const settings = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) : {};
  if (settings.JD_COLLECTOR_ISOLATED !== 'true') return {...settings, ...env};
  if (!settings.JD_DESKTOP_USER_DATA || !settings.JD_DESKTOP_URL) throw new Error('ISOLATED_DESKTOP_CONFIG_REQUIRED');
  return {...env, ...settings};
}
