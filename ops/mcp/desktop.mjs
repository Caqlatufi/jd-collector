import net from 'node:net';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {localEnvironment} from '../../frontend/src/common/desktop/main/localEnvironment.mjs';

export function desktopRequest(action, fields = {}, env = localEnvironment()) {
  return (async () => {
    const userData = env.JD_DESKTOP_USER_DATA || path.join(env.APPDATA || '', 'JD Collector');
    let connection;
    try { connection = JSON.parse(await readFile(path.join(userData, 'workflow-connection.json'), 'utf8')); }
    catch { throw new Error('DESKTOP_UNAVAILABLE: 请先启动 JD Electron'); }
    return new Promise((resolve, reject) => {
      const socket = net.connect(connection.pipe);
      let buffer = '';
      const fail = message => { socket.destroy(); reject(new Error(message)); };
      socket.setEncoding('utf8');
      socket.setTimeout(20000, () => fail('WORKFLOW_TIMEOUT: 操作超时；核对状态后再决定是否重试'));
      socket.on('error', () => fail('DESKTOP_UNAVAILABLE: 无法连接 JD Electron'));
      socket.on('connect', () => socket.write(JSON.stringify({...fields, token: connection.token, platform: 'WEB', action}) + '\n'));
      socket.on('data', chunk => {
        buffer += chunk;
        if (buffer.length > 2_000_000) fail('WORKFLOW_RESPONSE_TOO_LARGE');
      });
      socket.on('end', () => {
        let result;
        try { result = JSON.parse(buffer); } catch { reject(new Error('WORKFLOW_INVALID_RESPONSE')); return; }
        if (result.ok) resolve(result.data);
        else if (result.error?.code === 'PLATFORM_DISABLED') reject(new Error('DESKTOP_UPDATE_REQUIRED: 当前 Electron 尚未加载 MCP 浏览接口，请保存输入后重启客户端'));
        else reject(new Error((result.error?.code || 'WORKFLOW_FAILED') + ': ' + (result.error?.message || '操作失败')));
      });
    });
  })();
}

export async function jdRequest(endpoint, query = {}, env = localEnvironment()) {
  const base = new URL(env.JD_MCP_API_URL || 'http://127.0.0.1:7890/jd-collector/api/');
  if (base.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(base.hostname) || base.username || base.password ||
      base.pathname !== '/jd-collector/api/' || base.search || base.hash) throw new Error('JD_API_CONFIG_INVALID');
  const url = new URL(endpoint, base);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) for (const item of Array.isArray(value) ? value : [value]) url.searchParams.append(key, String(item));
  }
  let response;
  try { response = await fetch(url, {signal: AbortSignal.timeout(15000), redirect: 'error'}); }
  catch { throw new Error('JD_API_UNAVAILABLE: 请确认本地 JD 后端已启动'); }
  if (!response.ok) throw new Error('JD_API_HTTP_' + response.status);
  const result = await response.json();
  if (result.code !== 200) throw new Error('JD_API_ERROR_' + result.code);
  return result;
}

export async function captureImage(ref, env = localEnvironment()) {
  // The application owns the capture path; allow only its two documented capture roots.
  const roots = [fileURLToPath(new URL('../../runtime/captures/', import.meta.url))];
  const userData = env.JD_DESKTOP_USER_DATA || path.join(env.APPDATA || '', 'JD Collector');
  roots.push(path.join(userData, 'captures'));
  const file = path.resolve(ref.filePath);
  if (!roots.some(root => { const relative = path.relative(path.resolve(root), file); return relative && !relative.startsWith('..') && !path.isAbsolute(relative); }))
    throw new Error('CAPTURE_PATH_INVALID');
  const bytes = await readFile(file);
  if (bytes.length > 20 * 1024 * 1024 || createHash('sha256').update(bytes).digest('hex') !== ref.sha256)
    throw new Error('CAPTURE_HASH_MISMATCH');
  return {type: 'image', mimeType: 'image/png', data: bytes.toString('base64')};
}
