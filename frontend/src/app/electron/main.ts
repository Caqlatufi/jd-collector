import {app, BrowserWindow, Menu, WebContentsView} from 'electron';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {registerDesktop} from '../../common/desktop/main/register';
import {platformAdapters} from '../../account/adapters/platforms';
import {readWindowPlacement, saveWindowPlacement} from '../../common/desktop/main/windowPlacement';

app.setName('JD Collector');
if (process.env.JD_DESKTOP_USER_DATA) app.setPath('userData', path.resolve(process.env.JD_DESKTOP_USER_DATA));
const dev = process.env.JD_DESKTOP_DEV === '1';
const windowTitle = process.env.JD_DESKTOP_TITLE || 'JD Collector';
const entry = process.env.JD_DESKTOP_URL || (dev ? 'http://127.0.0.1:3002/jd-collector/' : 'http://127.0.0.1:7890/jd-collector/');
const url = new URL(entry);
if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    !['7890', '3002'].includes(url.port) || url.pathname !== '/jd-collector/' || url.username || url.password || url.search || url.hash) {
  throw new Error('桌面工作台只允许配置本地 JD Collector 地址');
}
let mainWindow: BrowserWindow | undefined;
let workbench: WebContentsView | undefined;
let dispose: (() => void) | undefined;
const offline = path.join(__dirname, 'offline.html');
const offlineUrl = pathToFileURL(offline).href;
const loadWorkbench = () => {
  if (!workbench || workbench.webContents.isDestroyed()) return;
  void workbench.webContents.loadURL(entry).catch(() => {
    if (workbench && !workbench.webContents.isDestroyed()) void workbench.webContents.loadFile(offline);
  });
};
const createWindow = () => {
  const placement = readWindowPlacement();
  mainWindow = new BrowserWindow({
    width: 1050, height: 1400, ...placement.bounds, minWidth: 720, minHeight: 700, title: windowTitle,
    backgroundColor: '#f3f5ef',
    webPreferences: {preload: path.join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false},
  });
  if (placement.maximized) mainWindow.maximize();
  mainWindow.on('close', () => { if (mainWindow) saveWindowPlacement(mainWindow); });
  Menu.setApplicationMenu(null);
  mainWindow.webContents.on('page-title-updated', event => { event.preventDefault(); mainWindow?.setTitle(windowTitle); });
  workbench = new WebContentsView({webPreferences: {preload: path.join(__dirname, 'preload.cjs'),
    sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false}});
  mainWindow.contentView.addChildView(workbench);
  dispose = registerDesktop(mainWindow, new Set([entry, offlineUrl]), loadWorkbench, process.env.JD_DESKTOP_ALLOW_LOCAL_HTTP === '1',
    {html: path.join(__dirname, 'browser.html'), host: mainWindow, workbench}, platformAdapters);
  mainWindow.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
  mainWindow.webContents.on('will-redirect', event => event.preventDefault());
  workbench.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
  workbench.webContents.on('will-navigate', (event, destination) => {
    if (!destination.startsWith(entry) && destination !== offlineUrl) event.preventDefault();
  });
  workbench.webContents.on('will-redirect', (event, destination) => {
    if (!destination.startsWith(entry)) event.preventDefault();
  });
  mainWindow.on('closed', () => {
    dispose?.(); dispose = undefined;
    if (workbench && !workbench.webContents.isDestroyed()) workbench.webContents.close();
    workbench = undefined; mainWindow = undefined;
  });
  void mainWindow.loadFile(path.join(__dirname, 'browser.html'));
  loadWorkbench();
};
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
  app.whenReady().then(createWindow);
  app.on('activate', () => { if (!mainWindow) createWindow(); });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { dispose?.(); dispose = undefined; });
}
