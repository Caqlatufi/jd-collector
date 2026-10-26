import {test, expect, electron} from '../native/harness.mjs';
import {mkdtemp, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';

async function fixture() {
  const env = {...process.env, JD_DESKTOP_USER_DATA: await mkdtemp(path.join(tmpdir(), 'jd-import-background-'))};
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({args: [path.resolve('dist-electron')], env});
  await app.firstWindow();
  await expect.poll(() => app.context().pages().some(p => p.url().startsWith('http://127.0.0.1:7890/jd-collector/'))).toBe(true);
  const workbench = app.context().pages().find(p => p.url().startsWith('http://127.0.0.1:7890/jd-collector/'))!;
  await workbench.route('**/api/**', route => route.request().method() === 'GET' ? route.continue() : route.abort());
  await app.evaluate(({session}) => {
    session.fromPartition('persist:jd-browser-www_zhipin_com').protocol.handle('https', () => new Response(`
      <meta charset="utf-8"><title>自动收录岗位</title>
      <style>body{margin:0;background:rgb(20,80,140);font:24px sans-serif;color:white}h1{margin:20px}input{caret-color:transparent}
      #panel{height:260px;overflow:auto;background:#eee;color:#111}p{margin:0;height:180px}</style>
      <h1>Go 工程师</h1><input aria-label="手动验证"><button onclick="document.cookie='fixtureLogin=ready;path=/';document.querySelector('h1').textContent='验证完成'">完成验证</button>
      <div id="panel"><p>职责一 Go 开发</p><p>职责二 Vue 管理界面</p><p>任职要求 MySQL</p><p>正文结束</p></div>`,
      {headers: {'Content-Type': 'text/html;charset=utf-8'}}));
  });
  const connection = JSON.parse(await readFile(path.join(env.JD_DESKTOP_USER_DATA, 'workflow-connection.json'), 'utf8'));
  const request = (action: string, payload: object = {}, platform = 'BOSS'): Promise<any> => new Promise((resolve, reject) => {
    const socket = net.connect(connection.pipe); let data = '';
    socket.setEncoding('utf8'); socket.setTimeout(16000, () => { socket.destroy(); reject(Error('timeout')); });
    socket.on('error', reject);
    socket.on('connect', () => socket.write(JSON.stringify({token: connection.token, platform, action, ...payload}) + '\n'));
    socket.on('data', chunk => { data += chunk; }); socket.on('end', () => resolve(JSON.parse(data)));
  });
  const ipc = (command: string, payload: object = {}) => workbench.evaluate(({command, payload}) =>
    window.jdDesktop!.request(command as any, payload), {command, payload}) as Promise<any>;
  const ready = (key: string) => expect.poll(async () => (await request('tabs')).data.find((t: any) => t.key === key)?.status).toBe('ready');
  return {app, workbench, request, ipc, ready};
}

test('后台收录截图与嵌套滚动不切标签、不改输入焦点，失焦/最小化仍可读取（隔离夹具）', async () => {
  const {app, request, ipc, ready} = await fixture();
  try {
    expect((await request('info')).data.backgroundJobCapture).toBe(true);
    expect((await request('open')).ok).toBe(true);
    const original = (await request('tabs')).data[0];
    await ready(original.key);
    const external = app.context().pages().find(p => p.url() === original.url)!;
    await external.locator('input').fill('继续我的工作');
    const focusedId = await app.evaluate(({webContents}) => webContents.getFocusedWebContents()?.id);
    const key = 'jd-import:00000000-0000-0000-0000-000000000001';
    const url = 'https://www.zhipin.com/job_detail/fixture~.html';
    expect((await request('openJob', {key, url})).ok).toBe(true);
    await ready(key);
    expect((await request('tabs')).data.find((t: any) => t.key === key).active).toBe(false);
    expect((await request('tabs')).data.find((t: any) => t.key === original.key).active).toBe(true);
    expect(await app.evaluate(({webContents}) => webContents.getFocusedWebContents()?.id)).toBe(focusedId);
    const capture = async () => {
      const result = await request('capture', {key});
      expect(result, JSON.stringify(result)).toHaveProperty('ok', true);
      return result.data;
    };
    const before = await capture();
    expect(before.sourceUrl).toBe(url);
    expect(await app.evaluate(({nativeImage}, file) => [...nativeImage.createFromPath(file).toBitmap().subarray(0, 4)], before.filePath)).toEqual([140, 80, 20, 255]);
    expect((await request('scroll', {key, captureId: before.captureId, x: 200, y: 200, deltaX: 0, deltaY: -200})).ok).toBe(true);
    const target = app.context().pages().find(p => p.url() === url)!;
    await expect.poll(() => target.locator('#panel').evaluate(el => el.scrollTop)).toBe(200);
    await target.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const after = await capture();
    expect(after.sha256).not.toBe(before.sha256);
    expect(await app.evaluate(({webContents}) => webContents.getFocusedWebContents()?.id)).toBe(focusedId);
    await expect(external.locator('input')).toHaveValue('继续我的工作');
    expect(await external.evaluate(() => document.activeElement?.tagName)).toBe('INPUT');
    await ipc('browser.focus', {key: 'jd-workbench'});
    const switched = await request('scroll', {key, captureId: after.captureId, x: 200, y: 200, deltaX: 0, deltaY: -100});
    expect(switched, JSON.stringify(switched)).toHaveProperty('ok', true);
    await expect.poll(() => target.locator('#panel').evaluate(el => el.scrollTop)).toBe(300);
    await target.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const fresh = await capture();
    for (const action of ['click', 'type', 'key']) {
      expect((await request(action, {key, captureId: fresh.captureId})).error.code).toBe('WORKFLOW_REJECTED');
    }
    await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].blur());
    await capture();
    await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].minimize());
    const minimized = await capture();
    expect((await request('scroll', {key, captureId: minimized.captureId, x: 200, y: 200, deltaX: 0, deltaY: -100})).ok).toBe(true);
    expect(await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].isMinimized())).toBe(true);
    expect((await request('openJob', {key, url})).ok).toBe(true);
    expect((await request('tabs')).data).toHaveLength(2);
    expect((await ipc('browser.list')).data.find((t: any) => t.active).key).toBe('jd-workbench');
    for (const invalid of ['https://evil.test/job_detail/a.html', 'https://www.zhipin.com/web/geek/chat',
      'javascript:alert(1)', 'https://user@www.zhipin.com/job_detail/a.html']) {
      expect((await request('openJob', {key, url: invalid})).ok).toBe(false);
    }
    expect((await request('openJob', {key: original.key, url})).ok).toBe(false);
    expect(await app.evaluate(({webContents}, {url, original}) => {
      const contents = webContents.getAllWebContents();
      return contents.find(w => w.getURL() === url)!.session === contents.find(w => w.getURL() === original)!.session;
    }, {url, original: original.url})).toBe(true);
    await ipc('browser.focus', {key: original.key});
    await ipc('browser.close', {key: original.key});
    expect((await ipc('browser.list')).data.find((t: any) => t.active).key).toBe('jd-workbench');
    const previous = await capture();
    await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].setContentSize(900, 1000));
    expect((await request('scroll', {key, captureId: previous.captureId, x: 200, y: 200, deltaX: 0, deltaY: -100})).error.code).toBe('STALE_CAPTURE');
    await ipc('browser.close', {key});
    expect((await request('capture', {key})).error.code).toBe('TAB_NOT_FOUND');
  } finally { await app.close(); }
});

