import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {atomicJson, projectRoot} from '../recognition/queue.mjs';
import {ImportError} from './importer.mjs';
import {discoverCompanyAddress} from './address-graph.mjs';
import {desktopWorkflow, localApi} from './worker.mjs';
import {readPage} from './model.mjs';
import {FileCheckpointer} from './checkpointer.mjs';

export async function work(directory, attempt, settings) {
  const run = path.join(directory, 'attempt-' + attempt);
  await fs.mkdir(run, {recursive: true});
  await atomicJson(path.join(run, 'worker.json'), {pid: process.pid, processStartedAt: new Date(Date.now() - process.uptime() * 1000).toISOString()});
  let calls = 0;
  try {
    const task = JSON.parse(await fs.readFile(path.join(directory, 'task.json'), 'utf8'));
    const standard = await fs.readFile(path.join(projectRoot, '.agents/skills/company-address-prompt.md'), 'utf8');
    const result = await discoverCompanyAddress(task, {api: localApi(settings.apiBase), workflow: desktopWorkflow,
      remember: (name, data) => atomicJson(path.join(run, name + '.json'), data),
      progress: data => atomicJson(path.join(run, 'progress.json'), {...data, updatedAt: new Date().toISOString()}),
      checkpointer: new FileCheckpointer(path.join(directory, 'graph.checkpoint')),
      model: input => readPage(input, path.join(run, 'model-' + ++calls), {...settings, promptVersion: 'company-address-v1'}, standard)});
    const completion = {status: 'SUCCEEDED', ...result, attempt, completedAt: new Date().toISOString()};
    await atomicJson(path.join(run, 'completion.json'), completion);
    return completion;
  } catch (error) {
    const safe = error instanceof ImportError ? error : new ImportError('ADDRESS_LOOKUP_FAILED', '地址查询发生异常，证据已保留，请重试');
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
