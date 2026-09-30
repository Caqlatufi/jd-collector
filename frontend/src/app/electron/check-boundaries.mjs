import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const violations = [];
let checked = 0;
function walk(directory) {
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { walk(file); continue; }
    if (!/\.(ts|vue|mjs|cjs|js|html)$/.test(file)) continue;
    checked++;
    const relative = path.relative(path.join(root, 'src'), file).replaceAll('\\', '/');
    const nativeAllowed = relative.startsWith('app/electron/') || relative.startsWith('common/desktop/main/');
    const content = fs.readFileSync(file, 'utf8');
    const imports = [...content.matchAll(/(?:from\s*|import\s*\(|require\s*\(|import\s*)['"]([^'"]+)['"]/g)].map(match => match[1]);
    for (const specifier of imports) {
      if (!nativeAllowed && /^(electron(?:\/|$)|node:|(?:fs|path|child_process|os|crypto|net|http|https)$)/.test(specifier)) violations.push(`${relative}: native import ${specifier}`);
      const resolved = specifier.startsWith('@/') ? specifier.slice(2) : path.posix.normalize(path.posix.join(path.posix.dirname(relative), specifier));
      if (!nativeAllowed && resolved.startsWith('common/desktop/main/')) violations.push(`${relative}: main-process implementation imported by renderer`);
      if (relative !== 'main.ts' && !relative.startsWith('app/') && !relative.startsWith('common/') && resolved.startsWith('app/')) violations.push(`${relative}: business module depends on app`);
    }
    if (!nativeAllowed && relative !== 'common/desktop/client.ts' && /\bwindow\.jdDesktop\b|\bipcRenderer\b|\bipcMain\b/.test(content)) violations.push(`${relative}: raw bridge/IPC outside adapter`);
  }
}
walk(path.join(root, 'src'));
console.log(JSON.stringify({checked, violations}, null, 2));
if (violations.length) process.exitCode = 1;
