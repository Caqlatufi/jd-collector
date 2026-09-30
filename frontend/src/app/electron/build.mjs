import {build} from 'esbuild';
import {mkdir, copyFile, readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const output = path.join(root, 'dist-electron');
await mkdir(output, {recursive: true});
for (const name of ['main', 'preload', 'review']) {
  await build({entryPoints: [path.join(root, 'src/app/electron/' + name + '.ts')], outfile: path.join(output, name + '.cjs'),
    bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron'], sourcemap: false});
}
await build({entryPoints: [path.join(root, 'src/account/vision.ts')], outfile: path.join(output, 'vision.cjs'),
  bundle: true, platform: 'node', format: 'cjs', target: 'node22'});
await copyFile(path.join(root, 'src/app/electron/offline.html'), path.join(output, 'offline.html'));
await copyFile(path.join(root, 'src/app/electron/browser.html'), path.join(output, 'browser.html'));
await build({entryPoints: [path.join(root, 'src/app/electron/browser.ts')], outfile: path.join(output, 'browser.js'),
  bundle: true, platform: 'browser', target: 'chrome130'});
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
await writeFile(path.join(output, 'package.json'), JSON.stringify({name: 'jd-collector-desktop', productName: 'JD Collector', version: manifest.version, main: 'main.cjs'}, null, 2) + '\n');
console.log('Desktop main/preload built in dist-electron.');
