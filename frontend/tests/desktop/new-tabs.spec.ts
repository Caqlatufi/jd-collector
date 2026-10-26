import {test, expect, electron} from '../native/harness.mjs';
import path from 'node:path';

test('中键和 Ctrl 点击在后台新建标签，普通弹窗保留页面和会话（独立夹具）', async () => {
  const env = {...process.env, JD_DESKTOP_ALLOW_LOCAL_HTTP: '1',
    JD_DESKTOP_URL: 'http://127.0.0.1:7890/jd-collector/'};
  delete env.ELECTRON_RUN_AS_NODE;
  // The harness supplies a fresh profile; never reuse the personal client.
  delete env.JD_DESKTOP_USER_DATA;
  const app = await electron.launch({args: [path.resolve('dist-electron')], env});
  const sourceUrl = 'https://www.zhipin.com/fixture/source';
  try {
    await app.evaluate(({session}) => {
      // Record main-process failures without leaving an error dialog blocking the test.
      (globalThis as any).tabErrors = [];
      process.removeAllListeners('uncaughtException');
      process.on('uncaughtException', error => (globalThis as any).tabErrors.push(error.message));
      session.fromPartition('persist:jd-browser-www_zhipin_com').protocol.handle('https', request => {
        const pathname = new URL(request.url).pathname;
        return new Response('<meta charset="utf-8"><title>' + pathname + '</title>' +
          '<input id="draft"><a id="same" href="/fixture/middle">普通链接</a>' +
          '<a id="blank" href="/fixture/blank" target="_blank">新窗口链接</a>' +
          '<script>window.instance=crypto.randomUUID()</script>',
        {headers: {'Content-Type': 'text/html;charset=utf-8'}});
      });
    });
    const toolbar = await app.firstWindow();
    expect((await toolbar.evaluate(url => window.jdDesktop!.request('browser.open', {key: 'source', url}), sourceUrl)).ok).toBe(true);
    await expect.poll(() => app.context().pages().some(page => page.url() === sourceUrl)).toBe(true);
    const source = app.context().pages().find(page => page.url() === sourceUrl)!;
    await expect(source.locator('#same')).toBeVisible();
    const instance = await source.evaluate(() => {
      (document.querySelector('#draft') as HTMLInputElement).value = '保留原页面';
      return (window as any).instance;
    });
    const click = async (selector: string, button: 'left' | 'middle', modifiers: string[] = []) => {
      await toolbar.evaluate(() => window.jdDesktop!.request('browser.focus', {key: 'source'}));
      await app.evaluate(({BrowserWindow}) => {
        const host = BrowserWindow.getAllWindows()[0];
        if (host.isMinimized()) host.restore();
        host.show(); host.focus();
      });
      await expect.poll(() => app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].isFocused())).toBe(true);
      await source.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const box = await source.locator(selector).boundingBox();
      await app.evaluate(({webContents}, input) => {
        const contents = webContents.getAllWebContents().find(item => item.getURL() === input.url)!;
        contents.focus();
        const point = {x: Math.round(input.box.x + input.box.width / 2),
          y: Math.round(input.box.y + input.box.height / 2), button: input.button,
          modifiers: input.modifiers, clickCount: 1};
        contents.sendInputEvent({type: 'mouseDown', ...point});
        contents.sendInputEvent({type: 'mouseUp', ...point});
      }, {url: sourceUrl, box, button, modifiers});
    };
    const verifyChild = async (pathname: string, background: boolean) => {
      await expect(toolbar.getByRole('tab', {name: pathname, exact: true})).toBeVisible();
      await expect(toolbar.getByRole('tab')).toHaveCount(3);
      const states = await toolbar.evaluate(() => window.jdDesktop!.request('browser.list', {}));
      expect(states.ok).toBe(true);
      if (!states.ok) throw new Error('Cannot list tabs');
      const child = states.data.find(row => row.url === 'https://www.zhipin.com' + pathname)!;
      expect(child.active).toBe(!background);
      expect(states.data.find(row => row.key === 'source')!.active).toBe(background);
      expect(await app.evaluate(({BrowserWindow, webContents}, urls) => {
        const contents = webContents.getAllWebContents();
        const parent = contents.find(item => item.getURL() === urls.source)!;
        const child = contents.find(item => item.getURL() === urls.child)!;
        return {windows: BrowserWindow.getAllWindows().length, shared: parent.session === child.session};
      }, {source: sourceUrl, child: 'https://www.zhipin.com' + pathname})).toEqual({windows: 1, shared: true});
      const page = app.context().pages().find(page => page.url() === 'https://www.zhipin.com' + pathname)!;
      expect(await page.evaluate(() => ({node: typeof (window as any).require, bridge: typeof window.jdDesktop})))
        .toEqual({node: 'undefined', bridge: 'undefined'});
      if (pathname === '/fixture/script') {
        expect(await source.evaluate(() => Boolean((window as any).child && !(window as any).child.closed))).toBe(true);
        expect(await page.evaluate(() => window.opener !== null)).toBe(true);
      }
      expect(await source.evaluate(() => ({draft: (document.querySelector('#draft') as HTMLInputElement).value,
        instance: (window as any).instance}))).toEqual({draft: '保留原页面', instance});
      expect(await app.evaluate(() => (globalThis as any).tabErrors)).toEqual([]);
      expect((await toolbar.evaluate(key => window.jdDesktop!.request('browser.close', {key}), child.key)).ok).toBe(true);
      await expect(toolbar.getByRole('tab')).toHaveCount(2);
    };
    await click('#same', 'middle');
    await verifyChild('/fixture/middle', true);
    await click('#blank', 'middle');
    await verifyChild('/fixture/blank', true);
    await click('#same', 'left', ['control']);
    await verifyChild('/fixture/middle', true);
    await click('#same', 'middle', ['shift']);
    await verifyChild('/fixture/middle', false);
    await click('#blank', 'left');
    await verifyChild('/fixture/blank', false);
    // window.open supplies an existing WebContents; it must be adopted intact.
    await toolbar.evaluate(() => window.jdDesktop!.request('browser.focus', {key: 'source'}));
    await source.evaluate(() => { (window as any).child = window.open('/fixture/script'); });
    await verifyChild('/fixture/script', false);
  } finally {
    await app.close();
  }
});
