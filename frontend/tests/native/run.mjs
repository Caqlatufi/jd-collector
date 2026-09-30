import {build} from 'esbuild';
import {readdir, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const requested = process.argv.slice(2);
const directory = requested[0] === '--desktop' ? 'tests/desktop' : 'tests';
const files = requested.length && requested[0] !== '--desktop' ? requested
  : (await readdir(directory)).filter(name => name.endsWith('.spec.ts')).map(name => directory + '/' + name);
await mkdir('test-results', {recursive: true});
const imports = files.map(file => `import ${JSON.stringify(path.resolve(file))};`).join('\n');
const output = path.resolve('test-results/native-suite.mjs');
const suite = files.every(file => file.replaceAll('\\', '/').includes('/desktop/')) ? 'desktop' : 'ui';
await build({stdin: {contents: imports + '\nimport {run} from "./tests/native/harness.mjs"; await run(' + JSON.stringify(suite) + ');', resolveDir: process.cwd()},
  outfile: output, bundle: true, platform: 'node', format: 'esm', target: 'node18', external: ['electron']});
await import(pathToFileURL(output).href);
