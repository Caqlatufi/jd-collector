import {app, BrowserWindow, ipcMain} from 'electron';
import {DESKTOP_COMMANDS, DESKTOP_EVENT_CHANNEL, DESKTOP_REQUEST_CHANNEL} from '../contract';
import type {DesktopCommand, DesktopEnvelope, DesktopResult, WindowState} from '../contract';
import {BrowserWindows, WORKBENCH_KEY, PlatformOperationError, type BrowserShell} from './browserWindows';
import type {PlatformAdapter, PlatformCode} from '../platform';
import {startWorkflowServer} from './workflowServer';

export function registerDesktop(window: BrowserWindow, allowedUrls: Set<string>, retry: () => void, allowLocalHttp: boolean, shell: BrowserShell, adapters: PlatformAdapter[] = []) {
  const send = (event: DesktopEnvelope) => {
    if (!shell.workbench.webContents.isDestroyed()) shell.workbench.webContents.send(DESKTOP_EVENT_CHANNEL, event);
    browsers.send(event);
  };
  const state = (): WindowState => ({maximized: window.isMaximized(), minimized: window.isMinimized()});
  const browsers = new BrowserWindows(payload => send({type: 'browser.changed', payload}), allowLocalHttp, shell, adapters);
  const stopWorkflow = startWorkflowServer(browsers, app.getPath('userData'));
  const notifyWindow = () => send({type: 'window.changed', payload: state()});
  window.on('maximize', notifyWindow);
  window.on('unmaximize', notifyWindow);
  window.on('minimize', notifyWindow);
  window.on('restore', notifyWindow);
  ipcMain.handle(DESKTOP_REQUEST_CHANNEL, async (event, command: DesktopCommand, input: unknown): Promise<DesktopResult<unknown>> => {
    const source = event.senderFrame;
    const sourceUrl = source?.url.split('#')[0].split('?')[0];
    const toolbar = browsers.ownsToolbar(event);
    const workbench = event.sender === shell.workbench.webContents && source === shell.workbench.webContents.mainFrame && sourceUrl &&
        [...allowedUrls].some(url => url.endsWith('/') ? sourceUrl.startsWith(url) : sourceUrl === url);
    if (!toolbar && !workbench) {
      return {ok: false, error: {code: 'INVALID_SOURCE', message: '桌面命令只能从本地工作台调用'}};
    }
    if (!DESKTOP_COMMANDS.includes(command)) return {ok: false, error: {code: 'UNKNOWN_COMMAND', message: '不支持的桌面命令'}};
    if (toolbar && !command.startsWith('browser.') && command !== 'window.focus') return {ok: false, error: {code: 'INVALID_SOURCE', message: '浏览器工具栏不能执行该命令'}};
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {ok: false, error: {code: 'INVALID_INPUT', message: '桌面命令参数格式不正确'}};
    const data = input as Record<string, unknown>;
    try {
      if (command.startsWith('browser.') && !['browser.list', 'browser.show'].includes(command) &&
          (typeof data.key !== 'string' || !/^[a-zA-Z0-9:_-]{1,100}$/.test(data.key))) throw new Error('窗口标识格式不正确');
      if (data.sessionKey !== undefined && (typeof data.sessionKey !== 'string' || !/^[a-zA-Z0-9:_-]{1,100}$/.test(data.sessionKey))) throw new Error('窗口会话标识格式不正确');
      let result: unknown;
      switch (command) {
        case 'platform.list': result = browsers.platforms(); break;
        case 'platform.open': result = browsers.openPlatform(data.platform as PlatformCode); break;
        case 'platform.inspect':
        case 'platform.read': {
          throw new PlatformOperationError('WORKFLOW_DEPRECATED', 'DOM读取已退役，请使用本地截图workflow');
        }
        case 'runtime.info': result = {version: app.getVersion(), platform: process.platform}; break;
        case 'app.retry': setTimeout(retry, 50); result = {started: true}; break;
        case 'window.minimize': window.minimize(); result = state(); break;
        case 'window.focus': browsers.focus(WORKBENCH_KEY); result = state(); break;
        case 'window.toggleMaximize': window.isMaximized() ? window.unmaximize() : window.maximize(); result = state(); break;
        case 'browser.list': result = browsers.list(); break;
        case 'browser.show': result = browsers.show(); break;
        case 'browser.focus': result = browsers.focus(data.key as string); break;
        case 'browser.back': result = browsers.navigation(data.key as string, 'back'); break;
        case 'browser.forward': result = browsers.navigation(data.key as string, 'forward'); break;
        case 'browser.reload': result = browsers.navigation(data.key as string, 'reload'); break;
        case 'browser.navigate':
          if (typeof data.url !== 'string' || data.url.length > 2048) throw new Error('网页地址不正确');
          result = browsers.navigate(data.key as string, data.url); break;
        case 'browser.close': result = browsers.close(data.key as string); break;
        case 'browser.session': result = await browsers.summary(data.key as string); break;
        case 'browser.open':
          if (typeof data.url !== 'string' || data.url.length > 2048 || (data.title !== undefined && (typeof data.title !== 'string' || data.title.length > 120))) throw new Error('网页地址或标题不正确');
          result = browsers.open(data.key as string, data.url, data.title as string | undefined, data.sessionKey as string | undefined); break;
      }
      return {ok: true, data: result};
    } catch (error) {
      if (error instanceof PlatformOperationError) return {ok: false, error: {code: error.code, message: error.message}};
      // Only fixed validation/business errors are exposed. Native stacks may contain URLs or secrets.
      const known = error instanceof Error && /^(网页|窗口|请先)/.test(error.message);
      return {ok: false, error: {code: 'DESKTOP_OPERATION_FAILED', message: known ? error.message : '桌面操作失败，请检查窗口状态'}};
    }
  });
  return () => { stopWorkflow(); ipcMain.removeHandler(DESKTOP_REQUEST_CHANNEL); browsers.closeAll(); };
}
