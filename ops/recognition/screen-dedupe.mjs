import fs from 'node:fs/promises';
import path from 'node:path';

const defaultPostingsUrl = 'http://127.0.0.1:7890/jd-collector/api/postings';
const incompletePattern = /(?:\.{3}|…|\.\.\.|[（(][^）)]*$)/;

function normalized(value) {
  return typeof value === 'string' ? value.normalize('NFKC').trim().toLowerCase() : '';
}

export function normalizeCompany(value) {
  const text = normalized(value);
  if (!text || incompletePattern.test(text)) return null;
  return text.replace(/[\s·•・,，.。]/g, '')
    .replace(/(?:有限责任公司|股份有限公司|有限公司)$/u, '');
}

export function normalizeTitle(value) {
  const text = normalized(value);
  if (!text || incompletePattern.test(text)) return null;
  // NFKC unifies full-width brackets. Keep their content because it normally identifies the direction.
  return text.replace(/[\s·•・,，.。/／_-]/g, '');
}

export function duplicateKey(platform, company, title) {
  const companyKey = normalizeCompany(company);
  const titleKey = normalizeTitle(title);
  return platform && companyKey && titleKey ? `${platform}\u0000${companyKey}\u0000${titleKey}` : null;
}

async function databaseEntries(platform, fetchImpl) {
  const entries = [];
  const base = new URL(process.env.JD_RECOGNITION_POSTINGS_URL || defaultPostingsUrl);
  let totalPages = 1;
  for (let number = 1; number <= totalPages; number++) {
    const url = new URL(base);
    url.searchParams.set('number', String(number));
    url.searchParams.set('size', '100');
    const response = await fetchImpl(url);
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    const payload = await response.json();
    if (payload.code !== 200 || !Array.isArray(payload.result)) throw new Error('INVALID_POSTINGS_RESPONSE');
    totalPages = Math.max(1, Number(payload.page?.totalPages) || 1);
    for (const posting of payload.result) {
      if (posting.source !== platform) continue;
      entries.push({matchType: 'DATABASE', postingId: posting.id,
        company: posting.companyName, title: posting.title});
    }
  }
  return entries;
}

async function sessionEntries(task, directory) {
  const entries = [];
  const jobs = path.dirname(path.resolve(directory));
  const currentQueuedAt = Date.parse(task.queuedAt || '') || Number.POSITIVE_INFINITY;
  for (const entry of await fs.readdir(jobs, {withFileTypes: true}).catch(() => [])) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === task.taskId) continue;
    const other = path.join(jobs, entry.name);
    try {
      const otherTask = JSON.parse(await fs.readFile(path.join(other, 'task.json'), 'utf8'));
      if (otherTask.platform !== task.platform || otherTask.mode !== 'SCREEN_BATCH' ||
          (Date.parse(otherTask.queuedAt || '') || 0) >= currentQueuedAt) continue;
      const result = JSON.parse(await fs.readFile(path.join(other, 'result.json'), 'utf8'));
      for (const candidate of result.candidates || []) {
        if (candidate.decision !== 'KEEP') continue;
        entries.push({matchType: 'SCREEN_BATCH', taskId: otherTask.taskId, cardId: candidate.cardId,
          company: candidate.company, title: candidate.title});
      }
    } catch { /* An unfinished or malformed older task is not safe dedupe evidence. */ }
  }
  return entries;
}

export async function loadDuplicateIndex(task, directory, fetchImpl = globalThis.fetch) {
  const warnings = [];
  let database = [];
  try {
    if (typeof fetchImpl !== 'function') throw new Error('FETCH_UNAVAILABLE');
    database = await databaseEntries(task.platform, fetchImpl);
  } catch (error) {
    warnings.push(`DATABASE_INDEX_${String(error?.message || 'FAILED').slice(0, 80)}`);
  }
  const session = await sessionEntries(task, directory);
  return {entries: [...database, ...session], metadata: {
    keyRule: 'platform+normalizedCompany+fullTitle', databaseEntries: database.length,
    sessionEntries: session.length, warnings}};
}

export function findListDuplicates(task, listCards, index) {
  const known = new Map();
  for (const entry of index.entries || []) {
    const key = duplicateKey(task.platform, entry.company, entry.title);
    if (key && !known.has(key)) known.set(key, entry);
  }
  const current = new Map();
  const matches = {};
  for (const card of listCards) {
    if (card.decision !== 'READ_DETAIL') continue;
    const key = duplicateKey(task.platform, card.company, card.title);
    if (!key) continue;
    const previous = known.get(key) || current.get(key);
    if (previous) matches[card.cardId] = previous;
    else current.set(key, {matchType: 'CURRENT_BATCH', taskId: task.taskId, cardId: card.cardId,
      company: card.company, title: card.title});
  }
  return {matches, metadata: {...index.metadata, matched: Object.keys(matches).length}};
}
