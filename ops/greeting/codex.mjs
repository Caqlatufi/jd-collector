import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolveCodex} from '../recognition/worker.mjs';

const execute = promisify(execFile);

export function compareVersions(left, right) {
  const a = left.match(/\d+/g)?.map(Number) || [];
  const b = right.match(/\d+/g)?.map(Number) || [];
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference) return difference;
  }
  return 0;
}

export async function resolveGreetingCodex(configured = process.env.JD_RECOGNITION_CODEX || '') {
  if (configured) return configured;
  // Extension directory numbers are release dates, not reliable executable version ordering.
  const root = path.join(os.homedir(), '.vscode/extensions');
  const entries = await fs.readdir(root).catch(() => []);
  const installed = await Promise.all(entries.filter(name => name.startsWith('openai.chatgpt-')).map(async name => {
    const executable = path.join(root, name, 'bin/windows-x86_64/codex.exe');
    try {
      const {stdout} = await execute(executable, ['--version'], {windowsHide: true, timeout: 3000, maxBuffer: 4096});
      const version = stdout.match(/codex-cli\s+(\S+)/)?.[1];
      return version ? {executable, version} : null;
    } catch { return null; }
  }));
  const candidates = installed.filter(Boolean).sort((a, b) => compareVersions(b.version, a.version));
  return candidates[0]?.executable || resolveCodex();
}
