import {expect, test} from './native/harness.mjs';

test('JD精简工具栏支持回车、阶段即查、刷新和失败重试（隔离模拟响应）', async ({page}) => {
  await page.setViewportSize({width: 1665, height: 1000});
  const base = {companyId: 901, companyName: '查询夹具公司', direction: 'FULL_STACK', source: 'OTHER',
    tier: 'A', totalScore: 75, stage: 'SCREENED'};
  const postings = [
    {...base, id: 801, title: 'Java工程师', rawJd: 'Java全栈开发'},
    {...base, id: 802, title: 'AI平台工程师', rawJd: 'Python任务执行服务'},
    {...base, id: 803, title: '数据工程师', rawJd: 'SQL报表开发', stage: 'MESSAGE_SENT'},
  ];
  const requests: URLSearchParams[] = [];
  let failNext = false;
  await page.route('**/api/**', async route => {
    if (route.request().method() !== 'GET') return route.abort();
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/postings')) {
      requests.push(url.searchParams);
      if (failNext) {
        failNext = false;
        return route.fulfill({status: 500, json: {code: 50001, msg: '模拟查询失败'}});
      }
      const keyword = (url.searchParams.get('keyword') || '').trim().toLowerCase();
      const stage = url.searchParams.get('stage');
      const result = postings.filter(row => (!stage || row.stage === stage)
        && `${row.companyName} ${row.title} ${row.rawJd}`.toLowerCase().includes(keyword));
      return route.fulfill({json: {code: 200, result, page: {totalElements: result.length}}});
    }
    const result = url.pathname.endsWith('/companies') ? [{id: 901, name: base.companyName, active: true}] : [];
    return route.fulfill({json: {code: 200, result, page: {totalElements: result.length}}});
  });
  await page.goto('./postings');
  const toolbar = page.locator('.page-toolbar');
  const search = page.getByRole('textbox', {name: '搜索公司、岗位或 JD 原文', exact: true});
  const rows = page.locator('.el-table__row');
  await expect(rows).toHaveCount(3);
  await expect(toolbar.locator('.el-select')).toHaveCount(2);
  await expect(toolbar.getByRole('button', {name: '导出 CSV', exact: true})).toHaveCount(0);
  await expect(toolbar.getByRole('button', {name: '知识图谱', exact: true})).toBeVisible();
  await expect(toolbar.getByRole('button', {name: 'JD门槛', exact: true})).toBeVisible();
  await expect(toolbar.getByRole('button', {name: '新增 JD', exact: true})).toBeVisible();
  expect(requests.at(-1)?.get('sortBy')).toBe('BOSS_COMPETITION');
  const before = requests.length;
  await search.fill('夹具公司');
  await page.keyboard.press('Enter');
  await expect(rows).toHaveCount(3);
  await expect.poll(()=>requests.at(-1)?.get('keyword')).toBe('夹具公司');
  await search.fill('Python');
  await page.keyboard.press('Enter');
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('AI平台工程师');
  expect(requests.length).toBe(before + 2);
  expect(requests.at(-1)?.get('keyword')).toBe('Python');
  await page.reload();
  await expect(search).toHaveValue('Python');
  await expect(rows).toContainText('AI平台工程师');

  await search.fill('');
  await page.keyboard.press('Enter');
  await expect(rows).toHaveCount(3);
  await toolbar.locator('.el-select').nth(1).click();
  await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))));
  await page.getByRole('option', {name: '已发消息未回复', exact: true}).click();
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('数据工程师');
  expect(requests.at(-1)?.get('stage')).toBe('MESSAGE_SENT');

  await search.fill('不存在的岗位');
  await page.keyboard.press('Enter');
  await expect(rows).toHaveCount(0);
  await expect(page.getByText('共 0 条岗位', {exact: true})).toBeVisible();
  failNext = true;
  await search.fill('SQL');
  await page.keyboard.press('Enter');
  await expect(page.getByText('模拟查询失败', {exact: true})).toBeVisible();
  await expect(search).toHaveValue('SQL');
  await toolbar.getByRole('button', {name: '查询', exact: true}).click();
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('数据工程师');
  await page.setViewportSize({width: 720, height: 1000});
  await expect(search).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path: 'test-results/posting-search-720.png'});
});
