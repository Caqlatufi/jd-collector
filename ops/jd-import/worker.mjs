import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {atomicJson, projectRoot} from '../recognition/queue.mjs';
import {importPosting, ImportError} from './importer.mjs';
import {readPage} from './model.mjs';
import {FileCheckpointer} from './checkpointer.mjs';

const execute = promisify(execFile);
export function localApi(base) {
  const u = new URL(base);
  if (u.protocol !== 'http:' || u.hostname !== '127.0.0.1' || u.username || u.password || u.pathname !== '/jd-collector/api' || u.search || u.hash) {
    throw new ImportError('INVALID_API', '收录服务只允许访问本机 JD Collector API');
  }
  return async (method, route, body, full = false) => {
    let response;
    try { response = await fetch(base + route, {method, headers: {'Content-Type': 'application/json'},
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000)}); }
    catch { throw new ImportError('API_UNAVAILABLE', '本地接口不可达或超时；重试会先核对已收录记录'); }
    let data;
    try { data = await response.json(); } catch { throw new ImportError('API_INVALID_RESPONSE', '本地接口返回无效内容'); }
    if (!response.ok || data.code !== 200) {
      const error = new ImportError('API_REJECTED', `本地接口拒绝请求（HTTP ${response.status}）：${String(data.msg || '请检查服务').slice(0, 300)}`);
      error.httpStatus = response.status;
      throw error;
    }
    return full ? data : data.result;
  };
}

export async function desktopWorkflow(action, payload = {}) {
  const argumentsList = ['frontend/src/app/electron/workflow.mjs', 'WEB', action];
  if (action === 'openJob') argumentsList.push(payload.url, payload.key);
  else if (['info', 'tabs'].includes(action)) { /* No target needed. */ }
  else {
    const names = {key: 'key', captureId: 'capture', rect: 'rect', x: 'x', y: 'y', deltaX: 'delta-x', deltaY: 'delta-y'};
    for (const [key, value] of Object.entries(payload)) {
      if (!names[key]) throw new ImportError('INVALID_ACTION', '收录流程请求了不支持的原生动作');
      argumentsList.push('--' + names[key], key === 'rect' ? [value.x, value.y, value.width, value.height].join(',') : String(value));
    }
  }
  let stdout;
  try { ({stdout} = await execute(process.execPath, argumentsList, {cwd: projectRoot, windowsHide: true, timeout: 25000, maxBuffer: 2_000_000})); }
  catch (error) {
    stdout = error.stdout;
    if (!stdout?.trim()) throw new ImportError('CLIENT_NOT_RUNNING', '客户端原生通道不可达，请打开 JD Collector 客户端后继续', 'WAITING_USER');
  }
  let data;
  try { data = JSON.parse(stdout); } catch { throw new ImportError('CLIENT_INVALID_RESPONSE', '客户端返回无效内容，请重启后继续', 'WAITING_USER'); }
  if (!data.ok) {
    const code = data.error?.code;
    if (['info', 'openJob'].includes(action) && code === 'WORKFLOW_REJECTED') {
      throw new ImportError('CLIENT_UPGRADE_REQUIRED', '客户端尚未加载后台收录功能，请保存输入并重启客户端后继续', 'WAITING_USER');
    }
    const allowed = new Set(['TAB_NOT_FOUND', 'TARGET_NOT_VISIBLE', 'TARGET_NOT_FOCUSED', 'PLATFORM_MISMATCH',
      'WINDOW_MINIMIZED', 'WINDOW_HIDDEN', 'WINDOW_NOT_FOCUSED', 'PAGE_CHANGED', 'STALE_CAPTURE', 'CAPTURE_EXPIRED',
      'CAPTURE_TIMEOUT', 'CAPTURE_EMPTY', 'CAPTURE_TOO_LARGE', 'CAPTURE_WRITE_FAILED', 'INVALID_CAPTURE_RECT',
      'READ_BUSY', 'TAB_NOT_ACTIVE', 'TARGET_IN_USE', 'WORKFLOW_REJECTED']);
    throw new ImportError(allowed.has(code) ? code : 'CLIENT_OPERATION_FAILED',
      typeof data.error?.message === 'string' ? data.error.message.slice(0, 300) : '客户端操作失败，请检查目标标签', 'WAITING_USER');
  }
  return data.data;
}

