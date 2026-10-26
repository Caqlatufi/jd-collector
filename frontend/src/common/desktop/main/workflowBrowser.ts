import {randomUUID} from 'node:crypto';
import {BrowserWindows, PlatformOperationError} from './browserWindows';
import {VisualCapture} from './capture';
import type {CaptureRect, VisualAction} from '../capture';
import {normalizeJobUrl} from '../jobUrl.mjs';

const parameters: Record<string, string[]> = {
  info: [], tabs: [], open: ['key', 'url'], openJob: ['key', 'url'], focus: ['key'], navigate: ['key', 'url'],
  close: ['key'], reload: ['key'], zoom: ['key', 'zoom'],
  capture: ['key', 'batchId', 'rect'], scroll: ['key', 'captureId', 'x', 'y', 'deltaX', 'deltaY'],
  click: ['key', 'captureId', 'x', 'y', 'intent'], type: ['key', 'captureId', 'text', 'replace'],
  key: ['key', 'captureId', 'keyCode'],
};

/** Generic browser workflow uses the same native capture/input guard as platform workflows. */
export async function browserWorkflow(browsers: BrowserWindows, visual: VisualCapture, input: Record<string, unknown>) {
  const action = input.action as string;
  const fields = parameters[action];
  if (!fields || Object.keys(input).some(key => !['token', 'platform', 'action', ...fields].includes(key)))
    throw new PlatformOperationError('WORKFLOW_REJECTED', '不支持的浏览器操作或参数');
  if (action === 'info') return {version: 3, backgroundJobCapture: true, genericJobCapture: true, companyAddressCapture: true, actions: Object.keys(parameters), input: 'Electron native; screenshot bound'};
  if (action === 'tabs') return browsers.list();
  if (input.key !== undefined && (typeof input.key !== 'string' || !/^[a-zA-Z0-9:_-]{1,100}$/.test(input.key)))
    throw new PlatformOperationError('WORKFLOW_REJECTED', '标签标识不正确');
  if (action === 'openJob') {
    if (typeof input.key !== 'string' || !/^(?:jd-import|company-address):[0-9a-f-]{36}$/.test(input.key))
      throw new PlatformOperationError('WORKFLOW_REJECTED', '收录任务标识不正确');
    return browsers.openJob(input.key, normalizeJobUrl(input.url), '');
  }
  if (action === 'open') {
    if (typeof input.url !== 'string' || input.url.length > 2048) throw new PlatformOperationError('WORKFLOW_REJECTED', '网页地址不正确');
    const url = new URL(input.url);
    if (url.protocol !== 'https:' || url.username || url.password) throw new PlatformOperationError('WORKFLOW_REJECTED', '网页只允许不含凭据的 HTTPS 地址');
    return browsers.open((input.key as string) || 'mcp-' + randomUUID(), url.href, url.hostname, url.hostname.replace(/[^a-zA-Z0-9_-]/g, '_'));
  }
  const target = browsers.list().find(tab => tab.key === input.key && !tab.pinned);
  if (!target) throw new PlatformOperationError('TAB_NOT_FOUND', '请指定已打开的网页标签');
  if (action === 'focus') return browsers.focus(target.key);
  if (action === 'close') return browsers.close(target.key);
  if (action === 'reload') return browsers.navigation(target.key, 'reload');
  if (action === 'zoom') {
    if (!['in', 'out', 'reset'].includes(input.zoom as string)) throw new PlatformOperationError('WORKFLOW_REJECTED', '缩放操作不正确');
    return browsers.zoom(target.key, input.zoom as 'in' | 'out' | 'reset');
  }
  if (action === 'navigate') {
    if (typeof input.url !== 'string' || input.url.length > 2048) throw new PlatformOperationError('WORKFLOW_REJECTED', '网页地址不正确');
    const url = new URL(input.url);
    if (url.protocol !== 'https:' || url.username || url.password) throw new PlatformOperationError('WORKFLOW_REJECTED', '网页只允许不含凭据的 HTTPS 地址');
    return browsers.navigate(target.key, url.href);
  }
  if (action === 'capture') {
    if (input.batchId !== undefined && typeof input.batchId !== 'string') throw new PlatformOperationError('WORKFLOW_REJECTED', '批次标识不正确');
    return visual.capture({platform: 'WEB', key: target.key, batchId: input.batchId as string | undefined, rect: input.rect as CaptureRect | undefined});
  }
  if (typeof input.captureId !== 'string') throw new PlatformOperationError('WORKFLOW_REJECTED', '输入操作必须绑定最新截图');
  return visual.act({...input, platform: 'WEB', key: target.key} as unknown as VisualAction);
}
