import {expect, test} from './native/harness.mjs';

test('公司官方渠道可编辑并由同公司JD复用（模拟响应，不写个人库）', async ({page}) => {
  await page.setViewportSize({width: 1560, height: 1000});
  let company = {id: 9881, name: '渠道测试公司', businessType: 'UNKNOWN', productOwnership: 'UNKNOWN',
    officialApplicationUrl: '', notes: '已有备注', active: true};
  const url = 'https://careers.example.com/jobs';
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path.endsWith('/companies/9881') && method === 'PUT') {
      company = {...company, ...route.request().postDataJSON()};
      return route.fulfill({json: {code: 200, result: company}});
    }
    if (method !== 'GET') return route.abort();
    if (path.endsWith('/companies')) return route.fulfill({json: {code: 200, result: [company], page: {totalElements: 1}}});
    if (path.endsWith('/postings')) return route.fulfill({json: {code: 200, result: [
      {id: 9882, companyId: 9881, companyName: company.name, title: '同公司岗位一', stage: 'SCREENED', tier: 'A', totalScore: 70},
      {id: 9883, companyId: 9881, companyName: company.name, title: '同公司岗位二', stage: 'SCREENED', tier: 'B', totalScore: 60},
    ], page: {totalElements: 2}}});
    return route.fulfill({json: {code: 200, result: [], page: {totalElements: 0}}});
  });
  await page.goto('./companies');
  const row = page.locator('.el-table__row').filter({hasText: company.name});
  await expect(row).toContainText('未确认');
  await row.getByRole('button', {name: '编辑', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: '编辑公司', exact: true});
  await dialog.locator('input[aria-label="官网投递渠道链接"]').fill(url);
  await dialog.getByRole('button', {name: '保存', exact: true}).click();
  await expect(dialog).toBeHidden();
  expect(company.officialApplicationUrl).toBe(url);
  expect(company.notes).toBe('已有备注');
  await expect(row.getByRole('button', {name: '官方招聘', exact: true})).toBeVisible();
  await page.reload();
  await expect(row.getByRole('button', {name: '官方招聘', exact: true})).toBeVisible();
  await page.goto('./postings');
  await expect(page.getByRole('button', {name: '官方招聘', exact: true})).toHaveCount(2);
  await page.screenshot({path: 'test-results/company-official-channel.png'});
});

test('已回填的官方渠道在真实本地公司页展示（只读）', async ({page}) => {
  await page.setViewportSize({width: 1560, height: 1000});
  await page.route('**/api/**', async route => {
    if (route.request().method() !== 'GET') return route.abort();
    return route.continue();
  });
  await page.goto('./companies');
  const row = page.locator('.el-table__row').filter({hasText: '卫龙'});
  await expect(row.getByRole('button', {name: '官方招聘', exact: true})).toBeVisible();
  await row.getByRole('button', {name: '编辑', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: '编辑公司', exact: true});
  await expect(dialog.locator('input[aria-label="官网投递渠道链接"]'))
    .toHaveValue('https://weilongmeiwei.jobs.feishu.cn/439244');
  await page.screenshot({path: 'test-results/company-official-channel-live.png'});
  await dialog.getByRole('button', {name: '取消', exact: true}).click();
});
