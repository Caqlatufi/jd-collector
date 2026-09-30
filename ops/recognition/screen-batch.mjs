/** Screening is a candidate decision, never a complete JD or permission to save. */
export const screenPromptVersion = 'jd-screen-v2';

const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/;
const boxValid = box => Array.isArray(box) && box.length === 4 && box.every(Number.isFinite) &&
  box[0] >= 0 && box[1] >= 0 && box[2] > 0 && box[3] > 0 &&
  box[0] + box[2] <= 1.001 && box[1] + box[3] <= 1.001;

export function validateScreenTask(task) {
  const captures = new Set(task.captures.map(c => c.captureId));
  if (!captures.has(task.listCaptureId) || !Array.isArray(task.cards) || task.cards.length < 1 ||
      task.cards.length > 8 || typeof task.criteria !== 'string' || !task.criteria.trim())
    throw new Error('INVALID_SCREEN_BATCH');
  const cardIds = new Set();
  const used = new Set([task.listCaptureId]);
  for (const card of task.cards) {
    if (!idPattern.test(card.cardId || '') || cardIds.has(card.cardId) || !boxValid(card.listBbox) ||
        !Array.isArray(card.detailCaptureIds) || card.detailCaptureIds.length !== 1)
      throw new Error('INVALID_CARD_MAPPING');
    cardIds.add(card.cardId);
    for (const id of card.detailCaptureIds) {
      if (!captures.has(id) || used.has(id)) throw new Error('INVALID_CARD_MAPPING');
      used.add(id);
    }
  }
  if (used.size !== captures.size) throw new Error('INVALID_UNMAPPED_CAPTURE');
}

export function validateScreenResult(result, task, cards, phase) {
  if (result?.taskId !== task.taskId || result.phase !== phase ||
      !['READABLE', 'LOGIN', 'CHALLENGE', 'UNREADABLE'].includes(result.pageStatus) ||
      !Array.isArray(result.cards)) throw new Error('INVALID_SCREEN_RESULT');
  if (result.pageStatus !== 'READABLE') throw new Error('INVALID_SCREEN_PAGE_' + result.pageStatus);
  if (result.cards.length !== cards.length) throw new Error('INVALID_SCREEN_CARD_COUNT');
  const seen = new Set();
  for (const item of result.cards) {
    const card = cards.find(c => c.cardId === item.cardId);
    const allowed = phase === 'LIST' ? ['READ_DETAIL', 'EXCLUDE'] : ['KEEP', 'EXCLUDE', 'NEEDS_MORE'];
    if (!card || seen.has(item.cardId) || !allowed.includes(item.decision) ||
        typeof item.reason !== 'string' || !item.reason.trim() ||
        !['title', 'company', 'salary'].every(k => item[k] === null || typeof item[k] === 'string') ||
        !Array.isArray(item.evidence) || !item.evidence.length)
      throw new Error('INVALID_SCREEN_CARD');
    seen.add(item.cardId);
    const ids = phase === 'LIST' ? [task.listCaptureId] : card.detailCaptureIds;
    for (const e of item.evidence) {
      if (!ids.includes(e.captureId) || !boxValid(e.bbox)) throw new Error('INVALID_SCREEN_EVIDENCE');
    }
    if (phase === 'DETAIL') {
      if (!['MATCH', 'MISMATCH', 'UNCERTAIN'].includes(item.identity) ||
          (item.identity !== 'MATCH' && item.decision !== 'NEEDS_MORE') ||
          typeof item.summary !== 'string' || !Array.isArray(item.missingForArchive) ||
          !item.missingForArchive.every(x => typeof x === 'string') ||
          ![null, 'string'].includes(item.nextCapture === null ? null : typeof item.nextCapture) ||
          (item.decision === 'NEEDS_MORE' && !item.nextCapture) ||
          (item.decision !== 'NEEDS_MORE' && item.nextCapture !== null))
        throw new Error('INVALID_SCREEN_DETAIL');
    }
  }
  return result;
}

export async function processScreenBatch(task, invoke, resolveDuplicates = async () => ({matches: {}, metadata: {}})) {
  const started = Date.now();
  const list = validateScreenResult(await invoke('LIST', task.cards,
    task.captures.filter(c => c.captureId === task.listCaptureId), null), task, task.cards, 'LIST');
  const listMs = Date.now() - started;
  const dedupe = await resolveDuplicates(list.cards);
  const matches = dedupe?.matches || {};
  const selected = task.cards.filter(c => list.cards.find(x => x.cardId === c.cardId).decision === 'READ_DETAIL' &&
    !matches[c.cardId]);
  const details = [];
  // At most three one-screen previews per invocation; do not transcribe long full JDs here.
  for (let index = 0; index < selected.length; index += 3) {
    const cards = selected.slice(index, index + 3);
    const ids = new Set(cards.flatMap(c => c.detailCaptureIds));
    const result = validateScreenResult(await invoke('DETAIL', cards,
      task.captures.filter(c => ids.has(c.captureId)), list.cards.filter(c => cards.some(x => x.cardId === c.cardId))),
    task, cards, 'DETAIL');
    details.push(...result.cards);
  }
  const candidates = task.cards.map(card => {
    const initial = list.cards.find(c => c.cardId === card.cardId);
    const detail = details.find(c => c.cardId === card.cardId);
    const duplicateOf = matches[card.cardId];
    if (duplicateOf) return {...initial, decision: 'DUPLICATE',
      reason: `列表公司和完整岗位标题命中${duplicateOf.matchType === 'DATABASE' ? '正式JD' : '已有识别候选'}，不重复读取详情。`,
      duplicateOf, phase: 'LIST', listCaptureId: task.listCaptureId,
      detailCaptureIds: card.detailCaptureIds, sourceUrl: null, archiveReady: false};
    return {...(detail || initial), phase: detail ? 'DETAIL' : 'LIST',
      listCaptureId: task.listCaptureId, detailCaptureIds: card.detailCaptureIds,
      sourceUrl: null, archiveReady: false};
  });
  return {schemaVersion: 1, promptVersion: screenPromptVersion, taskId: task.taskId, mode: 'SCREEN_BATCH',
    criteria: task.criteria, candidates, listResult: list, dedupe: dedupe?.metadata || {},
    counts: {total: candidates.length, detailRead: details.length,
      kept: candidates.filter(c => c.decision === 'KEEP').length,
      excluded: candidates.filter(c => c.decision === 'EXCLUDE').length,
      duplicates: candidates.filter(c => c.decision === 'DUPLICATE').length,
      needsMore: candidates.filter(c => c.decision === 'NEEDS_MORE').length},
    timings: {listMs, detailMs: Date.now() - started - listMs, totalMs: Date.now() - started},
    semanticApproval: false, formalPostingWrites: 0};
}
