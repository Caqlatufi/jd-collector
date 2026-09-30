import {mkdir, readFile, writeFile, open, unlink} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {agentRequest} from './agentConnection.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const runtime = path.join(root, 'runtime', 'search-filters');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fail = code => { throw new Error(code); };

export function parseOptions(args) {
  const options = {};
  const allowed = ['key', 'rect', 'step', 'capture', 'kind', 'x', 'y', 'delta', 'text', 'steps', 'key-code'];
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, '');
    if (!args[i]?.startsWith('--') || !allowed.includes(key) || args[i + 1] === undefined || key in options) fail('INVALID_OPTIONS');
    options[key] = args[i + 1];
  }
  return options;
}

export function validateStep(step) {
  if (!step || !['click', 'wheel', 'text', 'key'].includes(step.kind)) fail('INVALID_ACTION');
  if (!step.rect || !['x', 'y', 'width', 'height'].every(k => Number.isInteger(step.rect[k])) ||
      step.rect.x < 0 || step.rect.y < 0 || step.rect.width < 1 || step.rect.height < 1) fail('INVALID_RECT');
  if (!Number.isInteger(step.x) || !Number.isInteger(step.y) || step.x < step.rect.x || step.y < step.rect.y ||
      step.x >= step.rect.x + step.rect.width || step.y >= step.rect.y + step.rect.height) fail('INVALID_COORDINATE');
  if (step.kind === 'wheel' && (!Number.isInteger(step.delta) || !step.delta || Math.abs(step.delta) > 1000)) fail('INVALID_SCROLL');
  if (step.kind === 'key' && !['Enter', 'Tab', 'Escape', 'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'SelectAll'].includes(step.keyCode)) fail('INVALID_KEY');
  if (step.kind === 'text' && (typeof step.text !== 'string' || !step.text.length || step.text.length > 80 || /[\x00-\x1f\x7f]/.test(step.text))) fail('INVALID_SEARCH_TEXT');
}

export function validateGeometry(target, step) {
  if (!same(target.viewport, step.viewport) || target.zoomFactor !== step.zoomFactor || target.sourceUrl !== step.sourceUrl) fail('LAYOUT_CHANGED');
  if (step.rect.x + step.rect.width > target.viewport.width || step.rect.y + step.rect.height > target.viewport.height) fail('INVALID_RECT');
}

// Every input travels through the same capture-bound native workflow as manual agent actions.
async function capture(platform, key, rect) {
  const ref = await agentRequest(platform, 'capture', {key, ...(rect ? {rect} : {})});
  const image = await readFile(ref.filePath);
  if (sha(image) !== ref.sha256) fail('INVALID_EVIDENCE');
  const directory = path.join(runtime, platform);
  const id = randomUUID();
  const result = {...ref, engine: 'electron-native-v1', id, png: path.join(directory, id + '.png')};
  await writeFile(result.png, image, {flag: 'wx'});
  const manifest = path.join(directory, id + '.json');
  await writeFile(manifest, JSON.stringify(result, null, 2), {flag: 'wx'});
  return {...result, manifest};
}

export async function executeStep(request, platform, key, step) {
  validateStep(step);
  if (step.engine !== 'electron-native-v1' || step.platform !== platform || step.key !== key) fail('RECALIBRATION_REQUIRED');
  const ref = await request(platform, 'capture', {key, rect: step.rect});
  validateGeometry(ref, step);
  if (ref.displayScaleFactor !== step.displayScaleFactor || ref.sha256 !== step.sha256) fail('ANCHOR_CHANGED');
  const binding = {key, captureId: ref.captureId};
  if (step.kind === 'click') await request(platform, 'click', {...binding, x: step.x, y: step.y, intent: 'searchControl'});
  if (step.kind === 'wheel') await request(platform, 'scroll', {...binding, x: step.x, y: step.y, deltaX: 0, deltaY: -step.delta});
  if (step.kind === 'text') {
    await request(platform, 'click', {...binding, x: step.x, y: step.y, intent: 'searchControl'});
    const focused = await request(platform, 'capture', {key, rect: step.rect});
    validateGeometry(focused, step);
    await request(platform, 'type', {key, captureId: focused.captureId, text: step.text, replace: true});
  }
  if (step.kind === 'key') await request(platform, 'key', {...binding, keyCode: step.keyCode});
}

export async function runPlatform(profile, args = process.argv.slice(2)) {
  const [command = 'help', ...rest] = args;
  if (command === 'help') {
    console.log(`${profile.platform}: capture --key KEY [--rect x,y,w,h]\nrecord --capture ID --step NAME --kind click|wheel|text|key --x N --y N [--delta N|--text TEXT|--key-code Enter]\napply --key KEY --steps NAME[,NAME]`);
    return;
  }
  if (!['capture', 'record', 'apply'].includes(command)) fail('INVALID_COMMAND');
  const options = parseOptions(rest);
  const directory = path.join(runtime, profile.platform);
  await mkdir(directory, {recursive: true});
  const lockPath = path.join(runtime, 'operation.lock');
  let lock;
  try { lock = await open(lockPath, 'wx'); } catch { fail('FILTER_BUSY'); }
  try {
    const recipePath = path.join(directory, 'steps.json');
    if (command === 'record') {
      if (!/^[a-zA-Z0-9-]{36}$/.test(options.capture || '') || !profile.steps.includes(options.step)) fail('INVALID_RECORD');
      const ref = JSON.parse(await readFile(path.join(directory, options.capture + '.json'), 'utf8'));
      if (ref.engine !== 'electron-native-v1' || ref.platform !== profile.platform || ref.id !== options.capture || sha(await readFile(path.join(directory, ref.id + '.png'))) !== ref.sha256) fail('INVALID_EVIDENCE');
      const step = {...ref, kind: options.kind, x: Number(options.x), y: Number(options.y)};
      if (options.delta !== undefined) step.delta = Number(options.delta);
      if (options.text !== undefined) step.text = options.text;
      if (options['key-code'] !== undefined) step.keyCode = options['key-code'];
      validateStep(step);
      let recipe = {schemaVersion: 1, platform: profile.platform, steps: {}};
      try { recipe = JSON.parse(await readFile(recipePath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      recipe.steps[options.step] = step;
      await writeFile(recipePath, JSON.stringify(recipe, null, 2));
      console.log(JSON.stringify({ok: true, recorded: options.step, note: 'Recorded only; no page action executed'}));
      return;
    }
    if (!options.key || !/^[a-zA-Z0-9:_-]{1,100}$/.test(options.key)) fail('EXPLICIT_KEY_REQUIRED');
    await agentRequest(profile.platform, 'focus', {key: options.key});
    const values = options.rect?.split(',').map(Number);
    if (values && (values.length !== 4 || !values.every(Number.isInteger))) fail('INVALID_RECT');
    const rect = values ? {x: values[0], y: values[1], width: values[2], height: values[3]} : undefined;
    if (command === 'capture') {
      console.log(JSON.stringify({ok: true, capture: await capture(profile.platform, options.key, rect)}));
      return;
    }
    const names = options.steps?.split(',');
    if (!names?.length || names.length > 20 || names.some(name => !profile.steps.includes(name))) fail('INVALID_STEPS');
    const recipe = JSON.parse(await readFile(recipePath, 'utf8'));
    if (recipe.platform !== profile.platform) fail('PLATFORM_MISMATCH');
    const completed = [];
    for (const name of names) {
      try {
        const step = recipe.steps[name];
        if (!step) fail('STEP_NOT_CALIBRATED');
        await executeStep(agentRequest, profile.platform, options.key, step);
        // Delay only lets rendering settle; it is not a success assertion. The next PNG anchor must still match.
        await new Promise(resolve => setTimeout(resolve, 350));
        completed.push(name);
      } catch (error) {
        console.log(JSON.stringify({ok: false, code: /^[A-Z_]+$/.test(error.message) ? error.message : 'FILTER_FAILED', completed, stoppedAt: name,
          capture: await capture(profile.platform, options.key, rect).catch(() => null)}));
        process.exitCode = 1;
        return;
      }
    }
    console.log(JSON.stringify({ok: true, completed, verified: false, note: 'Actions sent; read the screenshot to verify selected filters',
      capture: await capture(profile.platform, options.key, rect)}));
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}
