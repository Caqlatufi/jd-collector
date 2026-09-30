import {test, expect, electron} from '../native/harness.mjs';
import {mkdtemp, readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';

const platforms = [
  ['BOSS', 'www.zhipin.com', 'www_zhipin_com'], ['LIEPIN', 'www.liepin.com', 'www_liepin_com'],
  ['JOB51', 'jobs.51job.com', 'www_51job_com'], ['ZHAOPIN', 'www.zhaopin.com', 'www_zhaopin_com'],
];
for (const [platform, domain, partition] of platforms) {
  test(platform + ' 原生截图、输入与来源边界（隔离夹具，不代表真实站）', async () => {
    const env = {...process.env, JD_DESKTOP_USER_DATA: await mkdtemp(path.join(tmpdir(), 'jd-visual-test-'))};
    delete env.ELECTRON_RUN_AS_NODE;
    const app = await electron.launch({args: [path.resolve('dist-electron')], env});
    try {
      await app.firstWindow();
      await expect.poll(() => app.context().pages().some(p => p.url().startsWith('http://127.0.0.1:7890/jd-collector/'))).toBe(true);
      const workbench = app.context().pages().find(p => p.url().startsWith('http://127.0.0.1:7890/jd-collector/'))!;
      await workbench.route('**/api/**', route => route.request().method() === 'GET' ? route.continue() : route.abort());
      await app.evaluate(({session}, partition) => {
        session.fromPartition('persist:jd-browser-' + partition).protocol.handle('https', () => new Response(`<!doctype html>
          <meta charset="utf-8"><style>body{margin:0;font:24px sans-serif;background:#fff}input{position:absolute;left:30px;top:30px;width:300px;height:40px;caret-color:transparent}button{position:absolute;left:360px;top:30px;height:45px}.text{margin-top:120px}#panel{height:250px;overflow:auto;width:600px;background:#eef}p{margin:0;height:160px}</style>
          <form onsubmit="event.preventDefault();document.querySelector('h1').textContent=document.querySelector('input').value"><input id="search"><button>搜索</button></form>
          <div class="text"><h1>Java 工程师</h1><div>夹具公司 20–30K·13薪 上海</div><div id="panel"><p>职责一 Java 开发</p><p>职责二 AI 应用</p><p>任职要求 三年经验</p><p>岗位正文结束</p></div></div>`, {headers: {'Content-Type': 'text/html;charset=utf-8'}}));
      }, partition);
      const ipc = (command: string, payload: object) => workbench.evaluate(({command, payload}) => window.jdDesktop!.request(command as any, payload), {command, payload}) as Promise<any>;
      const key = 'fixture-' + platform;
      expect((await ipc('browser.open', {key, url: 'https://' + domain + '/job/fixture?securityId=private&jobId=123'})).ok).toBe(true);
      await expect.poll(async () => (await ipc('browser.list', {})).data.find((t: any) => t.key === key)?.status).toBe('ready');
      const connection = JSON.parse(await readFile(path.join(env.JD_DESKTOP_USER_DATA, 'workflow-connection.json'), 'utf8'));
      const request = (action: string, data: object = {}): Promise<any> => new Promise((resolve, reject) => {
        const socket = net.connect(connection.pipe); let result = '';
        socket.setEncoding('utf8'); socket.setTimeout(16000, () => { socket.destroy(); reject(new Error('timeout')); });
        socket.on('error', reject);
        socket.on('connect', () => socket.write(JSON.stringify({token: connection.token, platform, key, action, ...data}) + '\n'));
        socket.on('data', chunk => { result += chunk; });
        socket.on('end', () => resolve(JSON.parse(result)));
      });
      await request('focus');
      const external = app.context().pages().find(p => p.url().includes(domain))!;
      // ready means navigation finished; wait for the fixture's first composited frame before native capture.
      await external.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const capture = async (data: object = {}) => { const response = await request('capture', data); expect(response, JSON.stringify(response)).toHaveProperty('ok', true); return response.data; };
      const ref = await capture();
      const png = await readFile(ref.filePath);
      expect(createHash('sha256').update(png).digest('hex')).toBe(ref.sha256);
      expect(ref.image).toEqual({width: png.readUInt32BE(16), height: png.readUInt32BE(20)});
      expect(ref.sourceUrl).toBe('https://' + domain + '/job/fixture?jobId=123');
      expect(JSON.stringify(ref)).not.toMatch(/private|securityId|token/);
      expect(ref.rect.y).toBe(0);
      expect(ref.viewport.height).toBeGreaterThan(300);
      expect((await request('capture', {rect: {x: -1, y: 0, width: 10, height: 10}})).error.code).toBe('INVALID_CAPTURE_RECT');
      expect((await request('capture', {batchId: '../escape'})).error.code).toBe('WORKFLOW_REJECTED');
      expect((await request('capture', {filePath: 'elsewhere.png'})).error.code).toBe('WORKFLOW_REJECTED');
      expect((await request('type', {captureId: ref.captureId, text: 'Java'})).error.code).toBe('SEARCH_TARGET_REQUIRED');
      expect((await request('click', {captureId: ref.captureId, x: 60, y: 50, intent: 'apply'})).error.code).toBe('WORKFLOW_REJECTED');
      const search = await capture({rect: {x: 20, y: 20, width: 410, height: 70}});
      expect((await request('click', {captureId: search.captureId, x: 80, y: 50, intent: 'searchControl'})).ok).toBe(true);
      const focused = await capture({rect: {x: 20, y: 20, width: 410, height: 70}});
      expect((await request('type', {captureId: focused.captureId, text: 'Java人工智能'})).ok).toBe(true);
      await expect(external.locator('input')).toHaveValue('Java人工智能');
      expect((await request('type', {captureId: focused.captureId, text: '重复'})).error.code).toBe('STALE_CAPTURE');
      const replace = await capture({rect: {x: 20, y: 20, width: 410, height: 70}});
      expect((await request('type', {captureId: replace.captureId, text: 'AI应用开发X', replace: true})).ok).toBe(true);
      await expect(external.locator('input')).toHaveValue('AI应用开发X');
      const edit = await capture({rect: {x: 20, y: 20, width: 410, height: 70}});
      expect((await request('key', {captureId: edit.captureId, keyCode: 'F12'})).error.code).toBe('WORKFLOW_REJECTED');
      expect((await request('key', {captureId: edit.captureId, keyCode: 'Backspace'})).ok).toBe(true);
      await expect(external.locator('input')).toHaveValue('AI应用开发');
      const enter = await capture({rect: {x: 20, y: 20, width: 410, height: 70}});
      expect((await request('key', {captureId: enter.captureId, keyCode: 'Enter'})).ok).toBe(true);
      await expect(external.locator('h1')).toHaveText('AI应用开发');
      const ended = await capture({rect: {x: 20, y: 20, width: 410, height: 70}});
      expect((await request('type', {captureId: ended.captureId, text: 'wrong target'})).error.code).toBe('SEARCH_TARGET_REQUIRED');
      const submit = await capture({rect: {x: 20, y: 20, width: 410, height: 70}});
      expect((await request('click', {captureId: submit.captureId, x: 390, y: 50, intent: 'searchControl'})).ok).toBe(true);
      await expect(external.locator('h1')).toHaveText('AI应用开发');
      const before = await capture();
      expect((await request('scroll', {captureId: before.captureId, x: 200, y: 300, deltaX: 0, deltaY: -200})).ok).toBe(true);
      await expect.poll(() => external.locator('#panel').evaluate(p => p.scrollTop)).toBeGreaterThan(0);
      const after = await capture({batchId: before.batchId});
      expect(after.sha256).not.toBe(before.sha256);
      expect(after.sequence).toBe(2);
      // This mutation exists only in the isolated fixture to prove same-URL stale-image rejection.
      await external.locator('h1').evaluate(p => { p.textContent = '页面内容改变'; });
      expect((await request('click', {captureId: after.captureId, x: 390, y: 50, intent: 'searchControl'})).error.code).toBe('STALE_CAPTURE');
      const previous = await capture();
      await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].setContentSize(900, 1000));
      expect((await request('scroll', {captureId: previous.captureId, x: 200, y: 300, deltaX: 0, deltaY: -100})).error.code).toBe('STALE_CAPTURE');
      for (const zoom of [1, 1.25, 1.5]) {
        await app.evaluate(({webContents}, {domain, zoom}) => webContents.getAllWebContents().find(w => w.getURL().includes(domain))!.setZoomFactor(zoom), {domain, zoom});
        const scaled = await capture({rect: {x: 0, y: 0, width: 300, height: 180}});
        expect(scaled.zoomFactor).toBeCloseTo(zoom);
        expect(scaled.rect).toEqual({x: 0, y: 0, width: 300, height: 180});
      }
      expect((await request('read')).error.code).toBe('WORKFLOW_DEPRECATED');
      expect((await request('automation')).error.code).toBe('WORKFLOW_REJECTED');
      expect(await app.evaluate(({app}) => app.commandLine.hasSwitch('remote-debugging-port'))).toBe(false);
      expect((await ipc('platform.read', {key, platform})).error.code).toBe('WORKFLOW_DEPRECATED');
      expect((await request('navigate', {url: 'https://example.com/'})).error.code).toBe('WORKFLOW_REJECTED');
      await ipc('browser.focus', {key: 'jd-workbench'});
      expect((await request('capture')).error.code).toBe('TARGET_NOT_VISIBLE');
      await request('focus');
      await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].minimize());
      expect((await request('capture')).error.code).toBe('TARGET_NOT_VISIBLE');
      await request('focus');
      expect(await external.evaluate(() => typeof (window as any).jdDesktop)).toBe('undefined');
      expect((await request('capture', {key: 'jd-workbench'})).error.code).toBe('TAB_NOT_FOUND');
      expect((await request('tabs')).data).toHaveLength(1);
    } finally { await app.close(); }
  });
}
