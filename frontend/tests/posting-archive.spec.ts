import {expect, test} from './native/harness.mjs';

test('红色归档按钮失败保留岗位，成功移出列表并在刷新后保持隐藏（模拟响应）', async ({page}) => {
  await page.setViewportSize({width: 1665, height: 1000});
  const posting = {id: 8851, companyId: 8853, companyName: '归档夹具公司', title: '待归档岗位',
    direction: 'JAVA_BACKEND', source: 'BOSS', rawJd: '完整JD', stage: 'SCREENED', tier: 'A',
    totalScore: 75, matchScore: 30, companyScore: 15, freshnessScore: 10, commuteScore: 10,
    salaryScore: 10, sourceUrl: 'https://www.zhipin.com/job_detail/archive-fixture.html'};
  const other = {...posting, id: 8852, title: '继续保留的岗位'};
  let archived = false;
  let calls = 0;
  let complete: (() => Promise<void>) | undefined;
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/postings/8851/archive') && route.request().method() === 'PUT') {
      calls++;
      if (calls === 1) return route.fulfill({status: 500, json: {code: 50001, msg: '模拟归档失败'}});
      complete = async () => {
        archived = true;
        await route.fulfill({json: {code: 200, result: true}});
      };
      return;
    }
    if (route.request().method() !== 'GET') return route.abort();
    if (path.endsWith('/postings')) {
      const result = archived ? [other] : [posting, other];
      return route.fulfill({json: {code: 200, result, page: {totalElements: result.length}}});
    }
    if (path.endsWith('/companies')) return route.fulfill({json: {code: 200,
      result: [{id: 8853, name: posting.companyName, active: true}]}});
    return route.fulfill({json: {code: 200, result: []}});
  });
  await page.goto('./postings');
  const row = page.locator('.el-table__row').filter({hasText: posting.title});
  const archive = row.getByRole('button', {name: '归档', exact: true});
  await expect(archive).toHaveClass(/el-button--danger/);
  await archive.click();
  await expect(page.getByText('模拟归档失败', {exact: true})).toBeVisible();
  await expect(row).toHaveCount(1);
  await expect(archive).toBeEnabled();
  await expect(page.getByText('共 2 条岗位', {exact: true})).toBeVisible();
  await archive.click();
  await expect.poll(() => calls).toBe(2);
  await expect(archive).not.toBeEnabled();
  await expect(row.locator('.el-select input')).not.toBeEnabled();
  await complete!();
  await expect(row).toHaveCount(0);
  await expect(page.getByText('JD 已归档', {exact: true})).toBeVisible();
  await expect(page.getByText('共 1 条岗位', {exact: true})).toBeVisible();
  await expect(page.locator('.el-table__row')).toContainText(other.title);
  await page.reload();
  await expect(row).toHaveCount(0);
  await expect(page.locator('.el-table__row')).toContainText(other.title);
  await page.setViewportSize({width: 720, height: 1000});
  await expect(page.getByRole('button', {name: '归档', exact: true})).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({path: 'test-results/posting-archive-720.png'});
  expect(calls).toBe(2);
});
