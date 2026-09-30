import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {enqueue} from './queue.mjs';

/** Assemble native manifests without retyping or changing their evidence metadata. */
export async function taskFromScreenPlan(plan, directory) {
  async function capture(reference) {
    if (!reference || typeof reference.manifest !== 'string') throw new Error('INVALID_MANIFEST_REFERENCE');
    const manifest = JSON.parse(await fs.readFile(path.resolve(directory, reference.manifest), 'utf8'));
    const matches = (manifest.captures || []).filter(c => !reference.captureId || c.captureId === reference.captureId);
    if (matches.length !== 1) throw new Error('AMBIGUOUS_CAPTURE_REFERENCE');
    return matches[0];
  }
  if (!Array.isArray(plan.cards)) throw new Error('INVALID_SCREEN_PLAN');
  const list = await capture(plan.list);
  const captures = [list];
  const cards = [];
  for (const card of plan.cards) {
    const detail = await capture(card.detail);
    captures.push(detail);
    cards.push({cardId: card.cardId, listBbox: card.listBbox, detailCaptureIds: [detail.captureId]});
  }
  return {schemaVersion: 1, taskId: plan.taskId, platform: list.platform, mode: 'SCREEN_BATCH', requestedFields: [],
    scope: plan.scope || '', criteria: plan.criteria, listCaptureId: list.captureId, cards, captures};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [file, root, ...extra] = process.argv.slice(2);
    if (!file || extra.length) throw new Error('Usage: node ops/recognition/screen.mjs plan.json [work-directory]');
    const plan = JSON.parse(await fs.readFile(file, 'utf8'));
    console.log(JSON.stringify(await enqueue(await taskFromScreenPlan(plan, path.dirname(path.resolve(file))), root)));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