test('通用官网详情后台截图保留岗位查询参数，不切标签，并复用同站会话（隔离夹具）', async () => {
  const {app, request, ipc} = await fixture();
  const web = (action: string, payload: object = {}) => request(action, payload, 'WEB');
  try {
    await app.evaluate(({session}) => {
      session.fromPartition('persist:jd-browser-careers_example_com').protocol.handle('https', () => new Response(`
        <meta charset="utf-8"><title>全栈工程师 - 夹具公司</title>
        <style>body{background:#eee;font:24px sans-serif}article{height:400px;overflow:auto}p{height:250px}</style>
        <h1>全栈工程师</h1><h2>夹具公司</h2><article><p>岗位职责 Java / Vue</p><p>任职要求 SQL</p><p>正文结束</p></article>`,
        {headers: {'Content-Type': 'text/html;charset=utf-8'}}));
    });
    expect((await web('info')).data.genericJobCapture).toBe(true);
    const key = 'jd-import:00000000-0000-0000-0000-000000000003';
    const url = 'https://careers.example.com/jobs?id=42#/detail/42';
    const activeBefore = (await ipc('browser.list')).data.find((t: any) => t.active).key;
    expect((await web('openJob', {key, url})).ok).toBe(true);
    await expect.poll(async () => (await web('tabs')).data.find((t: any) => t.key === key)?.status).toBe('ready');
    expect((await ipc('browser.list')).data.find((t: any) => t.active).key).toBe(activeBefore);
    const result = await web('capture', {key});
    expect(result.ok).toBe(true);
    expect(result.data.sourceUrl).toBe(url);
    expect((await web('scroll', {key, captureId: result.data.captureId, x: 200, y: 200, deltaX: 0, deltaY: -100})).ok).toBe(true);
    expect((await ipc('browser.list')).data.find((t: any) => t.active).key).toBe(activeBefore);
    for (const bad of ['http://careers.example.com/jobs/42', 'https://user@careers.example.com/jobs/42', 'javascript:alert(1)'])
      expect((await web('openJob', {key, url: bad})).ok).toBe(false);
    expect((await web('openJob', {key: 'ordinary-tab', url})).ok).toBe(false);
    await web('open', {key: 'ordinary-tab', url});
    expect(await app.evaluate(({webContents}) => {
      const contents = webContents.getAllWebContents().filter(w => w.getURL().startsWith('https://careers.example.com/jobs'));
      return contents.length === 2 && contents[0].session === contents[1].session;
    })).toBe(true);
    const addressKey = 'company-address:00000000-0000-0000-0000-000000000004';
    expect((await web('info')).data.companyAddressCapture).toBe(true);
    expect((await web('openJob', {key: addressKey, url})).ok).toBe(true);
    await expect.poll(async () => (await web('tabs')).data.find((t: any) => t.key === addressKey)?.status).toBe('ready');
    expect((await web('tabs')).data.find((t: any) => t.key === addressKey).active).toBe(false);
    expect((await web('capture', {key: addressKey})).data.sourceUrl).toBe(url);
    expect((await web('openJob', {key: 'company-address:invalid', url})).ok).toBe(false);
  } finally { await app.close(); }
});

