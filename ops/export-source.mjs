import {copyFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {audit, directoryFiles, projectRoot, sourceFiles} from './public-source.mjs';

const files = await sourceFiles();
const findings = await audit(projectRoot, files);
if (findings.length) {
  for (const finding of findings) console.error(`${finding.file}${finding.line ? ':' + finding.line : ''}: ${finding.rule}`);
  throw new Error('Public source audit failed. No export created.');
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const destination = path.resolve(process.argv[2] || path.join(projectRoot, 'runtime/open-source', 'jd-collector-' + stamp));
// Never merge into or overwrite an existing folder. No recursive deletion is performed.
await mkdir(path.dirname(destination), {recursive: true});
await mkdir(destination);
for (const relative of files) {
  const target = path.join(destination, relative);
  await mkdir(path.dirname(target), {recursive: true});
  await copyFile(path.join(projectRoot, relative), target);
}
const exported = await directoryFiles(destination);
if (exported.length !== files.length || (await audit(destination, exported)).length) {
  throw new Error('Export verification failed; do not publish this folder.');
}
console.log(`Export verified: ${files.length} public files, no Git history.\n${destination}`);
