import {test, expect, electron} from '../native/harness.mjs';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

test('岗位原页通过真实桌面 IPC 打开、重复复用、共享会话，并处理缺失链接和非法链接（隔离夹具）', async () => {
  const userData = await mkdtemp(path.join(tmpdir(), 'jd-posting-jump-'));
  const env = {...process.env, JD_DESKTOP_USER_DATA: userData};
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({args: [path.resolve('dist-electron')], env});
  try {
    await app.evaluate(({BrowserWindow}) => { const window = BrowserWindow.getAllWindows()[0]; window.show(); window.focus(); });
    const entry = env.JD_DESKTOP_URL || 'http://127.0.0.1:7890/jd-collector/';
    await expect.poll(() => app.context().pages().some(page => page.url().startsWith(entry))).toBe(true);
    const page = app.context().pages().find(page => page.url().startsWith(entry))!;
    const toolbar = await app.firstWindow();
    await expect(page.getByRole('menuitem', {name: 'JD 列表', exact: true})).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.readyState)).toBe('complete');
    await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].setContentSize(1665, 1098));
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1665);
    const base = {companyId: 991, companyName: '跳转夹具公司', direction: 'JAVA_BACKEND', source: 'BOSS',
      rawJd: '隔离测试岗位', stage: 'SCREENED', tier: 'A', totalScore: 80, blockingRisk: false,
      matchScore: 30, companyScore: 15, freshnessScore: 10, commuteScore: 10, salaryScore: 15};
    const url = 'https://www.zhipin.com/job_detail/jump-one.html?from=test';
    const postings = [
      {...base, id: 991, title: '跳转岗位一', sourceUrl: ` ${url} `},
      {...base, id: 992, title: '跳转岗位二', sourceUrl: 'https://www.zhipin.com/job_detail/jump-two.html'},
      {...base, id: 993, title: '缺少链接岗位', sourceUrl: '  '},
      {...base, id: 994, title: '非法链接岗位', sourceUrl: 'javascript:alert(1)'},
    ];
    await page.route('**/api/postings?*', route => route.fulfill({json: {code: 200, result: postings, page: {totalElements: 4}}}));
    const addedUrl = 'https://www.zhipin.com/job_detail/jump-added.html?from=pasted';
    await page.route('**/api/postings/993/source-url', route => {
      expect(route.request().method()).toBe('PUT');
      expect(route.request().postDataJSON()).toEqual({sourceUrl: addedUrl, expectedSourceUrl: '  '});
      postings[2] = {...postings[2], sourceUrl: addedUrl};
      return route.fulfill({json: {code: 200, result: postings[2]}});
    });
    await page.route('**/api/companies?*', route => route.fulfill({json: {code: 200, result: []}}));
    await page.route('**/api/resume-versions?*', route => route.fulfill({json: {code: 200, result: []}}));
    // The fixture runs in the platform partition; no real recruiting website is contacted.
    await app.evaluate(({session}) => {
      session.fromPartition('persist:jd-browser-www_zhipin_com').protocol.handle('https', request => new Response(
        '<meta charset="utf-8"><title>岗位夹具</title><h1>' + new URL(request.url).pathname + '</h1>' +
        '<input id="draft"><script>window.instance=crypto.randomUUID()</script>',
        {headers: {'Content-Type': 'text/html;charset=utf-8'}}));
    });
    await page.goto(entry + 'postings');
    const button = (title: string) => page.locator('.el-table__row').filter({hasText: title})
      .getByRole('button', {name: '打开 JD', exact: true});
    await expect(button('缺少链接岗位')).toHaveCount(0);
    await expect(page.locator('.el-table__row').filter({hasText: '缺少链接岗位'})
      .getByRole('button', {name: '填写链接', exact: true})).toBeEnabled();
    await button('非法链接岗位').click();
    await page.screenshot({path: 'desktop-test-results/posting-jump-error.png'});
    await expect(page.getByText('网页只接受 HTTPS 地址；本地测试可使用回环 HTTP', {exact: true})).toBeVisible();
    await expect(button('非法链接岗位')).toBeEnabled();
    const states = () => page.evaluate(async () => {
      const result = await window.jdDesktop!.request('browser.list', {});
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    });
    expect((await states()).length).toBe(1);
    await button('跳转岗位一').click();
    await expect.poll(() => app.context().pages().some(page => page.url() === url)).toBe(true);
    await expect.poll(async () => (await states()).find(tab => tab.key === 'posting:991')?.active).toBe(true);
    const job = app.context().pages().find(page => page.url() === url)!;
    await expect(job.locator('h1')).toHaveText('/job_detail/jump-one.html');
    const instance = await job.evaluate(() => {
      (document.querySelector('#draft') as HTMLInputElement).value = '未发送沟通草稿';
      return (window as any).instance;
    });
    await toolbar.getByRole('tab', {name: 'JD Collector', exact: true}).click();
    await button('跳转岗位一').click();
    expect((await states()).length).toBe(2);
    expect(await job.evaluate(() => ({draft: (document.querySelector('#draft') as HTMLInputElement).value,
      instance: (window as any).instance}))).toEqual({draft: '未发送沟通草稿', instance});
    await toolbar.getByRole('tab', {name: 'JD Collector', exact: true}).click();
    await button('跳转岗位二').click();
    await expect.poll(() => app.context().pages().some(page => page.url().includes('jump-two.html'))).toBe(true);
    expect((await states()).length).toBe(3);
    expect(await app.evaluate(({webContents}) => {
      const pages = webContents.getAllWebContents();
      return pages.find(page => page.getURL().includes('jump-one.html'))!.session ===
        pages.find(page => page.getURL().includes('jump-two.html'))!.session;
    })).toBe(true);
    await toolbar.getByRole('tab', {name: 'JD Collector', exact: true}).click();
    await page.locator('.el-table__row').filter({hasText: '缺少链接岗位'})
      .getByRole('button', {name: '填写链接', exact: true}).click();
    const linkDialog = page.getByRole('dialog', {name: '填写 JD 链接', exact: true});
    await linkDialog.locator('input[aria-label="JD 链接"]').fill(addedUrl);
    await linkDialog.getByRole('button', {name: '保存', exact: true}).click();
    await expect(linkDialog).toBeHidden();
    await expect(button('缺少链接岗位')).toBeEnabled();
    expect((await states()).length).toBe(3);
    await button('缺少链接岗位').click();
    await expect.poll(() => app.context().pages().some(page => page.url() === addedUrl)).toBe(true);
    expect((await states()).length).toBe(4);
    await toolbar.getByRole('tab', {name: 'JD Collector', exact: true}).click();
    await page.screenshot({path: 'desktop-test-results/posting-jump.png'});
    await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].setContentSize(720, 1198));
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(720);
    await expect(button('跳转岗位一')).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({path: 'desktop-test-results/posting-jump-narrow.png'});
    if (app.routeError) throw app.routeError;
  } finally { await app.close(); }
});
