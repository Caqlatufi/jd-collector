import path from 'node:path';
import {audit, directoryFiles, projectRoot, sourceFiles} from './public-source.mjs';

const directory = process.argv[2];
const root = directory ? path.resolve(directory) : projectRoot;
const files = directory ? await directoryFiles(root) : await sourceFiles();
const findings = await audit(root, files);
if (findings.length) {
  // Report locations and rule names only; never echo a matching secret or contact value.
  for (const finding of findings) console.error(`${finding.file}${finding.line ? ':' + finding.line : ''}: ${finding.rule}`);
  console.error(`Public source audit failed: ${findings.length} findings.`);
  process.exitCode = 1;
} else {
  console.log(`Public source audit passed: ${files.length} files. Git history was not audited or rewritten.`);
}
