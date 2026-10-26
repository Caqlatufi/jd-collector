import {expect, test} from './native/harness.mjs';

test('地图地址任务可创建、查看失败、继续和关闭后完成，保留公司地址参考证据（隔离模拟）', async ({page}) => {
  await page.setViewportSize({width: 1000, height: 1200});
  const company = {id: 1, name: '地址流程夹具公司', address: '上海', businessType: 'UNKNOWN', productOwnership: 'UNKNOWN', active: true};
  const task = {taskId: 'fixture', companyId: 1, companyName: company.name, tabKey: 'company-address:fixture', status: 'QUEUED'};
  let tasks: Record<string, unknown>[] = [], discoveries: Record<string, unknown>[] = [];
  let creates = 0, retries = 0;
  await page.route('**/api/**', async route => {
    const r = route.request(), url = new URL(r.url());
    if (url.pathname.endsWith('/company-address-tasks') && r.method() === 'POST') {
      expect(r.postDataJSON()).toEqual({companyId: 1}); creates++; tasks = [task];
      return route.fulfill({json: {code: 200, result: task}});
    }
    if (url.pathname.endsWith('/retry') && r.method() === 'POST') {
      retries++; tasks = [{...task, status: 'RUNNING'}];
      return route.fulfill({json: {code: 200, result: tasks[0]}});
    }
    if (r.method() !== 'GET') return route.abort();
    const result = url.pathname.endsWith('/companies') ? [company] : url.pathname.endsWith('/company-address-tasks') ? tasks
      : url.pathname.endsWith('/address-discoveries') ? discoveries : [];
    return route.fulfill({json: {code: 200, result, page: {totalElements: 1, totalPages: 1}}});
  });
  await page.goto('./companies');
  await page.getByText('上海地图', {exact: true}).click();
  await page.getByRole('button', {name: '补全地址', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: '公司地址查询', exact: true});
  await expect(dialog.getByText('等待查询', {exact: true})).toBeVisible();
  expect(creates).toBe(1);
  tasks = [{...task, status: 'WAITING_USER', message: '请完成网站验证', errorCode: 'VERIFICATION_REQUIRED'}];
  await expect(dialog.getByText('请完成网站验证', {exact: true})).toBeVisible();
  await dialog.getByRole('button', {name: '继续查询', exact: true}).click();
  await expect.poll(() => retries).toBe(1);
  await dialog.getByRole('button', {name: '关闭', exact: true}).click();
  const address = '上海市徐汇区虹梅路1801号';
  discoveries = [{id: 2, companyId: 1, address, sourceType: 'COMPANY', sourceUrl: 'https://cn.bing.com/search?q=fixture', evidenceText: '公司上海办公地址：' + address}];
  tasks = [{...task, status: 'SUCCEEDED', address, sourceType: 'COMPANY', message: '已保存公司地址参考'}];
  await expect(page.locator('.location-card')).toContainText(address);
  await expect(page.locator('.location-card')).toContainText('公司地址参考');
  await page.locator('.address-evidence summary').click();
  await expect(page.locator('.address-evidence')).toContainText('公司上海办公地址');
  await page.screenshot({path: 'test-results/company-address-1000.png'});
  await page.reload();
  await page.getByText('上海地图', {exact: true}).click();
  await expect(page.locator('.location-card')).toContainText(address);
  await page.getByRole('button', {name: '地址查询任务', exact: true}).click();
  await expect(dialog.getByText('地址已保存', {exact: true})).toBeVisible();
});
