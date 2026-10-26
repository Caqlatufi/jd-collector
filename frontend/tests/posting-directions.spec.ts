import {expect, test} from './native/harness.mjs';

test('新增岗位分类从接口加载，可筛选、查看中文名称并在刷新后保留（隔离模拟）', async ({page}) => {
  await page.setViewportSize({width: 720, height: 1000});
  const row = {id: 9901, companyId: 9902, companyName: '分类夹具公司', title: '数仓开发工程师',
    direction: 'DIR_data', source: 'OTHER', tier: 'B', stage: 'SCREENED', totalScore: 50};
  let selected = '';
  let fail = false;
  await page.route('**/api/**', async route => {
    if (route.request().method() !== 'GET') return route.abort();
    const url = new URL(route.request().url());
    let result: unknown = [];
    if (url.pathname.endsWith('/posting-directions')) {
      if (fail) return route.fulfill({status: 500, json: {code: 50001, msg: '分类加载失败，请重试'}});
      result = [{value: 'JAVA_BACKEND', label: 'Java 后端', description: 'Java 业务开发'},
        {value: 'DIR_data', label: '数据工程', description: '数据管道和数据仓库建设'}];
    } else if (url.pathname.endsWith('/postings')) {
      selected = url.searchParams.get('direction') || '';
      result = [row];
    } else if (url.pathname.endsWith('/postings/9901')) result = row;
    return route.fulfill({json: {code: 200, result, page: {totalElements: Array.isArray(result) ? result.length : 0}}});
  });
  await page.goto('./postings');
  await expect(page.locator('.el-table__row')).toHaveCount(1);
  await page.locator('.page-toolbar .el-select').nth(0).click();
  await page.getByRole('option', {name: '数据工程', exact: true}).click();
  await expect.poll(() => selected).toBe('DIR_data');
  await expect.poll(() => new URL(page.url()).searchParams.get('direction')).toBe('DIR_data');
  await page.reload();
  await expect(page.locator('.page-toolbar .el-select').nth(0)).toContainText('数据工程');
  await page.getByRole('button', {name: row.title, exact: true}).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('数据工程', {exact: true})).toBeVisible();
  await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))));
  await page.screenshot({path: 'test-results/posting-directions-720.png'});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto('./postings');
  fail = true;
  await page.getByRole('button', {name: '查询', exact: true}).click();
  await expect(page.getByText('分类加载失败，请重试', {exact: true})).toBeVisible();
  fail = false;
  await page.getByRole('button', {name: '查询', exact: true}).click();
  await expect(page.locator('.el-table__row')).toHaveCount(1);
});
