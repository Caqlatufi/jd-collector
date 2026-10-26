import {test, expect, electron} from '../native/harness.mjs';
import {mkdtemp, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import net from 'node:net';
import path from 'node:path';

test('通用 MCP 浏览接口：隔离 Electron 原生截图、后台滚动、跨页失效和固定标签保护', async () => {
  const env = {...process.env, JD_DESKTOP_USER_DATA: await mkdtemp(path.join(tmpdir(), 'jd-mcp-native-')), JD_DESKTOP_BACKGROUND_WORKFLOW: 'true'};
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({args: [path.resolve('dist-electron')], env});
  try {
    await app.firstWindow();
    await expect.poll(() => app.context().pages().some(p => p.url().startsWith('http://127.0.0.1:7890/jd-collector/'))).toBe(true);
    const workbench = app.context().pages().find(p => p.url().startsWith('http://127.0.0.1:7890/jd-collector/'))!;
    await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].showInactive());
    await workbench.route('**/api/**', route => route.request().method() === 'GET' ? route.continue() : route.abort());
    await app.evaluate(({session}) => {
      session.fromPartition('persist:jd-browser-www_linkedin_com').protocol.handle('https', () => new Response('<!doctype html><meta charset="utf-8"><style>body{margin:0;background:white;font:28px sans-serif}section{height:900px}</style><section>Fixture professional profile</section><section>Work experience</section><section>Education</section>', {headers: {'Content-Type': 'text/html;charset=utf-8'}}));
    });
    const connection = JSON.parse(await readFile(path.join(env.JD_DESKTOP_USER_DATA, 'workflow-connection.json'), 'utf8'));
    const request = (action: string, data: object = {}): Promise<any> => new Promise((resolve, reject) => {
      const socket = net.connect(connection.pipe); let result = '';
      socket.setEncoding('utf8'); socket.setTimeout(16000, () => {socket.destroy(); reject(new Error('timeout'));});
      socket.on('error', reject);
      socket.on('connect', () => socket.write(JSON.stringify({token: connection.token, platform: 'WEB', action, ...data}) + '\n'));
      socket.on('data', chunk => {result += chunk;}); socket.on('end', () => resolve(JSON.parse(result)));
    });
    expect((await request('info')).data.version).toBe(3);
    expect((await request('open', {url: 'http://example.com/'})).error.code).toBe('WORKFLOW_REJECTED');
    const key = 'mcp-native-fixture';
    expect((await request('open', {key, url: 'https://www.linkedin.com/in/fixture?token=hidden'})).ok).toBe(true);
    await expect.poll(async () => (await request('tabs')).data.find((t: any) => t.key === key)?.status).toBe('ready');
    const page = app.context().pages().find(p => p.url().includes('linkedin.com'))!;
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await request('focus', {key});
    const first = await request('capture', {key}); expect(first, JSON.stringify(first)).toHaveProperty('ok', true);
    const bytes = await readFile(first.data.filePath);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(first.data.sha256);
    expect(first.data.platform).toBe('WEB'); expect(first.data.sourceUrl).toBe('https://www.linkedin.com/in/fixture');
    expect((await request('scroll', {key, captureId: first.data.captureId, x: 200, y: 300, deltaX: 0, deltaY: -400})).ok).toBe(true);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    const second = await request('capture', {key}); expect(second.data.sha256).not.toBe(first.data.sha256);
    expect((await request('navigate', {key, url: 'https://www.linkedin.com/in/other'})).ok).toBe(true);
    await expect.poll(async () => (await request('tabs')).data.find((t: any) => t.key === key)?.status).toBe('ready');
    expect((await request('scroll', {key, captureId: second.data.captureId, x: 200, y: 300, deltaX: 0, deltaY: -100})).error.code).toBe('STALE_CAPTURE');
    expect((await request('capture', {key: 'jd-workbench'})).error.code).toBe('TAB_NOT_FOUND');
    expect((await request('close', {key: 'jd-workbench'})).error.code).toBe('TAB_NOT_FOUND');
    expect((await request('capture', {key, script: 'document.body.innerText'})).error.code).toBe('WORKFLOW_REJECTED');
    expect((await request('close', {key})).ok).toBe(true);
    expect(await app.evaluate(({app}) => app.commandLine.hasSwitch('remote-debugging-port'))).toBe(false);
  } finally {await app.close();}
});
