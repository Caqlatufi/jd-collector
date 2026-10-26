import {expect, test} from './native/harness.mjs';

test('真实本地上海地图全量公司、岗位多办公点和底图展示（只读）', async ({page}) => {
  await page.setViewportSize({width: 1560, height: 1300});
  await page.route('**/api/**', async route => {
    if (route.request().method() !== 'GET') return route.abort();
    return route.continue();
  });
  const response = await page.request.get('/jd-collector/api/companies?size=100');
  const total = (await response.json()).page.totalElements;
  await page.goto('./companies');
  await expect(page.locator('.el-table__row')).toHaveCount(total);
  await page.getByText('上海地图', {exact: true}).click();
  const map = page.locator('[data-testid="company-shanghai-map"]');
  await expect.poll(() => map.locator('canvas').count()).toBeGreaterThan(0);
  await expect.poll(async () => Number(await map.locator('.road-status').getAttribute('data-road-count'))).toBeGreaterThan(5000);
  await expect(map.locator('.location-card').first()).toBeVisible();
  await expect(map.locator('.el-loading-mask')).toHaveCount(0);
  await expect(map.locator('.el-alert')).toHaveCount(0);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({path: 'test-results/company-shanghai-map-live.png'});
  const officeCount = await map.locator('.location-card[data-company-id="87"]').count();
  await map.locator('input[aria-label="地图搜索"]').fill('上海迪爱斯');
  await expect.poll(() => map.locator('.location-card[data-company-id="87"]').count()).toBeGreaterThanOrEqual(2);
  await expect(map.locator('.location-card')).toHaveCount(officeCount);
  await map.locator('.company-name').first().click();
  await expect(map.locator('.sidebar-heading')).toContainText('选中的工作地点');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({path: 'test-results/company-shanghai-map-live-multiple.png'});
});
