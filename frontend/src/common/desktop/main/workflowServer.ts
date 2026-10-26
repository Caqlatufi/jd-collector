import {createServer, type Socket} from 'node:net';
import {createHash, randomUUID} from 'node:crypto';
import {writeFileSync, mkdirSync} from 'node:fs';
import path from 'node:path';
import {BrowserWindows, PlatformOperationError} from './browserWindows';
import type {PlatformCode} from '../platform';
import {VisualCapture} from './capture';
import type {CaptureRect} from '../capture';
import {browserWorkflow} from './workflowBrowser';

/** Restricted local agent transport: native screenshots and input only. */
export function startWorkflowServer(browsers: BrowserWindows, userData: string): () => void {
  if (process.platform !== 'win32') return () => {};
  const pipe = '\\\\.\\pipe\\jd-collector-' + createHash('sha256').update(userData).digest('hex').slice(0, 20);
  const token = randomUUID();
  const captureRoot = process.env.JD_DESKTOP_USER_DATA ? path.join(userData, 'captures') : path.resolve(__dirname, '../../runtime/captures');
  const visual = new VisualCapture(captureRoot, (request, action) => browsers.visualTarget(request, action));
  const sockets = new Set<Socket>();
  const server = createServer(socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    socket.setTimeout(20000, () => socket.destroy());
    let buffer = '';
    let handled = false;
    socket.setEncoding('utf8');
    socket.on('data', chunk => {
      if (handled) return;
      buffer += chunk;
      if (buffer.length > 8192) { socket.destroy(); return; }
      if (!buffer.includes('\n')) return;
      handled = true;
      void (async () => {
        try {
          const input = JSON.parse(buffer.slice(0, buffer.indexOf('\n')));
          if (input.token !== token) throw new Error('Unauthorized');
          if (input.platform === 'WEB') {
            const result = await browserWorkflow(browsers, visual, input);
            socket.end(JSON.stringify({ok: true, data: result}) + '\n');
            return;
          }
          const platform = browsers.platforms().find(item => item.platform === input.platform);
          if (!platform) throw new PlatformOperationError('PLATFORM_DISABLED', '未注册的平台');
          if (['inspect', 'read', 'diagnose'].includes(input.action)) throw new PlatformOperationError('WORKFLOW_DEPRECATED', 'DOM读取已退役，请使用capture');
          if (!['info', 'open', 'openJob', 'tabs', 'focus', 'navigate', 'capture', 'scroll', 'click', 'type', 'key'].includes(input.action)) throw new Error('Unsupported action');
          const parameters: Record<string, string[]> = {
            info: [], open: ['key'], openJob: ['key', 'url'], tabs: ['key'], focus: ['key'], navigate: ['key', 'url'],
            capture: ['key', 'batchId', 'rect'], scroll: ['key', 'captureId', 'x', 'y', 'deltaX', 'deltaY'],
            click: ['key', 'captureId', 'x', 'y', 'intent'], type: ['key', 'captureId', 'text', 'replace'], key: ['key', 'captureId', 'keyCode'],
          };
          const allowed = ['token', 'platform', 'action', ...parameters[input.action]];
          if (Object.keys(input).some(key => !allowed.includes(key))) throw new Error('Unknown parameter');
          let result: unknown;
          if (input.action === 'info') result = {version: 2, backgroundJobCapture: true};
          else if (input.action === 'tabs') result = browsers.list().filter(tab => tab.platform === platform.platform);
          else if (input.action === 'open') result = browsers.openPlatform(platform.platform);
          else if (input.action === 'openJob') {
            if (platform.platform !== 'BOSS' || typeof input.key !== 'string' ||
                !/^jd-import:[0-9a-f-]{36}$/.test(input.key) || typeof input.url !== 'string') throw new Error('Invalid job task');
            const url = new URL(input.url);
            if (url.protocol !== 'https:' || url.username || url.password || url.port ||
                !['www.zhipin.com', 'zhipin.com'].includes(url.hostname) ||
                !/^\/job_detail\/[a-zA-Z0-9_~-]{1,100}\.html$/.test(url.pathname) || url.search || url.hash) throw new Error('Invalid job URL');
            result = browsers.openJob(input.key, url.href, platform.sessionKey);
          }
          else {
            const candidates = browsers.list().filter(tab => tab.platform === platform.platform);
            const target = input.key ? candidates.find(tab => tab.key === input.key) : candidates.find(tab => tab.active) || candidates[0];
            if (!target) throw new PlatformOperationError('TAB_NOT_FOUND', '请先打开平台');
            if (input.action === 'focus') result = browsers.focus(target.key);
            else if (input.action === 'capture') {
              if (!input.key || (input.batchId !== undefined && typeof input.batchId !== 'string')) throw new Error('Explicit key required');
              result = await visual.capture({platform: platform.platform, key: target.key, batchId: input.batchId, rect: input.rect as CaptureRect});
            } else if (['scroll', 'click', 'type', 'key'].includes(input.action)) {
              if (!input.key || typeof input.captureId !== 'string') throw new Error('Capture binding required');
              result = await visual.act({...input, platform: platform.platform, key: target.key});
            } else if (input.action === 'navigate') {
              if (typeof input.url !== 'string' || input.url.length > 2048) throw new Error('Invalid URL');
              const url = new URL(input.url);
              if (url.protocol !== 'https:' || url.username || url.password ||
                  !platform.domains.some(domain => url.hostname === domain || url.hostname.endsWith('.' + domain))) throw new Error('Platform mismatch');
              result = browsers.navigate(target.key, url.href);
            }
          }
          socket.end(JSON.stringify({ok: true, data: result}) + '\n');
        } catch (error) {
          socket.end(JSON.stringify({ok: false, error: error instanceof PlatformOperationError
            ? {code: error.code, message: error.message} : {code: 'WORKFLOW_REJECTED', message: '工作流请求被拒绝，请检查参数或客户端状态'}}) + '\n');
        }
      })();
    });
  });
  server.on('error', () => { console.error('Local workflow transport unavailable'); });
  server.listen(pipe, () => {
    try {
      mkdirSync(userData, {recursive: true});
      writeFileSync(path.join(userData, 'workflow-connection.json'), JSON.stringify({pipe, token}), {encoding: 'utf8', mode: 0o600});
    } catch { server.close(); console.error('Local workflow connection unavailable'); }
  });
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    visual.dispose();
    for (const socket of sockets) socket.destroy();
    if (server.listening) server.close();
  };
}
