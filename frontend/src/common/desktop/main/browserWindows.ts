import {BrowserWindow, WebContentsView, session} from 'electron';
import type {IpcMainInvokeEvent, WebContentsViewConstructorOptions} from 'electron';
import {pathToFileURL} from 'node:url';
import {DESKTOP_EVENT_CHANNEL} from '../contract';
import type {BrowserState, DesktopEnvelope} from '../contract';
import type {PlatformAdapter, PlatformDefinition, PlatformCode} from '../platform';
import type {CaptureRequest} from '../capture';
import type {VisualTarget} from './capture';

export class PlatformOperationError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

export interface BrowserShell {html: string; host: BrowserWindow; workbench: WebContentsView}
export const WORKBENCH_KEY = 'jd-workbench';
interface Entry {view: WebContentsView; partition: string; requestedUrl: string; state: BrowserState; revision: number}
const TOOLBAR_HEIGHT = 98;

/** Each tab owns a live WebContents; focus and hide never reload the document. */
export class BrowserWindows {
  private readonly entries = new Map<string, Entry>();
  private host?: BrowserWindow;
  private activeKey: string = WORKBENCH_KEY;
  private popupSequence = 0;
  private disposing = false;
  private visualEpoch = 0;
  constructor(private readonly emit: (state: BrowserState) => void, private readonly allowLocalHttp: boolean,
              private readonly shell: BrowserShell, private readonly adapters: PlatformAdapter[] = []) {
    this.host = shell.host;
    this.host.on('resize', () => { this.visualEpoch++; this.layout(); });
    this.host.on('blur', () => { this.visualEpoch++; });
    this.host.on('move', () => { this.visualEpoch++; });
    this.layout();
  }