export async function work(directory, attempt, settings) {
  const run = path.join(directory, 'attempt-' + attempt);
  await fs.mkdir(run, {recursive: true});
  await atomicJson(path.join(run, 'worker.json'), {pid: process.pid,
    processStartedAt: new Date(Date.now() - process.uptime() * 1000).toISOString()});
  const remember = (name, value) => atomicJson(path.join(run, name + '.json'), value);
  let calls = 0;
  try {
    const task = JSON.parse(await fs.readFile(path.join(directory, 'task.json'), 'utf8'));
    const api = localApi(settings.apiBase);
    const document = await fs.readFile(path.join(projectRoot, '.agents/skills/jd-import-prompt.md'), 'utf8');
    const standard = document.match(/```text\r?\n([\s\S]*?)\r?\n```/)?.[1];
    if (!standard) throw new ImportError('PROMPT_MISSING', '自动收录提示词缺失');
    const result = await importPosting(task, {api, workflow: desktopWorkflow, remember,
      checkpointer: new FileCheckpointer(path.join(directory, 'graph.checkpoint')),
      progress: data => atomicJson(path.join(run, 'progress.json'), {...data, updatedAt: new Date().toISOString()}),
      model: input => readPage(input, path.join(run, 'model-' + ++calls), settings, standard),
      repairExisting: async posting => {
        // Resume only a posting written by THIS task. Never change a preexisting duplicate.
        for (let previous = attempt - 1; previous >= 1; previous--) {
          const old = path.join(directory, 'attempt-' + previous);
          let saved, validated;
          try {
            validated = JSON.parse(await fs.readFile(path.join(old, 'validated-posting.json'), 'utf8'));
          } catch { continue; }
          try { saved = JSON.parse(await fs.readFile(path.join(old, 'saved-posting.json'), 'utf8')); } catch { /* POST response may have been lost. */ }
          if ((saved ? saved.postingId !== posting.id : !posting.riskNotes?.includes(`自动收录任务：${task.taskId}；`)) ||
              validated.request.sourceUrl !== posting.sourceUrl || validated.request.rawJd !== posting.rawJd) return null;
          const current = await api('GET', `/posting-knowledge/postings/${posting.id}/terms`);
          if (!current.processed || current.stale) {
            await api('PUT', `/posting-knowledge/postings/${posting.id}/terms`, {extractorVersion: 'jd-term-v1', terms: validated.terms});
          }
          const check = await api('GET', `/posting-knowledge/postings/${posting.id}/terms`);
          if (!check.processed || check.stale) throw new ImportError('TERMS_SAVE_FAILED', 'JD 已保存，知识词仍未保存成功', 'PARTIAL');
          return {postingId: posting.id, title: posting.title, message: 'JD 已收录，本任务知识词已补齐；保留岗位原阶段'};
        }
        return null;
      },
    });
    const completion = {status: result.status || 'SUCCEEDED', attempt, ...result, completedAt: new Date().toISOString()};
    await atomicJson(path.join(run, 'completion.json'), completion);
    return completion;
  } catch (error) {
    const safe = error instanceof ImportError ? error : new ImportError('IMPORT_FAILED', '自动收录发生异常，已保留本地证据，请检查后重试');
    const completion = {status: safe.status, attempt, errorCode: safe.code, message: safe.message, completedAt: new Date().toISOString()};
    await atomicJson(path.join(run, 'completion.json'), completion);
    return completion;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [directory, attempt, codex = '', timeout = '120000', model = 'gpt-6-astra', effort = 'medium',
    apiBase = 'http://127.0.0.1:7890/jd-collector/api'] = process.argv.slice(2);
  const result = await work(path.resolve(directory), Number(attempt), {codex, timeout: Number(timeout), model, effort, apiBase});
  console.log(JSON.stringify({taskId: path.basename(directory), status: result.status, errorCode: result.errorCode}));
}
