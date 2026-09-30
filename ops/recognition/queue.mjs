import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validateScreenTask, screenPromptVersion} from './screen-batch.mjs';
import {recognitionSettings} from './settings.mjs';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const defaultRoot = path.resolve(projectRoot, process.env.JD_RECOGNITION_WORK_DIRECTORY || 'runtime/jd-screenshots');
export const taskIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/;
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export function taskFromManifest(manifest, mode = 'DETAIL') {
  if (manifest.taskId) return manifest;
  return {schemaVersion: 1, taskId: 'capture-' + (manifest.batchId || manifest.captures?.[0]?.batchId), platform: manifest.captures?.[0]?.platform,
    mode, captures: manifest.captures,
    requestedFields: ['title', 'companyName', 'salaryText', 'experienceText', 'educationText',
      'locationText', 'officeAddress', 'descriptionSegments']};
}

export async function atomicJson(file, value) {
  const temporary = file + '.' + randomUUID() + '.tmp';
  await fs.writeFile(temporary, JSON.stringify(value, null, 2) + '\n', {flag: 'wx'});
  await fs.rename(temporary, file);
}

export function validateTask(task) {
  if (task.schemaVersion !== 1 || !taskIdPattern.test(task.taskId || '') ||
      !['BOSS', 'LIEPIN', 'JOB51', 'ZHAOPIN'].includes(task.platform) ||
      !['LIST', 'DETAIL', 'REVIEW', 'SCREEN_BATCH'].includes(task.mode) || !Array.isArray(task.captures) ||
      task.captures.length < 1 || task.captures.length > (task.mode === 'SCREEN_BATCH' ? 9 : 4) || !Array.isArray(task.requestedFields))
    throw new Error('INVALID_TASK');
  const ids = new Set();
  const sources = new Set();
  for (const capture of task.captures) {
    if (!taskIdPattern.test(capture.captureId || '') || ids.has(capture.captureId) ||
        capture.platform !== task.platform || !/^[a-f0-9]{64}$/.test(capture.sha256 || '') ||
        !Number.isInteger(capture.image?.width) || !Number.isInteger(capture.image?.height) ||
        capture.image.width <= 0 || capture.image.height <= 0 || capture.image.width > 8192 || capture.image.height > 8192 ||
        !Number.isInteger(capture.sequence) || capture.sequence < 1)
      throw new Error('INVALID_CAPTURE');
    const url = new URL(capture.sourceUrl);
    const domains = {BOSS: 'zhipin.com', LIEPIN: 'liepin.com', JOB51: '51job.com', ZHAOPIN: 'zhaopin.com'};
    const domain = domains[task.platform];
    if (url.protocol !== 'https:' || !(url.hostname === domain || url.hostname.endsWith('.' + domain)))
      throw new Error('INVALID_SOURCE');
    ids.add(capture.captureId);
    sources.add(capture.sourceUrl);
  }
  // Mixed LIST/DETAIL screenshots must be submitted as separate tasks.
  if (task.mode === 'DETAIL' && sources.size !== 1) throw new Error('MIXED_JOB_SOURCES');
  if (task.mode === 'SCREEN_BATCH') validateScreenTask(task);
}

export async function verifyPng(file, capture) {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 20 * 1024 * 1024) throw new Error('INVALID_PNG');
  const bytes = await fs.readFile(file);
  if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
      hash(bytes) !== capture.sha256 || bytes.readUInt32BE(16) !== capture.image.width ||
      bytes.readUInt32BE(20) !== capture.image.height) throw new Error('CAPTURE_HASH_OR_SIZE_MISMATCH');
  return bytes;
}

export function fingerprint(task) {
  return hash(Buffer.from(JSON.stringify({platform: task.platform, mode: task.mode,
    requestedFields: task.requestedFields, scope: task.scope || '',
    ...(task.mode === 'SCREEN_BATCH' ? {criteria: task.criteria, cards: task.cards, listCaptureId: task.listCaptureId} : {}),
    captures: task.captures.map(c => [c.captureId, c.sha256, c.sourceUrl])})));
}

/** Publish one complete batch atomically; navigation-only screenshots never enter this directory. */
export async function enqueue(task, root = defaultRoot) {
  validateTask(task);
  const settings = recognitionSettings();
  root = path.resolve(root);
  const jobs = path.join(root, 'jobs');
  await fs.mkdir(jobs, {recursive: true});
  const digest = fingerprint(task);
  for (const entry of await fs.readdir(jobs, {withFileTypes: true})) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const previous = JSON.parse(await fs.readFile(path.join(jobs, entry.name, 'task.json'), 'utf8'));
    if (previous.fingerprint === digest) return {taskId: previous.taskId, duplicate: true};
    if (entry.name === task.taskId) throw new Error('TASK_ID_CONFLICT');
  }
  const directory = path.join(jobs, task.taskId);
  const staging = path.join(jobs, '.' + task.taskId + '-' + randomUUID());
  await fs.mkdir(staging);
  await fs.mkdir(path.join(staging, 'images'));
  const captures = [];
  for (const capture of task.captures) {
    const bytes = await verifyPng(capture.filePath, capture);
    const fileName = capture.captureId + '.png';
    await fs.writeFile(path.join(staging, 'images', fileName), bytes, {flag: 'wx'});
    captures.push({...capture, originalFilePath: capture.originalFilePath || capture.filePath,
      filePath: path.join(directory, 'images', fileName)});
  }
  await atomicJson(path.join(staging, 'task.json'), {...task, captures, fingerprint: digest,
    queuedAt: new Date().toISOString(), requestedModel: settings.model, requestedReasoningEffort: settings.reasoningEffort,
    promptVersion: task.mode === 'SCREEN_BATCH' ? screenPromptVersion : 'jd-vision-v1'});
  await fs.rename(staging, directory);
  return {taskId: task.taskId, duplicate: false, directory};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [taskFile, root, mode, ...extra] = process.argv.slice(2);
    if (!taskFile || extra.length) throw new Error('Usage: node ops/recognition/queue.mjs task-or-manifest.json [work-directory] [DETAIL|LIST|REVIEW]');
    console.log(JSON.stringify(await enqueue(taskFromManifest(JSON.parse(await fs.readFile(taskFile, 'utf8')), mode), root)));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
