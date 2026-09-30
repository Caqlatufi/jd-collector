import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const executable = require('electron');
const dev = process.argv.includes('--dev');
const env = {...process.env};
delete env.ELECTRON_RUN_AS_NODE;
if (dev) env.JD_DESKTOP_DEV = '1';
let vite;
let electron;
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  if (electron && electron.exitCode === null) electron.kill();
  if (vite && vite.exitCode === null) vite.kill();
  process.exitCode = code;
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
if (dev) {
  vite = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--mode', 'development', '--host', '127.0.0.1', '--port', '3002', '--strictPort'], {cwd: root, stdio: 'inherit', windowsHide: true});
  vite.on('exit', code => { if (!stopping) stop(code || 1); });
  let ready = false;
  for (let i = 0; i < 50 && !stopping; i++) {
    try { if ((await fetch('http://127.0.0.1:3002/jd-collector/')).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (!ready) { stop(1); throw new Error('Vite did not start on port 3002'); }
}
if (!stopping) {
  const args = [path.join(root, 'dist-electron')];
  electron = spawn(executable, args, {cwd: root, env, stdio: 'inherit', windowsHide: false});
  electron.on('error', () => stop(1));
  electron.on('exit', code => stop(code || 0));
}
