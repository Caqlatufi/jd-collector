import {test, expect, electron} from '../native/harness.mjs';
import {mkdtemp, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';

test('双客户端原生输入在后台仍只作用于各自页面（独立夹具）', async () => {
  const clients: any[] = [];
  try {
    for (const label of ['first', 'second']) {
      const directory = await mkdtemp(path.join(tmpdir(), 'jd-parallel-'));
      const env = {...process.env, JD_DESKTOP_USER_DATA: directory, JD_DESKTOP_BACKGROUND_WORKFLOW: 'true',
        JD_DESKTOP_URL: 'http://127.0.0.1:7890/jd-collector/'};
      delete env.ELECTRON_RUN_AS_NODE;
      const app = await electron.launch({args: [path.resolve('dist-electron')], env});
      clients.push({app});
      await app.evaluate(({BrowserWindow}: any) => BrowserWindow.getAllWindows()[0].show());
      await expect.poll(() => app.context().pages().some((p: any) => p.url().includes('/jd-collector/'))).toBe(true);
      const workbench = app.context().pages().find((p: any) => p.url().includes('/jd-collector/'));
      await workbench.route('**/api/**', (route: any) => route.request().method() === 'GET' ? route.continue() : route.abort());
      await app.evaluate(({session}: any, label: string) => {
        session.fromPartition('persist:jd-browser-www_zhipin_com').protocol.handle('https', () => new Response(
          '<meta charset="utf-8"><style>input{position:absolute;left:30px;top:30px;width:300px;height:40px;caret-color:transparent}</style><input><h1 style="margin-top:120px">' + label + '</h1>',
          {headers: {'Content-Type': 'text/html;charset=utf-8'}}));
      }, label);
      await workbench.evaluate(() => window.jdDesktop!.request('browser.open', {key: 'parallel', url: 'https://www.zhipin.com/job/fixture'}));
      await expect.poll(() => app.context().pages().some((p: any) => p.url().includes('/job/fixture'))).toBe(true);
      const page = app.context().pages().find((p: any) => p.url().includes('/job/fixture'));
      await expect(page.locator('h1')).toHaveText(label);
      const connection = JSON.parse(await readFile(path.join(directory, 'workflow-connection.json'), 'utf8'));
      const request = (action: string, payload: object = {}): Promise<any> => new Promise((resolve, reject) => {
        const socket = net.connect(connection.pipe); let buffer = '';
        socket.setEncoding('utf8'); socket.setTimeout(16000, () => {socket.destroy(); reject(new Error('timeout'));});
        socket.on('error', reject);
        socket.on('connect', () => socket.write(JSON.stringify({token: connection.token, platform: 'BOSS', key: 'parallel', action, ...payload}) + '\n'));
        socket.on('data', chunk => {buffer += chunk;});
        socket.on('end', () => resolve(JSON.parse(buffer)));
      });
      Object.assign(clients[clients.length - 1], {page, request, pipe: connection.pipe, workbench, env, directory});
    }
    expect(clients[0].pipe).not.toBe(clients[1].pipe);
    const first = clients[0];
    const beforeZoom = await first.request('capture');
    expect(beforeZoom, JSON.stringify(beforeZoom)).toHaveProperty('ok', true);
    const bounds = await first.app.evaluate(({BrowserWindow}: any) => BrowserWindow.getAllWindows()[0].getBounds());
    await first.workbench.evaluate(() => window.jdDesktop!.request('browser.zoom', {key: 'parallel', action: 'out'}));
    const factor = (client: any) => client.workbench.evaluate(async () => {
      const result = await window.jdDesktop!.request('browser.list', {});
      return result.ok ? result.data.find(row => row.key === 'parallel')?.zoomFactor : null;
    });
    await expect.poll(() => factor(first)).toBe(0.9);
    expect(await factor(clients[1])).toBe(1);
    expect(await first.app.evaluate(({BrowserWindow}: any) => BrowserWindow.getAllWindows()[0].getBounds())).toEqual(bounds);
    expect((await first.request('click', {captureId: beforeZoom.data.captureId, x: 70, y: 50, intent: 'searchControl'})).ok).toBe(false);
    await first.workbench.evaluate(() => window.jdDesktop!.request('browser.open', {key: 'same-site', url: 'https://www.zhipin.com/job/second'}));
    const states = await first.workbench.evaluate(() => window.jdDesktop!.request('browser.list', {}));
    expect(states.data.find((row: any) => row.key === 'same-site').zoomFactor).toBe(1);
    expect(states.data.find((row: any) => row.key === 'parallel').zoomFactor).toBe(0.9);
    await first.workbench.evaluate(() => window.jdDesktop!.request('browser.focus', {key: 'parallel'}));
    await first.app.evaluate(({webContents}: any) => {
      const contents = webContents.getAllWebContents().find((item: any) => item.getURL().includes('/job/fixture'));
      contents.sendInputEvent({type: 'keyDown', keyCode: '0', modifiers: ['control']});
      contents.sendInputEvent({type: 'keyUp', keyCode: '0', modifiers: ['control']});
    });
    await expect.poll(() => factor(first)).toBe(1);
    const zoomCapture = await first.request('capture');
    expect((await first.request('key', {captureId: zoomCapture.data.captureId, keyCode: 'ZoomOut'})).ok).toBe(true);
    await expect.poll(() => factor(first)).toBe(0.9);
    const afterZoom = await first.request('capture');
    expect((await first.request('type', {captureId: afterZoom.data.captureId, text: 'must not type'})).error.code).toBe('SEARCH_TARGET_REQUIRED');
    expect((await first.request('key', {captureId: afterZoom.data.captureId, keyCode: 'ZoomReset'})).ok).toBe(true);
    await expect.poll(() => factor(first)).toBe(1);
    await clients[1].app.evaluate(({BrowserWindow}: any) => BrowserWindow.getAllWindows()[0].focus());
    for (let index = 0; index < 2; index++) {
      const client = clients[index];
      const ref = await client.request('capture');
      expect(ref.ok).toBe(true);
      expect((await client.request('click', {captureId: ref.data.captureId, x: 70, y: 50, intent: 'searchControl'})).ok).toBe(true);
      const input = await client.request('capture', {rect: {x: 20, y: 20, width: 330, height: 70}});
      const typed = await client.request('type', {captureId: input.data.captureId, text: 'client-' + index});
      expect(typed, JSON.stringify(typed)).toHaveProperty('ok', true);
      await expect(client.page.locator('input')).toHaveValue('client-' + index);
      await expect(clients[1 - index].page.locator('input')).toHaveValue(index === 0 ? '' : 'client-0');
    }
    const lastBounds = await first.app.evaluate(({BrowserWindow}: any) => BrowserWindow.getAllWindows()[0].getBounds());
    await first.app.close();
    const placement = JSON.parse(await readFile(path.join(first.directory, 'window-placement.json'), 'utf8'));
    expect(placement.bounds).toEqual(lastBounds);
    first.app = await electron.launch({args: [path.resolve('dist-electron')], env: first.env});
    expect(await first.app.evaluate(({BrowserWindow}: any) => BrowserWindow.getAllWindows()[0].getBounds())).toEqual(lastBounds);
  } finally { for (const client of clients) await client.app.close(); }
});
