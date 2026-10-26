import {expect, test} from './native/harness.mjs';

test('缺失链接可手动填写，校验、失败重试、按钮切换、刷新与窄屏布局正确（模拟响应）', async ({page}) => {
  await page.setViewportSize({width: 1665, height: 1000});
  let posting = {id: 8891, companyId: 8892, companyName: '补链夹具公司', title: '待补链接岗位',
    direction: 'JAVA_BACKEND', source: 'BOSS', sourceUrl: '  ', rawJd: '完整测试JD', stage: 'APPLIED',
    appliedAt: '2026-10-08T10:00:00', tier: 'A', totalScore: 75, matchScore: 30, companyScore: 15,
    freshnessScore: 10, commuteScore: 10, salaryScore: 10};
  const url = 'https://www.zhipin.com/job_detail/8891.html?from=search&track=kept';
  let calls = 0;
  let submitted: Record<string, unknown> = {};
  let complete: (() => Promise<void>) | undefined;
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/postings/8891/source-url') && route.request().method() === 'PUT') {
      submitted = route.request().postDataJSON();
      calls++;
      if (calls === 1) return route.fulfill({status: 500, json: {code: 50001, msg: '模拟链接保存失败'}});
      complete = async () => {
        posting = {...posting, sourceUrl: submitted.sourceUrl as string};
        await route.fulfill({json: {code: 200, result: posting}});
      };
      return;
    }
    if (route.request().method() !== 'GET') return route.abort();
    if (path.endsWith('/postings')) return route.fulfill({json: {code: 200, result: [posting], page: {totalElements: 1}}});
    return route.fulfill({json: {code: 200, result: [], page: {totalElements: 0}}});
  });
  await page.goto('./postings');
  const row = page.locator('.el-table__row').filter({hasText: posting.title});
  await expect(row.getByRole('button', {name: '打开 JD', exact: true})).toHaveCount(0);
  await row.getByRole('button', {name: '填写链接', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: '填写 JD 链接', exact: true});
  const input = dialog.locator('input[aria-label="JD 链接"]');
  const save = dialog.getByRole('button', {name: '保存', exact: true});
  await save.click();
  await expect(dialog.getByText('请填写 JD 链接', {exact: true})).toBeVisible();
  await input.fill('javascript:alert(1)');
  await save.click();
  await expect(dialog.getByText('请填写完整的 HTTPS 岗位链接', {exact: true})).toBeVisible();
  expect(calls).toBe(0);
  await input.fill('  ' + url + '  ');
  await save.click();
  await expect(page.getByText('模拟链接保存失败', {exact: true})).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(input).toHaveValue('  ' + url + '  ');
  await save.click();
  await expect.poll(() => calls).toBe(2);
  await expect(dialog.getByRole('button', {name: '取消', exact: true})).not.toBeEnabled();
  await expect(input).not.toBeEnabled();
  expect(submitted).toEqual({sourceUrl: url, expectedSourceUrl: '  '});
  await complete!();
  await expect(dialog).toBeHidden();
  await expect(row.getByRole('button', {name: '填写链接', exact: true})).toHaveCount(0);
  await expect(row.getByRole('button', {name: '打开 JD', exact: true})).toBeEnabled();
  await expect(row).toContainText('75 / 100');
  await expect(row).toContainText('已投递');
  await page.reload();
  await expect(row.getByRole('button', {name: '打开 JD', exact: true})).toBeEnabled();
  // Prepare a second empty fixture to check cancellation and the narrow dialog.
  posting = {...posting, sourceUrl: ''};
  await page.reload();
  await page.setViewportSize({width: 720, height: 1000});
  await row.getByRole('button', {name: '填写链接', exact: true}).click();
  await expect(dialog).toBeVisible();
  await input.fill(url);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))));
  await page.screenshot({path: 'test-results/posting-link-720.png'});
  await dialog.getByRole('button', {name: '取消', exact: true}).click();
  expect(calls).toBe(2);
  await expect(row.getByRole('button', {name: '填写链接', exact: true})).toBeEnabled();
});
