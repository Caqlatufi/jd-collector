// Test-only Electron host. Never bundled into the shipped desktop or attached to a user instance.
const electron = require('electron');
const {app, BrowserWindow, webContents, session, net} = electron;
const fs = require('node:fs');
const path = require('node:path');
if (!process.send || !process.env.JD_DESKTOP_USER_DATA) throw new Error('Isolated test process required');
app.setPath('userData', process.env.JD_DESKTOP_USER_DATA);
const send = message => { if (process.connected) process.send(message); };
const pending = new Map();
let sequence = 0;
const initScripts = new Map();
const guarded = new Set();
function guardSession(target) {
  if (guarded.has(target)) return;
  guarded.add(target);
  target.on('will-download', (_event, item, contents) => {
    const directory = path.resolve('test-results/downloads'); fs.mkdirSync(directory, {recursive: true});
    item.setSavePath(path.join(directory, path.basename(item.getFilename())));
    send({event: 'download', pageId: contents.id, filename: item.getFilename()});
  });
  target.protocol.handle('http', async request => {
    const id = ++sequence;
    const response = new Promise(resolve => pending.set(id, resolve));
    send({route: id, url: request.url, method: request.method, body: await request.text(), headers: Object.fromEntries(request.headers)});
    const decision = await response;
    if (decision.kind === 'abort') return Response.error();
    if (decision.kind === 'fulfill') return new Response(decision.body, {status: decision.status, headers: decision.headers});
    return net.fetch(request.url, {method: request.method, headers: request.headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : decision.body,
      bypassCustomProtocolHandlers: true});
  });
}
app.on('web-contents-created', (_event, contents) => {
  send({page: {id: contents.id, url: contents.getURL()}});
  const update = () => send({page: {id: contents.id, url: contents.getURL()}});
  contents.on('did-navigate', update);
  contents.on('did-navigate-in-page', update);
  contents.on('dom-ready', async () => {
    update();
    for (const source of initScripts.get(contents.id) || []) await contents.executeJavaScript('(' + source + ')()');
    send({event: 'domcontentloaded', pageId: contents.id});
  });
  contents.on('destroyed', () => send({destroyed: contents.id}));
  contents.on('console-message', (_event, details) => {
    if (details.level === 'error') send({event: 'pageerror', pageId: contents.id, message: details.message});
  });
});
process.on('message', async message => {
  if (message.routeReply) { pending.get(message.routeReply)?.(message); pending.delete(message.routeReply); return; }
  if (!message.id) return;
  try {
    let result;
    const contents = message.pageId ? webContents.fromId(message.pageId) : undefined;
    switch (message.op) {
      case 'evaluate': result = await Function('electron', 'arg', 'return (' + message.source + ')(electron,arg)')(electron, message.arg); break;
      case 'page': result = await contents.executeJavaScript('(' + message.source + ')(' + JSON.stringify(message.arg ?? null) + ')', true); break;
      case 'goto': await contents.loadURL(message.url); break;
      case 'reload': contents.reload(); break;
      case 'route': guardSession(contents.session); break;
      case 'init': initScripts.set(contents.id, [...(initScripts.get(contents.id) || []), message.source]); break;
      case 'input': {
        const window = BrowserWindow.getAllWindows()[0];
        if (!process.env.JD_TEST_OFFSCREEN) { window.show(); window.focus(); }
        contents.focus();
        if (message.text !== undefined) {
          contents.sendInputEvent({type: 'keyDown', keyCode: 'A', modifiers: ['control']});
          contents.sendInputEvent({type: 'keyUp', keyCode: 'A', modifiers: ['control']});
          await contents.insertText(message.text);
        } else if (message.keyCode) {
          contents.sendInputEvent({type: 'keyDown', keyCode: message.keyCode});
          if (message.keyCode === 'Enter') contents.sendInputEvent({type: 'char', keyCode: '\r'});
          contents.sendInputEvent({type: 'keyUp', keyCode: message.keyCode});
        } else {
          contents.sendInputEvent({type: 'mouseDown', x: message.x, y: message.y, button: 'left', clickCount: 1});
          contents.sendInputEvent({type: 'mouseUp', x: message.x, y: message.y, button: 'left', clickCount: 1});
        }
        break;
      }
      case 'screenshot': {
        const file = path.resolve(message.path); fs.mkdirSync(path.dirname(file), {recursive: true});
        const window = BrowserWindow.fromWebContents(contents);
        const original = window?.getContentSize();
        try {
          if (message.fullPage) {
            if (!window) throw Error('Full-page capture requires the standalone test window');
            const size = await contents.executeJavaScript('({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight})');
            if (size.width > 8192 || size.height > 16384) throw Error('Full-page capture exceeds test image limit');
            window.setContentSize(Math.max(original[0], size.width), Math.max(original[1], size.height));
            await contents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
          }
          fs.writeFileSync(file, (await contents.capturePage()).toPNG());
        } finally { if (message.fullPage && original) window.setContentSize(...original); }
        break;
      }
      case 'close': send({id: message.id, result: true}); app.quit(); return;
      default: throw new Error('Unknown native test operation');
    }
    send({id: message.id, result});
  } catch (error) { send({id: message.id, error: error.stack || error.message}); }
});
process.on('disconnect', () => app.quit());
// This process has a unique userData. Only its own windows are closed during cleanup.
if (process.env.JD_TEST_DESKTOP_ENTRY) {
  app.whenReady().then(() => guardSession(session.defaultSession));
  require(path.join(process.env.JD_TEST_DESKTOP_ENTRY, 'main.cjs'));
}
else app.whenReady().then(() => {
  guardSession(session.defaultSession);
  const window = new BrowserWindow({width: 1000, height: 1440, show: !process.env.JD_TEST_OFFSCREEN,
    // Local fixture assertions must keep rendering when another app covers the test window.
    webPreferences: {sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false,
      offscreen: Boolean(process.env.JD_TEST_OFFSCREEN)}});
  window.loadURL('about:blank');
});
