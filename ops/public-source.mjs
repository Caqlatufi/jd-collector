import {spawnSync} from 'node:child_process';
import {lstat, readFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const privatePath = /(?:^|\/)(?:local|runtime|backups|node_modules|\.git|\.gradle|build|bin|dist|dist-electron|test-results|desktop-test-results|playwright-report|\.idea|\.vscode)(?:\/|$)|^frontend\/public\/resume\/|^JD(?:门槛\.json|搜索任务单.*\.md)$|(?:^|\/)\.env(?:\.|$)|\.local\.|(?:^|\/)application-local\.|\.(?:key|pem|p12|pfx|sql|db|sqlite\w*|docx|pdf)$/i;
const textExtension = /\.(?:md|txt|json|yml|yaml|java|gradle|properties|ts|vue|html|scss|css|mjs|cjs|js|ps1|bat)$|(?:^|\/)(?:LICENSE|NOTICE|\.gitignore|gradlew)$/i;
const rules = [
  ['phone-number', /(?<![\d])1[3-9]\d{9}(?![\d])/],
  ['personal-email', /[\w.+-]+@(?!example\.(?:com|org|net)\b|[^\s@]*\.test\b)[\w.-]+\.[a-z]{2,}/i],
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['api-key', /\b(?:sk-[a-zA-Z0-9_-]{20,}|AKIA[A-Z0-9]{16}|gh[pousr]_[a-zA-Z0-9]{30,})\b/],
  ['personal-absolute-path', /\b[A-Z]:[\\/](?:Users|workspace[^\\/\s`"']*)[\\/]/i],
  ['non-local-ip-address', /\b(?!(?:127\.|0\.0\.0\.0|255\.255\.255\.255))\d{1,3}(?:\.\d{1,3}){3}\b/],
];

export async function sourceFiles() {
  const result = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '.'],
    {cwd: projectRoot, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024});
  if (result.status !== 0) throw new Error('Source inventory requires Git; run from a repository checkout.');
  const files = [];
  for (const relative of [...new Set(result.stdout.split('\0').filter(Boolean))].sort()) {
    const normalized = relative.replaceAll('\\', '/');
    const absolute = path.resolve(projectRoot, relative);
    if (!absolute.startsWith(projectRoot + path.sep)) throw new Error('Source path escapes project root.');
    try {
      const stat = await lstat(absolute);
      if (!stat.isFile() && !stat.isSymbolicLink()) continue;
      files.push(normalized);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return files;
}

export async function directoryFiles(root) {
  const files = [];
  async function walk(relative) {
    for (const entry of await readdir(path.join(root, relative), {withFileTypes: true})) {
      const name = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) {
        if (privatePath.test(name + '/')) files.push(name + '/');
        else await walk(name);
      } else files.push(name);
    }
  }
  await walk('');
  return files.sort();
}

export async function audit(root, files) {
  const findings = [];
  for (const relative of files) {
    if (privatePath.test(relative)) {
      findings.push({file: relative, rule: 'private-file'});
      continue;
    }
    const stat = await lstat(path.join(root, relative));
    if (stat.isSymbolicLink()) {
      findings.push({file: relative, rule: 'symlink'});
      continue;
    }
    if (!textExtension.test(relative)) {
      if (relative !== 'backend/gradle/wrapper/gradle-wrapper.jar') findings.push({file: relative, rule: 'unreviewed-binary'});
      continue;
    }
    const text = await readFile(path.join(root, relative), 'utf8');
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      for (const [rule, pattern] of rules) {
        if (pattern.test(lines[i])) findings.push({file: relative, line: i + 1, rule});
      }
    }
    if (relative === 'config/criteria.example.json') {
      const document = JSON.parse(text);
      if (document.baselineRules?.length || document.agentNotes?.length ||
        document.sections.some(section => section.fields.some(field => field.value != null || field.status !== 'PENDING'))) {
        findings.push({file: relative, rule: 'personal-criteria-answer'});
      }
    }
  }
  return findings;
}
