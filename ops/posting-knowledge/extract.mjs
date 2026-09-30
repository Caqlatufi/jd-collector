import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveCodex, runProcess} from '../recognition/worker.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const defaultApi = 'http://127.0.0.1:7890/jd-collector/api';
const priorityNames = [['HIGH', 'high'], ['MEDIUM', 'medium'], ['LOW', 'low']];

function parseArgs(values) {
  const result = {all: false, pending: false, postingId: null, dryRun: false, api: defaultApi};
  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    if (value === '--all') result.all = true;
    else if (value === '--pending') result.pending = true;
    else if (value === '--posting') result.postingId = Number(values[++index]);
    else if (value === '--dry-run') result.dryRun = true;
    else if (value === '--api') result.api = values[++index];
    else throw new Error('Usage: node ops/posting-knowledge/extract.mjs (--all|--pending|--posting <id>) [--dry-run] [--api <base-url>]');
  }
  if ([result.all, result.pending, Number.isInteger(result.postingId) && result.postingId > 0].filter(Boolean).length !== 1) {
    throw new Error('Exactly one of --all, --pending or --posting <id> is required');
  }
  return result;
}

async function getJson(url) {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok || body.code !== 200) throw new Error(`HTTP_${response.status}_${body.msg || 'FAILED'}`);
  return body;
}

async function postings(api, postingId, pending) {
  if (postingId) return [(await getJson(`${api}/postings/${postingId}`)).result];
  let pendingIds;
  if (pending) {
    const options = (await getJson(`${api}/posting-knowledge/postings`)).result;
    pendingIds = new Set(options.filter(item => !item.processed || item.stale).map(item => item.postingId));
  }
  const rows = [];
  for (let number = 1, pages = 1; number <= pages; number++) {
    const body = await getJson(`${api}/postings?number=${number}&size=100`);
    rows.push(...body.result);
    pages = Math.max(1, Number(body.page?.totalPages) || 1);
  }
  return rows.filter(row => !pendingIds || pendingIds.has(row.id)).sort((left, right) => left.id - right.id);
}

function validateOutput(output, input) {
  if (output?.extractorVersion !== 'jd-term-v1' || !Array.isArray(output.postings) ||
      output.postings.length !== input.length) throw new Error('INVALID_TERM_OUTPUT');
  const expected = input.map(item => item.postingId);
  const actual = output.postings.map(item => item.postingId);
  if (expected.some((id, index) => id !== actual[index]) || new Set(actual).size !== actual.length) {
    throw new Error('INVALID_TERM_POSTING_IDS');
  }
  return output;
}

function validatePosting(posting) {
  let count = 0;
  const seen = new Set();
  for (const [, field] of priorityNames) {
    if (!Array.isArray(posting[field])) throw new Error('INVALID_TERM_PRIORITY_LIST');
    for (const term of posting[field]) {
      if (typeof term !== 'string' || !term.trim() || [...term.trim()].length > 100) throw new Error('INVALID_TERM');
      const key = term.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, '');
      if (seen.has(key)) throw new Error('DUPLICATE_TERM_IN_OUTPUT');
      seen.add(key);
      count++;
    }
  }
  if (count > 30) throw new Error('TOO_MANY_TERMS');
  return posting;
}

async function replaceTerms(api, posting) {
  const terms = priorityNames.flatMap(([priority, field]) => posting[field].map(term => ({term, priority})));
  const response = await fetch(`${api}/posting-knowledge/postings/${posting.postingId}/terms`, {
    method: 'PUT', headers: {'content-type': 'application/json'},
    body: JSON.stringify({extractorVersion: 'jd-term-v1', terms}),
  });
  const body = await response.json();
  if (!response.ok || body.code !== 200) throw new Error(`SAVE_${posting.postingId}_${body.msg || response.status}`);
  if (!body.result?.processed || body.result.stale) throw new Error(`READBACK_${posting.postingId}_FAILED`);
  return body.result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const source = await postings(args.api.replace(/\/$/, ''), args.postingId, args.pending);
  const promptDocument = await fs.readFile(path.join(projectRoot, '.agents/skills/jd-knowledge-prompt.md'), 'utf8');
  const standard = promptDocument.match(/```text\r?\n([\s\S]*?)\r?\n```/)?.[1];
  if (!standard) throw new Error('PROMPT_NOT_FOUND');
  const runId = `extract-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const runDirectory = path.join(projectRoot, 'runtime/posting-knowledge', runId);
  await fs.mkdir(runDirectory, {recursive: true});
  const codex = await resolveCodex(process.env.JD_KNOWLEDGE_CODEX || '');
  const summary = {runId, dryRun: args.dryRun, requested: source.length, completed: 0, empty: 0,
    failed: 0, high: 0, medium: 0, low: 0, postings: []};

  for (let index = 0; index < source.length; index += 8) {
    const rows = source.slice(index, index + 8);
    const input = rows.map(row => ({postingId: row.id, title: row.title, direction: row.direction,
      rawJd: row.rawJd, requiredSkills: row.requiredSkills, bonusSkills: row.bonusSkills}));
    const batchDirectory = path.join(runDirectory, `batch-${String(index / 8 + 1).padStart(2, '0')}`);
    await fs.mkdir(batchDirectory);
    const prompt = standard + '\n\n' + JSON.stringify({postings: input});
    const outputFile = path.join(batchDirectory, 'raw-result.json');
    await fs.writeFile(path.join(batchDirectory, 'prompt.txt'), prompt, 'utf8');
    const cliArgs = ['exec', '--model', 'gpt-6-astra', '-c', 'model_reasoning_effort="medium"',
      '--sandbox', 'read-only', '-c', 'approval_policy="never"', '-c', 'project_doc_max_bytes=0',
      '-c', 'web_search="disabled"', '-c', 'mcp_servers={}', '--disable', 'shell_tool', '--disable', 'apps',
      '--disable', 'multi_agent', '--disable', 'plugins', '--skip-git-repo-check', '--color', 'never',
      '--output-last-message', outputFile, '--cd', batchDirectory, '-'];
    try {
      await runProcess(codex, cliArgs, prompt, batchDirectory, 180000);
      const result = validateOutput(JSON.parse((await fs.readFile(outputFile, 'utf8')).replace(/^\uFEFF/, '')), input);
      for (const candidate of result.postings) {
        try {
          const posting = validatePosting(candidate);
          const counts = {high: posting.high.length, medium: posting.medium.length, low: posting.low.length};
          if (!args.dryRun) await replaceTerms(args.api.replace(/\/$/, ''), posting);
          summary.completed++;
          summary.empty += counts.high + counts.medium + counts.low === 0 ? 1 : 0;
          summary.high += counts.high; summary.medium += counts.medium; summary.low += counts.low;
          summary.postings.push({postingId: posting.postingId, status: args.dryRun ? 'VALIDATED' : 'SAVED', ...counts});
        } catch (error) {
          summary.failed++;
          summary.postings.push({postingId: candidate.postingId, status: 'FAILED', error: String(error.message || error)});
        }
      }
    } catch (error) {
      summary.failed += rows.length;
      summary.postings.push(...rows.map(row => ({postingId: row.id, status: 'FAILED', error: String(error.message || error)})));
      await fs.writeFile(path.join(runDirectory, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
      throw error;
    }
    await fs.writeFile(path.join(runDirectory, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
    console.log(JSON.stringify({batch: index / 8 + 1, completed: summary.completed, total: source.length}));
  }
  console.log(JSON.stringify(summary, null, 2));
  if (summary.failed) process.exitCode = 1;
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