  ownsToolbar(event: IpcMainInvokeEvent): boolean {
    return Boolean(this.host && !this.host.isDestroyed() && event.sender === this.host.webContents &&
      event.senderFrame === this.host.webContents.mainFrame && event.senderFrame?.url === pathToFileURL(this.shell.html).href);
  }
  send(event: DesktopEnvelope) {
    if (this.host && !this.host.isDestroyed()) this.host.webContents.send(DESKTOP_EVENT_CHANNEL, event);
  }
  private ensureHost(): BrowserWindow { return this.shell.host; }
  private workbenchState(): BrowserState {
    return {key: WORKBENCH_KEY, title: 'JD Collector', url: '', pinned: true, active: this.activeKey === WORKBENCH_KEY,
      status: 'ready', message: '本地求职工作台 · 固定标签，不能关闭', canGoBack: false, canGoForward: false};
  }
  show(): BrowserState[] {
    const host = this.ensureHost();
    if (host.isMinimized()) host.restore();
    host.show(); host.focus(); this.layout();
    return this.list();
  }
  private layout() {
    if (!this.host || this.host.isDestroyed()) return;
    const [width, height] = this.host.getContentSize();
    this.shell.workbench.setBounds({x: 0, y: TOOLBAR_HEIGHT, width, height: Math.max(0, height - TOOLBAR_HEIGHT)});
    this.shell.workbench.setVisible(this.activeKey === WORKBENCH_KEY);
    for (const [key, entry] of this.entries) {
      entry.view.setBounds({x: 0, y: TOOLBAR_HEIGHT, width, height: Math.max(0, height - TOOLBAR_HEIGHT)});
      entry.view.setVisible(key === this.activeKey);
    }
  }
  private validateUrl(value: string): URL {
    let url: URL;
    try { url = new URL(value); } catch { throw new Error('网页地址格式不正确'); }
    const local = ['127.0.0.1', 'localhost'].includes(url.hostname);
    if (url.username || url.password || (url.protocol !== 'https:' && !(this.allowLocalHttp && local && url.protocol === 'http:'))) {
      throw new Error('网页只接受 HTTPS 地址；本地测试可使用回环 HTTP');
    }
    return url;
  }
  private safeUrl(value: string): string {
    try { const url = new URL(value); return url.origin === 'null' ? url.protocol + url.pathname : url.origin + url.pathname; }
    catch { return ''; }
  }
  private publish(entry: Entry) {
    const contents = entry.view.webContents;
    if (contents.isDestroyed()) return;
    entry.state = {...entry.state, active: entry.state.key === this.activeKey,
      platform: this.adapterFor(contents.getURL() || entry.requestedUrl)?.platform, pageRevision: entry.revision,
      canGoBack: contents.navigationHistory.canGoBack(), canGoForward: contents.navigationHistory.canGoForward(),
      url: this.safeUrl(contents.getURL()) || this.safeUrl(entry.requestedUrl)};
    this.emit({...entry.state});
  }
  private update(entry: Entry, status: BrowserState['status'], message: string) {
    entry.state = {...entry.state, status, message}; this.publish(entry);
  }
  private create(key: string, partition: string, title: string, options?: WebContentsViewConstructorOptions): Entry {
    if (this.entries.size >= 30) throw new Error('网页标签已达30个，请先关闭不用的标签');
    const host = this.ensureHost();
    const view = new WebContentsView({...options, webPreferences: {...options?.webPreferences, partition, nodeIntegration: false, contextIsolation: true,
      sandbox: true, backgroundThrottling: false}});
    const entry: Entry = {view, partition, requestedUrl: '', revision: 0, state: {key, title, url: '', status: 'loading', message: '正在打开网页'}};
    this.entries.set(key, entry);
    host.contentView.addChildView(view);
    const contents = view.webContents;
    contents.on('before-input-event', () => { this.visualEpoch++; });
    contents.on('before-mouse-event', (_event, input) => {
      if (input.type === 'mouseDown' || input.type === 'mouseWheel') this.visualEpoch++;
    });
    contents.on('blur', () => { this.visualEpoch++; });
    contents.on('did-start-navigation', (_event, _url, _inPlace, mainFrame) => {
      if (mainFrame) { entry.revision++; this.publish(entry); }
    });
    contents.on('did-start-loading', () => this.update(entry, 'loading', '网页正在加载'));
    contents.on('did-finish-load', () => {
      if (contents.getURL() === 'about:blank') this.update(entry, 'blank', '网页为空白页，可保留标签或重新输入地址');
      else if (entry.state.status !== 'failed') this.update(entry, 'ready', '网页已加载；平台验证或登录请在页面内完成');
    });
    contents.on('did-navigate', (_event, url) => {
      if (url === 'about:blank') this.update(entry, 'blank', '网页已跳转到空白页；不代表登录成功');
      else this.publish(entry);
    });
    contents.on('did-navigate-in-page', () => {
      if (!contents.isLoadingMainFrame() && entry.state.status !== 'failed')
        this.update(entry, 'ready', '页面已更新；登录状态与岗位可读性需单独检查');
      else this.publish(entry);
    });
    contents.on('did-stop-loading', () => {
      if (entry.state.status === 'loading') this.update(entry, contents.getURL() === 'about:blank' ? 'blank' : 'ready',
        contents.getURL() === 'about:blank' ? '网页为空白页' : '网页已加载；登录状态与岗位可读性需单独检查');
    });
    contents.on('page-title-updated', (_event, value) => { entry.state.title = value.slice(0, 120) || title; this.publish(entry); });
    contents.on('did-fail-load', (_event, code, _description, _url, mainFrame) => {
      if (mainFrame && code !== -3) this.update(entry, 'failed', '网页加载失败，请检查地址和网络后重试');
    });
    contents.on('render-process-gone', () => this.update(entry, 'failed', '网页进程已退出，请刷新标签'));
    contents.on('will-navigate', (event, url) => {
      if (url === 'about:blank') return;
      try { this.validateUrl(url); } catch { event.preventDefault(); this.update(entry, 'failed', '已阻止不支持的网页跳转'); }
    });
    contents.on('will-redirect', (event, url) => {
      try { this.validateUrl(url); } catch { event.preventDefault(); this.update(entry, 'failed', '已阻止不支持的网页重定向'); }
    });
    contents.setWindowOpenHandler(({url}) => {
      try { if (url !== 'about:blank') this.validateUrl(url); } catch { return {action: 'deny'}; }
      if (this.entries.size >= 30) return {action: 'deny'};
      return {action: 'allow', outlivesOpener: true, createWindow: options => {
        const childPartition = this.adapterFor(url) ? 'persist:jd-browser-' + this.adapterFor(url)!.sessionKey : partition;
        const child = this.create('popup-' + ++this.popupSequence, childPartition, '新标签页', options);
        child.requestedUrl = url;
        this.focus(child.state.key);
        return child.view.webContents;
      }};
    });
    contents.on('destroyed', () => { if (this.entries.has(key)) this.remove(key); });
    session.fromPartition(partition).setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    return entry;
  }
  private require(key: string): Entry {
    if (key === WORKBENCH_KEY) throw new Error('网页操作不能关闭或替换固定的 JD Collector 标签');
    const entry = this.entries.get(key);
    if (!entry || entry.view.webContents.isDestroyed()) throw new Error('请先打开对应网页标签');
    return entry;
  }
  open(key: string, value: string, title?: string, sessionKey?: string): BrowserState {
    if (key === WORKBENCH_KEY) throw new Error('网页操作不能替换固定的 JD Collector 标签');
    const url = this.validateUrl(value);
    const current = this.entries.get(key);
    if (current) {
      if (current.requestedUrl !== url.href || ['blank', 'failed'].includes(current.state.status)) this.navigate(key, value);
      return this.focus(key);
    }
    const entry = this.create(key, 'persist:jd-browser-' + (this.adapterFor(url.href)?.sessionKey || sessionKey || key), title || url.hostname);
    this.navigate(entry.state.key, url.href);
    return this.focus(key);
  }
  focus(key: string): BrowserState {
    const entry = key === WORKBENCH_KEY ? undefined : this.require(key);
    this.visualEpoch++;
    this.activeKey = key;
    this.show();
    this.emit(this.workbenchState());
    for (const item of this.entries.values()) this.publish(item);
    (entry?.view || this.shell.workbench).webContents.focus();
    return entry ? {...entry.state} : this.workbenchState();
  }
  navigate(key: string, value: string): BrowserState {
    const url = this.validateUrl(value);
    const entry = this.require(key);
    const target = this.adapterFor(url.href);
    if (target && entry.partition !== 'persist:jd-browser-' + target.sessionKey) throw new Error('网页跨平台访问请新建标签，以复用对应登录状态');
    entry.requestedUrl = url.href;
    this.update(entry, 'loading', '网页正在加载');
    // did-fail-load owns failures. An aborted load can reject after a successful redirect.
    void entry.view.webContents.loadURL(url.href).catch(() => {});
    return {...entry.state};
  }
  navigation(key: string, action: 'back' | 'forward' | 'reload'): BrowserState {
    const entry = this.require(key);
    const contents = entry.view.webContents;
    if (action === 'reload') contents.reload();
    if (action === 'back' && contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack();
    if (action === 'forward' && contents.navigationHistory.canGoForward()) contents.navigationHistory.goForward();
    this.publish(entry);
    return {...entry.state};
  }
  list(): BrowserState[] { return [this.workbenchState(), ...[...this.entries.values()].map(entry => ({...entry.state}))]; }
  private remove(key: string): BrowserState {
    const entry = this.entries.get(key);
    if (!entry) return {key, title: key, url: '', status: 'closed', message: '标签已关闭'};
    this.entries.delete(key);
    if (this.host && !this.host.isDestroyed()) this.host.contentView.removeChildView(entry.view);
    const result: BrowserState = {...entry.state, status: 'closed', active: false, message: '标签已关闭，持久化浏览数据保留'};
    this.emit(result);
    if (this.activeKey === key) this.activeKey = [...this.entries.keys()].at(-1) || WORKBENCH_KEY;
    if (!this.disposing) { this.layout(); this.emit(this.workbenchState()); for (const item of this.entries.values()) this.publish(item); }
    return result;
  }
  close(key: string): BrowserState {
    if (key === WORKBENCH_KEY) throw new Error('网页操作不能关闭固定的 JD Collector 标签');
    const entry = this.entries.get(key);
    const result = this.remove(key);
    if (entry && !entry.view.webContents.isDestroyed()) entry.view.webContents.close();
    return result;
  }
  async summary(key: string): Promise<{cookieCount: number; persistent: boolean}> {
    const contents = this.require(key).view.webContents;
    return {cookieCount: (await contents.session.cookies.get({})).length, persistent: contents.session.isPersistent()};
  }
  private adapterFor(value: string): PlatformAdapter | undefined {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:') return undefined;
      return this.adapters.find(adapter => adapter.domains.some(domain => url.hostname === domain || url.hostname.endsWith('.' + domain)));
    } catch { return undefined; }
  }
  platforms(): PlatformDefinition[] { return this.adapters.map(definition => ({...definition})); }
  visualTarget(request: CaptureRequest): VisualTarget {
    const entry = this.entries.get(request.key);
    if (!entry || entry.view.webContents.isDestroyed()) throw new PlatformOperationError('TAB_NOT_FOUND', '目标平台标签不存在');
    const contents = entry.view.webContents;
    const adapter = this.adapterFor(contents.getURL());
    if (!adapter || adapter.platform !== request.platform || entry.partition !== 'persist:jd-browser-' + adapter.sessionKey)
      throw new PlatformOperationError('PLATFORM_MISMATCH', '目标页面和平台不匹配');
    const host = this.ensureHost();
    if (!host.isVisible() || host.isMinimized() || request.key !== this.activeKey)
      throw new PlatformOperationError('TARGET_NOT_VISIBLE', '请先打开或返回目标平台标签');
    if (!host.isFocused()) throw new PlatformOperationError('TARGET_NOT_FOCUSED', '客户端未聚焦，请重新返回平台');
    if (contents.isLoadingMainFrame()) throw new PlatformOperationError('READ_BUSY', '页面正在加载，请稍后截图');
    const url = new URL(contents.getURL());
    for (const key of [...url.searchParams.keys()]) if (!adapter.sourceQueryKeys?.includes(key)) url.searchParams.delete(key);
    url.hash = ''; url.username = ''; url.password = '';
    const title = contents.getTitle().split('?')[0].replace(/(?:token|securityId|authorization|cookie)\s*[:=]\s*\S+/gi, '[已隐藏]').slice(0, 200);
    return {view: entry.view, host, revision: entry.revision, epoch: this.visualEpoch, sourceUrl: url.href, title};
  }
  openPlatform(platform: PlatformCode): BrowserState {
    const adapter = this.adapters.find(item => item.platform === platform);
    if (!adapter) throw new PlatformOperationError('PLATFORM_DISABLED', '该招聘平台不可用');
    const existing = this.list().filter(item => item.platform === platform);
    if (existing.length) return this.focus((existing.find(item => item.active) || existing[0]).key);
    return this.open('platform-' + platform + '-' + Date.now(), adapter.homeUrl, adapter.name, adapter.sessionKey);
  }
  closeAll() {
    this.disposing = true;
    for (const key of [...this.entries.keys()]) this.close(key);
  }
}
