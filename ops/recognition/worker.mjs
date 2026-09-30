import fs from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {atomicJson, hash, projectRoot, validateTask, verifyPng} from './queue.mjs';
import {processScreenBatch, screenPromptVersion, validateScreenResult} from './screen-batch.mjs';
import {findListDuplicates, loadDuplicateIndex} from './screen-dedupe.mjs';
import {recognitionSettings} from './settings.mjs';

const require = createRequire(import.meta.url);

export async function resolveCodex(configured = process.env.JD_RECOGNITION_CODEX || '') {
  if (configured) return configured;
  // Prefer the maintained desktop extension CLI over a stale global npm shim.
  const extensions = path.join(os.homedir(), '.vscode/extensions');
  const installed = await fs.readdir(extensions, {withFileTypes: true}).catch(() => []);
  for (const entry of installed.filter(e => e.isDirectory() && e.name.startsWith('openai.chatgpt-'))
    .sort((a, b) => b.name.localeCompare(a.name, undefined, {numeric: true}))) {
    const candidate = path.join(extensions, entry.name, 'bin/windows-x86_64/codex.exe');
    try { if ((await fs.stat(candidate)).isFile()) return candidate; } catch { /* Next installation. */ }
  }
  const executable = process.platform === 'win32' ? 'codex.exe' : 'codex';
  for (const directory of (process.env.PATH || '').split(path.delimiter)) {
    for (const candidate of [path.join(directory, executable), path.join(directory,
      'node_modules/@openai/codex/vendor/x86_64-pc-windows-msvc/codex/codex.exe')]) {
      try { if ((await fs.stat(candidate)).isFile()) return candidate; } catch { /* Next PATH entry. */ }
    }
  }
  throw new Error('CODEX_NOT_FOUND');
}

export function codexArguments(task, directory, output, settings = recognitionSettings()) {
  return ['exec', '--model', settings.model, '-c', `model_reasoning_effort="${settings.reasoningEffort}"`,
    '--sandbox', 'read-only', '-c', 'approval_policy="never"', '-c', 'project_doc_max_bytes=0',
    '-c', 'web_search="disabled"', '-c', 'mcp_servers={}', '--disable', 'shell_tool', '--disable', 'apps',
    '--disable', 'multi_agent', '--disable', 'plugins', '--disable', 'browser_use',
    '--disable', 'computer_use', '--skip-git-repo-check', '--color', 'never', '--json', '--cd', directory,
    '--output-last-message', output, ...task.captures.flatMap(c => ['--image', c.filePath]), '-'];
}

export async function runProcess(executable, args, prompt, attemptDirectory, timeoutMs) {
  const stdout = createWriteStream(path.join(attemptDirectory, 'events.jsonl'), {flags: 'wx'});
  const stderr = createWriteStream(path.join(attemptDirectory, 'stderr.log'), {flags: 'wx'});
  const child = spawn(executable, args, {cwd: attemptDirectory, windowsHide: true, shell: false,
    stdio: ['pipe', 'pipe', 'pipe']});
  child.stdout.pipe(stdout);
  child.stderr.pipe(stderr);
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
  child.stdin.on('error', () => { /* Exit status is recorded below. */ });
  child.stdin.end(prompt, 'utf8');
  const exit = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({code, signal}));
  }).finally(() => clearTimeout(timer));
  // close means the process and its stdio streams have ended; observation timeout alone is never completion.
  if (timedOut) throw new Error('CODEX_TIMEOUT');
  if (exit.code !== 0) {
    const diagnostic = await fs.readFile(path.join(attemptDirectory, 'events.jsonl'), 'utf8');
    if (diagnostic.includes('requires a newer version of Codex')) throw new Error('CODEX_UPGRADE_REQUIRED');
    throw new Error('CODEX_EXIT_' + exit.code);
  }
  return exit;
}