test('手动打开收录标签可完成验证，返回工作台后后台接续且共享登录状态（隔离模拟任务）', async () => {
  const {app, workbench, request, ipc, ready} = await fixture();
  try {
    const key = 'jd-import:00000000-0000-0000-0000-000000000002';
    const url = 'https://www.zhipin.com/job_detail/verifyfixture.html';
    const task = {taskId: key.slice(10), tabKey: key, sourceUrl: url, status: 'WAITING_USER', attempt: 1,
      message: '请在收录标签完成验证', createdAt: '2026-10-17T10:00:00Z'};
    await workbench.route('**/api/**', route => {
      if (route.request().method() !== 'GET') return route.abort();
      return route.fulfill({json: {code: 200, result: new URL(route.request().url()).pathname.endsWith('/posting-imports') ? [task] : [], page: {totalElements: 0}}});
    });
    await request('openJob', {key, url});
    await ready(key);
    const before = await request('capture', {key});
    expect(before.ok).toBe(true);
    await workbench.goto('./postings');
    await workbench.getByRole('button', {name: '新增 JD', exact: true}).click();
    await workbench.getByRole('button', {name: '打开收录标签', exact: true}).click();
    await ready(key);
    expect((await request('tabs')).data.find((t: any) => t.key === key).active).toBe(true);
    expect((await request('capture', {key})).error.code).toBe('TARGET_IN_USE');
    const interactive = app.context().pages().find(p => p.url() === url)!;
    expect(await app.evaluate(({webContents}, url) => webContents.getAllWebContents().find(w => w.getURL() === url)!.isOffscreen(), url)).toBe(false);
    await interactive.locator('input').fill('用户手动验证');
    await interactive.getByRole('button', {name: '完成验证'}).click();
    await expect(interactive.locator('h1')).toHaveText('验证完成');
    expect((await request('openJob', {key, url})).error.code).toBe('TARGET_IN_USE');
    await ipc('browser.focus', {key: 'jd-workbench'});
    expect((await request('openJob', {key, url})).ok).toBe(true);
    await ready(key);
    const resumed = await request('capture', {key});
    expect(resumed.ok).toBe(true);
    expect(resumed.data.pageRevision).toBeGreaterThan(before.data.pageRevision);
    expect((await ipc('browser.list')).data.find((t: any) => t.active).key).toBe('jd-workbench');
    expect(await app.evaluate(async ({webContents}, url) => {
      const contents = webContents.getAllWebContents().find(w => w.getURL() === url)!;
      return (await contents.session.cookies.get({name: 'fixtureLogin'})).some(c => c.value === 'ready');
    }, url)).toBe(true);
    expect((await request('tabs')).data).toHaveLength(1);
  } finally { await app.close(); }
});
