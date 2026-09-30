import {test, expect, electron, type ElectronApplication} from '../native/harness.mjs';
import {createServer} from 'node:http';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

test('真实桌面入口、事件桥、网页隔离、持久化、延迟空白和离线恢复', async () => {
  const userData = await mkdtemp(path.join(tmpdir(), 'jd-desktop-test-'));
  const fixture = createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html;charset=utf-8');
    if (request.url === '/blank') response.end('<html><body>即将跳转<script>setTimeout(()=>location.href="about:blank",1500)</script></body></html>');
    else {
      response.setHeader('Set-Cookie', 'desktop_fixture=one; Max-Age=3600; Path=/; SameSite=Lax');
      response.end('<html><head><title>测试 ' + request.url + '</title></head><body><h1>桌面窗口测试</h1><input id="draft"><a id="popup" href="/child" target="_blank">新职位</a><script>localStorage.setItem("desktop_fixture","saved");window.instance=crypto.randomUUID()</script></body></html>');
    }
  });
  await new Promise<void>(resolve => fixture.listen(0, '127.0.0.1', resolve));
  const address = fixture.address();
  if (!address || typeof address === 'string') throw new Error('Fixture did not start');
  const origin = `http://127.0.0.1:${address.port}`;
  const env: Record<string, string> = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  delete env.ELECTRON_RUN_AS_NODE;
  env.JD_DESKTOP_USER_DATA = userData;
  env.JD_DESKTOP_ALLOW_LOCAL_HTTP = '1';
  delete env.JD_DESKTOP_DEV;
  delete env.JD_DESKTOP_URL;
  let app: ElectronApplication | undefined;
  const launch = () => electron.launch({args: [path.resolve('dist-electron')], env});
  const workbenchPage = async () => {
    await expect.poll(() => app!.context().pages().some(p => p.url().startsWith('http://127.0.0.1:7890/jd-collector/'))).toBe(true);
    return app!.context().pages().find(p => p.url().startsWith('http://127.0.0.1:7890/jd-collector/'))!;
  };
  try {
    app = await launch();
    let popup = await app.firstWindow();
    let page = await workbenchPage();
    await expect(popup.getByRole('tab', {name: 'JD Collector', exact: true})).toHaveAttribute('aria-selected', 'true');
    await expect(popup.getByRole('button', {name: '关闭 JD Collector', exact: true})).toHaveCount(0);
    await expect(popup.locator('header')).toHaveCSS('height', '98px');
    await expect(popup.locator('.status, .hint')).toHaveCount(0);
    await expect(popup.locator('#status')).toBeHidden();
    expect(await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].contentView.children[0].getBounds().y)).toBe(98);
    expect(await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows().length)).toBe(1);
    for (const command of ['browser.close', 'browser.navigate', 'browser.open'] as const) {
      expect((await popup.evaluate(({command, origin}) => window.jdDesktop!.request(command, {key: 'jd-workbench', url: origin}), {command, origin})).ok).toBe(false);
    }
    let workbenchInstance = await page.evaluate(() => { (window as any).fixedMarker = crypto.randomUUID(); return (window as any).fixedMarker; });
    await expect(page.getByRole('menuitem', {name: '今日看板'})).toBeVisible();
    await expect(page.getByRole('button', {name: '桌面工具', exact: true})).toHaveCount(0);
    await expect(page.locator('.el-drawer')).toHaveCount(0);
    expect(await page.evaluate(() => ({require: typeof (window as any).require, bridge: Boolean(window.jdDesktop), rawIpc: Boolean((window.jdDesktop as any).ipcRenderer)})))
      .toEqual({require: 'undefined', bridge: true, rawIpc: false});
    const info = await page.evaluate(() => window.jdDesktop!.request('runtime.info', {}));
    expect(info.ok).toBe(true);

    // Promise responses and detachable push events both work across real IPC.
    await page.evaluate(() => {
      (window as any).desktopEvents = [];
      (window as any).detachDesktopEvents = window.jdDesktop!.onEvent(event => (window as any).desktopEvents.push(event.type));
    });
    await page.evaluate(() => window.jdDesktop!.request('window.toggleMaximize', {}));
    await expect.poll(() => page.evaluate(() => (window as any).desktopEvents.includes('window.changed'))).toBe(true);
    const count = await page.evaluate(() => { (window as any).detachDesktopEvents(); return (window as any).desktopEvents.length; });
    await page.evaluate(() => window.jdDesktop!.request('window.toggleMaximize', {}));
    expect(await page.evaluate(() => (window as any).desktopEvents.length)).toBe(count);
    expect((await page.evaluate(() => window.jdDesktop!.request('browser.open', {key: 'bad', url: 'file:///C:/Windows/'}))).ok).toBe(false);
    expect((await page.evaluate(() => window.jdDesktop!.request('not.registered' as any, {}))).ok).toBe(false);

    await popup.locator('#new-tab').click();
    await popup.getByRole('textbox', {name: '网页地址'}).fill(origin);
    await popup.getByRole('button', {name: '访问', exact: true}).click();
    await expect(popup.getByRole('tab', {name: '测试 /', exact: true})).toBeVisible();
    const firstKey = (await popup.getByRole('tab', {name: '测试 /', exact: true}).locator('..').getAttribute('data-key'))!;
    await expect(popup.locator('#address')).toHaveAttribute('title', /网页已加载/);
    await expect(popup.locator('#status')).toBeHidden();
    expect(await app.evaluate(({webContents}, origin) => webContents.getAllWebContents().find(w => w.getURL() === origin + '/')!
      .executeJavaScript('({require:typeof window.require,bridge:typeof window.jdDesktop})'), origin))
      .toEqual({require: 'undefined', bridge: 'undefined'});
    // Set unsaved state, open a second same-site page, and switch through the real toolbar.
    const instance = await app.evaluate(({webContents}, origin) => webContents.getAllWebContents().find(w => w.getURL() === origin + '/')!
      .executeJavaScript('document.querySelector("#draft").value="unsaved draft";window.instance'), origin);
    await popup.locator('#new-tab').click();
    await popup.getByRole('textbox', {name: '网页地址'}).fill(origin + '/second');
    await popup.getByRole('button', {name: '访问', exact: true}).click();
    await expect(popup.getByRole('tab')).toHaveCount(3);
    await expect(popup.getByRole('tab', {name: '测试 /second'})).toBeVisible();
    await popup.getByRole('textbox', {name: '网页地址'}).fill(origin + '/third');
    await popup.getByRole('button', {name: '访问', exact: true}).click();
    await expect(popup.getByRole('tab', {name: '测试 /third'})).toBeVisible();
    await popup.getByTitle('后退', {exact: true}).click();
    await expect(popup.getByRole('tab', {name: '测试 /second'})).toBeVisible();
    await popup.getByTitle('前进', {exact: true}).click();
    await expect(popup.getByRole('tab', {name: '测试 /third'})).toBeVisible();
    const beforeReload = await app.evaluate(({webContents}, origin) => webContents.getAllWebContents().find(w => w.getURL() === origin + '/third')!
      .executeJavaScript('window.instance'), origin);
    await popup.getByTitle('刷新', {exact: true}).click();
    await expect.poll(() => app!.evaluate(({webContents}, origin) => webContents.getAllWebContents().find(w => w.getURL() === origin + '/third')!
      .executeJavaScript('window.instance'), origin)).not.toBe(beforeReload);
    await popup.getByRole('tab', {name: '测试 /', exact: true}).click();
    expect(await app.evaluate(({webContents}, origin) => webContents.getAllWebContents().find(w => w.getURL() === origin + '/')!
      .executeJavaScript('({draft:document.querySelector("#draft").value,instance:window.instance})'), origin))
      .toEqual({draft: 'unsaved draft', instance});
    expect(await app.evaluate(({webContents}, origin) => {
      const list = webContents.getAllWebContents();
      return list.find(w => w.getURL() === origin + '/')!.session === list.find(w => w.getURL() === origin + '/third')!.session;
    }, origin)).toBe(true);
    await app.evaluate(({webContents}, origin) => webContents.getAllWebContents().find(w => w.getURL() === origin + '/')!
      .executeJavaScript('document.querySelector("#popup").click()'), origin);
    await expect(popup.getByRole('tab', {name: '测试 /child'})).toBeVisible();
    await expect(popup.getByRole('tab')).toHaveCount(4);
    await popup.getByRole('button', {name: '关闭 测试 /child', exact: true}).click();
    await expect(popup.getByRole('tab')).toHaveCount(3);
    // Workbench and external pages live in one host; returning never remounts Vue.
    await popup.getByRole('tab', {name: 'JD Collector', exact: true}).click();
    expect(await page.evaluate(() => (window as any).fixedMarker)).toBe(workbenchInstance);
    expect(await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows().length)).toBe(1);
    await expect(popup.getByRole('tab')).toHaveCount(3);
    expect(await app.evaluate(({webContents}, origin) => webContents.getAllWebContents().find(w => w.getURL() === origin + '/')!
      .executeJavaScript('window.instance'), origin)).toBe(instance);
    expect((await popup.evaluate(() => window.jdDesktop!.request('app.retry', {}))).ok).toBe(false);
    await popup.screenshot({path: 'desktop-test-results/browser-tabs.png'});
    // Workbench refresh replaces only its document; external tabs keep unsaved state.
    await page.getByRole('menuitem', {name: 'JD 列表', exact: true}).click();
    await expect(page).toHaveURL(/\/postings$/);
    const workbenchUrl = page.url();
    await page.getByRole('button', {name: '刷新工作台', exact: true}).click();
    await page.getByRole('button', {name: '取消', exact: true}).click();
    expect(await page.evaluate(() => (window as any).fixedMarker)).toBe(workbenchInstance);
    await page.getByRole('button', {name: '刷新工作台', exact: true}).click();
    await Promise.all([
      page.waitForEvent('domcontentloaded'),
      page.getByRole('button', {name: '确认刷新', exact: true}).click(),
    ]);
    await expect(page.getByRole('heading', {name: 'JD 列表', exact: true})).toBeVisible();
    expect(page.url()).toBe(workbenchUrl);
    expect(await page.evaluate(() => (window as any).fixedMarker)).toBeUndefined();
    workbenchInstance = await page.evaluate(() => { (window as any).fixedMarker = crypto.randomUUID(); return (window as any).fixedMarker; });
    await expect(popup.getByRole('tab')).toHaveCount(3);
    expect(await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows().length)).toBe(1);
    expect(await app.evaluate(({webContents}, origin) => webContents.getAllWebContents().find(w => w.getURL() === origin + '/')!
      .executeJavaScript('({draft:document.querySelector("#draft").value,instance:window.instance})'), origin))
      .toEqual({draft: 'unsaved draft', instance});
    const summary = await page.evaluate(key => window.jdDesktop!.request('browser.session', {key}), firstKey);
    expect(summary.ok && summary.data.cookieCount).toBe(1);
    await app.evaluate(async ({session}) => { await session.fromPartition('persist:jd-browser-127_0_0_1').cookies.flushStore(); });
    await popup.getByRole('button', {name: '关闭 测试 /', exact: true}).click();
    await expect(popup.getByRole('tab', {name: '测试 /', exact: true})).toHaveCount(0);
    const remaining = await page.evaluate(() => window.jdDesktop!.request('browser.list', {}));
    expect(remaining.ok && remaining.data.length).toBe(2);
    expect(remaining.ok && remaining.data.some(row => row.key === firstKey)).toBe(false);
    if (remaining.ok) for (const row of remaining.data.filter(row => !row.pinned)) {
      await popup.evaluate(key => window.jdDesktop!.request('browser.close', {key}), row.key);
    }
    await expect(popup.getByRole('tab')).toHaveCount(1);
    await expect(popup.getByRole('tab', {name: 'JD Collector', exact: true})).toHaveAttribute('aria-selected', 'true');
    expect(await page.evaluate(() => (window as any).fixedMarker)).toBe(workbenchInstance);
    await app.close(); app = undefined;

    app = await launch();
    popup = await app.firstWindow();
    page = await workbenchPage();
    await expect(page.getByRole('menuitem', {name: '今日看板'})).toBeVisible();
    await expect(page.getByRole('button', {name: '桌面工具', exact: true})).toHaveCount(0);
    const persisted = await app.evaluate(async ({session}) => {
      const same = await session.fromPartition('persist:jd-browser-127_0_0_1').cookies.get({name: 'desktop_fixture'});
      const other = await session.fromPartition('persist:jd-browser-separate').cookies.get({name: 'desktop_fixture'});
      return {same: same.length, other: other.length};
    });
    expect(persisted).toEqual({same: 1, other: 0});
    await popup.locator('#new-tab').click();
    await popup.getByRole('textbox', {name: '网页地址'}).fill(origin + '/blank');
    await popup.getByRole('button', {name: '访问', exact: true}).click();
    await expect(popup.locator('#status')).toHaveAttribute('title', /空白页/, {timeout: 10000});
    await expect(popup.locator('#status')).toBeVisible();
    await expect(popup.locator('header')).toHaveCSS('height', '98px');
    await popup.locator('#tabs .close').click();
    await expect(popup.getByRole('tab', {name: 'JD Collector', exact: true})).toHaveAttribute('aria-selected', 'true');

    // Fail requests only inside this isolated desktop process; the real backend stays online.
    await app.evaluate(({session}) => session.defaultSession.webRequest.onBeforeRequest({urls: ['http://127.0.0.1:7890/jd-collector/*']}, (_details, callback) => callback({cancel: true})));
    await page.evaluate(() => window.jdDesktop!.request('app.retry', {}));
    await expect(page.getByRole('heading', {name: '本地服务尚未连接'})).toBeVisible();
    await app.evaluate(({session}) => session.defaultSession.webRequest.onBeforeRequest(null));
    await page.getByRole('button', {name: '重新连接'}).click();
    await expect(page.getByRole('menuitem', {name: '今日看板'})).toBeVisible();
    await expect(page.getByRole('button', {name: '桌面工具', exact: true})).toHaveCount(0);
    await page.screenshot({path: 'desktop-test-results/workbench.png'});
  } finally {
    if (app) await app.close();
    await new Promise<void>((resolve, reject) => fixture.close(error => error ? reject(error) : resolve()));
  }
});