export async function reusableScreenPhase(previousDirectory, prompt, task, cards, phase, settings = recognitionSettings()) {
  try {
    if (await fs.readFile(path.join(previousDirectory, 'prompt.txt'), 'utf8') !== prompt) return null;
    const result = JSON.parse(await fs.readFile(path.join(previousDirectory, 'raw-result.json'), 'utf8'));
    validateScreenResult(result, task, cards, phase);
    const invocation = JSON.parse(await fs.readFile(path.join(previousDirectory, 'invocation.json'), 'utf8'));
    if (invocation.model !== settings.model || invocation.reasoningEffort !== settings.reasoningEffort) return null;
    return {result, invocation};
  } catch { return null; }
}

export async function recognize(directory, attempt, configuredCodex, timeoutMs = 120000, settings = recognitionSettings()) {
  directory = path.resolve(directory);
  const attemptDirectory = path.join(directory, 'attempt-' + attempt);
  await fs.mkdir(attemptDirectory, {recursive: true});
  const startedAt = new Date().toISOString();
  await atomicJson(path.join(attemptDirectory, 'worker.json'), {pid: process.pid,
    processStartedAt: new Date(Date.now() - process.uptime() * 1000).toISOString()});
  try {
    const task = JSON.parse(await fs.readFile(path.join(directory, 'task.json'), 'utf8'));
    validateTask(task);
    for (const capture of task.captures) {
      const expected = path.join(directory, 'images', capture.captureId + '.png');
      if (path.resolve(capture.filePath) !== expected || await fs.realpath(expected) !== expected)
        throw new Error('CAPTURE_OUTSIDE_TASK');
      await verifyPng(expected, capture);
    }
    const document = await fs.readFile(path.join(projectRoot, '.agents/skills/jd-vision-prompt.md'), 'utf8');
    if (task.mode === 'SCREEN_BATCH') {
      const codex = await resolveCodex(configuredCodex);
      const duplicateIndex = await loadDuplicateIndex(task, directory);
      let phaseNumber = 0;
      const result = await processScreenBatch(task, async (phase, cards, captures, listCards) => {
        const phaseDirectory = path.join(attemptDirectory, `${++phaseNumber}-${phase.toLowerCase()}`);
        await fs.mkdir(phaseDirectory);
        const standard = document.match(new RegExp('```screen-' + phase.toLowerCase() + '\\r?\\n([\\s\\S]*?)\\r?\\n```'))?.[1];
        if (!standard) throw new Error('PROMPT_NOT_FOUND');
        const input = {taskId: task.taskId, phase, criteria: task.criteria, cards, listCards,
          captures: captures.map(({captureId, image, sourceUrl}) => ({captureId, image, sourceUrl}))};
        const prompt = standard + '\n\n' + JSON.stringify(input);
        const output = path.join(phaseDirectory, 'raw-result.json');
        const args = codexArguments({captures}, phaseDirectory, output, settings);
        await fs.writeFile(path.join(phaseDirectory, 'prompt.txt'), prompt, 'utf8');
        // A failed later phase must not spend another model call on a validated, identical earlier phase.
        for (let previous = attempt - 1; previous >= 1; previous--) {
          const previousDirectory = path.join(directory, 'attempt-' + previous, path.basename(phaseDirectory));
          const cached = await reusableScreenPhase(previousDirectory, prompt, task, cards, phase, settings);
          if (!cached) continue;
          await atomicJson(output, cached.result);
          await atomicJson(path.join(phaseDirectory, 'invocation.json'), {...cached.invocation,
            reusedFrom: previousDirectory, reusedAt: new Date().toISOString(), reusedNoModelCall: true});
          return cached.result;
        }
        await atomicJson(path.join(phaseDirectory, 'invocation.json'), {...settings,
          promptVersion: screenPromptVersion, phase, promptSha256: hash(Buffer.from(standard)), args,
          cardIds: cards.map(c => c.cardId), captureIds: captures.map(c => c.captureId), startedAt: new Date().toISOString()});
        await runProcess(codex, args, prompt, phaseDirectory, timeoutMs);
        return JSON.parse((await fs.readFile(output, 'utf8')).replace(/^\uFEFF/, ''));
      }, listCards => findListDuplicates(task, listCards, duplicateIndex));
      await atomicJson(path.join(directory, 'result.json'), result);
      await atomicJson(path.join(directory, 'candidates.json'), {taskId: task.taskId, candidates: result.candidates,
        counts: result.counts, dedupe: result.dedupe, formalPostingWrites: 0});
      const completion = {status: result.counts.needsMore ? 'NEEDS_REVIEW' : 'SUCCEEDED', attempt, startedAt,
        completedAt: new Date().toISOString(), ...settings,
        mode: task.mode, candidateCount: result.counts.total, screeningCounts: result.counts,
        timings: result.timings, semanticApproval: false};
      await atomicJson(path.join(attemptDirectory, 'completion.json'), completion);
      return completion;
    }
    const standard = document.match(/```text\r?\n([\s\S]*?)\r?\n```/)?.[1];
    if (!standard) throw new Error('PROMPT_NOT_FOUND');
    const prompt = standard + '\n\n补充：图片已经按captures顺序直接附在本条输入中，请直接读取附件；无需调用图片查看或其他工具。只输出识别JSON，不写文件。\n\n' + JSON.stringify(task);
    await fs.writeFile(path.join(attemptDirectory, 'prompt.txt'), prompt, 'utf8');
    const codex = await resolveCodex(configuredCodex);
    const rawOutput = path.join(attemptDirectory, 'raw-result.json');
    const args = codexArguments(task, attemptDirectory, rawOutput, settings);
    await atomicJson(path.join(attemptDirectory, 'invocation.json'), {...settings,
      promptVersion: 'jd-vision-v1', promptSha256: hash(Buffer.from(standard)),
      executable: codex, args, startedAt});
    await runProcess(codex, args, prompt, attemptDirectory, timeoutMs);
    const result = JSON.parse((await fs.readFile(rawOutput, 'utf8')).replace(/^\uFEFF/, ''));
    const {validateVisionResult, archiveEvidenceIssues} = require(path.join(projectRoot, 'frontend/dist-electron/vision.cjs'));
    const errors = validateVisionResult(result, task.taskId, task.captures);
    if (errors.length) {
      await atomicJson(path.join(attemptDirectory, 'validation.json'), {errors});
      throw new Error('INVALID_VISION_RESULT');
    }
    const gaps = result.candidates.flatMap(c => archiveEvidenceIssues(result, c));
    const needsReview = result.coverage !== 'COMPLETE' || ['LOGIN', 'CHALLENGE', 'UNKNOWN'].includes(result.pageKind) ||
      result.nextCapture !== null || (task.mode === 'DETAIL' && (!result.candidates.length || gaps.length > 0));
    await atomicJson(path.join(directory, 'result.json'), result);
    const completion = {status: needsReview ? 'NEEDS_REVIEW' : 'SUCCEEDED', attempt, startedAt,
      completedAt: new Date().toISOString(), ...settings,
      candidateCount: result.candidates.length, evidenceIssues: gaps, semanticApproval: false};
    await atomicJson(path.join(attemptDirectory, 'completion.json'), completion);
    return completion;
  } catch (error) {
    const known = /^(CODEX_|INVALID_|CAPTURE_|PROMPT_)/.test(error.message || '');
    const completion = {status: 'FAILED', attempt, startedAt, completedAt: new Date().toISOString(),
      errorCode: known ? error.message.slice(0, 100) : 'RECOGNITION_FAILED', semanticApproval: false};
    await atomicJson(path.join(attemptDirectory, 'completion.json'), completion);
    return completion;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [directory, attempt, codex, timeout, model, reasoningEffort] = process.argv.slice(2);
  if (!directory || !/^[1-9][0-9]*$/.test(attempt || '')) process.exitCode = 1;
  else {
    const settings = recognitionSettings({...process.env, ...(model ? {JD_RECOGNITION_MODEL: model} : {}),
      ...(reasoningEffort ? {JD_RECOGNITION_REASONING_EFFORT: reasoningEffort} : {})});
    const completion = await recognize(directory, Number(attempt), codex, timeout ? Number(timeout) : 120000, settings);
    console.log(JSON.stringify(completion));
    process.exitCode = completion.status === 'FAILED' ? 1 : 0;
  }
}
