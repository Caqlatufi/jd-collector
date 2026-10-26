import {expect, test} from './native/harness.mjs';
import {collectLocations} from '../src/company/map/locations';
import type {Company} from '../src/common/model/domain';

const company = (id: number, name: string, address = ''): Company => ({
  id, name, address, businessType: 'UNKNOWN', productOwnership: 'UNKNOWN', active: true, createdAt: '', updatedAt: '',
});

test('地点合并保留一公司多办公点，不将市级地址或外地地址伪装成上海办公楼', async () => {
  const one = {...company(1, '多地点公司', '上海市徐汇区宜山路868号'), workLocations: [
    {address: '上海徐汇区宜山路868号', longitude: 121.43, latitude: 31.18},
    {address: '上海市浦东新区张江'},
  ]};
  const rows = collectLocations([one, company(2, '外地公司', '深圳市南山区'), company(3, '未知公司', '上海')], [
    {companyId: 1, postingId: 11, address: '上海·徐汇区·宜山路868号'},
    {companyId: 1, postingId: 12, address: '上海黄浦区淮海中路381号'},
    {companyId: 1, postingId: 13, address: '上海'},
  ], []);
  expect(rows.filter(row => row.company.id === 1)).toHaveLength(3);
  expect(rows.find(row => row.precision === 'MANUAL')?.sources).toEqual(['工作地点', '公司资料', 'JD']);
  expect(rows.find(row => row.company.id === 2)?.precision).toBe('OUTSIDE');
  expect(rows.find(row => row.company.id === 3)?.precision).toBe('PENDING');
  expect(rows.find(row => row.company.id === 3)?.longitude).toBeUndefined();
});

test('上海地图完整读取超过100家公司，多地点可编辑保存，外部定位失败仍能看区域分布（模拟）', async ({page}) => {
  await page.setViewportSize({width: 1560, height: 1100});
  let first = {...company(1, '多办公点地图测试公司', '上海徐汇区宜山路868号'), workLocations: [
    {label: '徐汇办公点', address: '上海徐汇区宜山路868号', longitude: 121.43, latitude: 31.18},
    {label: '浦东办公点', address: '上海浦东新区张江', longitude: 121.60, latitude: 31.20},
  ]};
  const others = [company(2, '只在深圳的公司', '深圳市南山区'),
    ...Array.from({length: 100}, (_, index) => company(index + 3, `待补充公司${index + 3}`))];
  const loadedPages: number[] = [];
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (url.pathname.endsWith('/companies/1') && method === 'PUT') {
      first = {...first, ...request.postDataJSON()};
      return route.fulfill({json: {code: 200, result: first}});
    }
    if (url.pathname.endsWith('/companies/location-positions') && method === 'POST') {
      return route.fulfill({status: 502, json: {code: 40002, msg: '地址匹配暂不可用，可继续查看区域分布，稍后重试'}});
    }
    if (method !== 'GET') return route.abort();
    if (url.pathname.endsWith('/companies')) {
      const number = Number(url.searchParams.get('number') || 1);
      loadedPages.push(number);
      return route.fulfill({json: {code: 200, result: [first, ...others].slice((number - 1) * 100, number * 100),
        page: {totalElements: 102, totalPages: 2, number: number - 1, size: 100}}});
    }
    if (url.pathname.endsWith('/postings/work-locations')) return route.fulfill({json: {code: 200, result: [
      {companyId: 1, postingId: 11, address: '上海徐汇区宜山路868号'},
      {companyId: 1, postingId: 12, address: '上海黄浦区淮海中路381号'},
    ]}});
    return route.fulfill({json: {code: 200, result: [], page: {totalElements: 0}}});
  });
  await page.goto('./companies');
  await expect(page.locator('.el-table__row')).toHaveCount(102);
  expect(loadedPages).toContain(2);
  await page.getByText('上海地图', {exact: true}).click();
  const map = page.locator('[data-testid="company-shanghai-map"]');
  await expect.poll(() => map.locator('canvas').count()).toBeGreaterThan(0);
  await expect(map.locator('.location-card[data-company-id="1"]')).toHaveCount(3);
  await expect(map.locator('.location-card[data-company-id="2"]')).toHaveCount(0);
  await expect(map).toContainText('已隐藏 1 个上海市外地点');
  await map.getByRole('button', {name: '匹配地图坐标', exact: true}).click();
  await expect(map.locator('.el-alert')).toContainText('地址匹配暂不可用');
  await map.locator('input[aria-label="地图搜索"]').fill('多办公点地图测试公司');
  await expect(map.locator('.location-card')).toHaveCount(3);
  await page.screenshot({path: 'test-results/company-shanghai-map-desktop.png'});
  await map.getByRole('button', {name: '编辑工作地点', exact: true}).first().click();
  const dialog = page.getByRole('dialog', {name: '编辑公司', exact: true});
  await expect(dialog.locator('.work-location-row')).toHaveCount(3);
  await dialog.getByRole('button', {name: '添加工作地点', exact: true}).click();
  await dialog.locator('input[aria-label="地点4名称"]').fill('新增办公点');
  await dialog.locator('input[aria-label="地点4地址"]').fill('上海市闵行区顾戴路2337号');
  await dialog.getByRole('button', {name: '保存', exact: true}).click();
  await expect(dialog).toBeHidden();
  expect(first.workLocations).toHaveLength(4);
  await expect(map.locator('.location-card[data-company-id="1"]')).toHaveCount(4);
  await page.setViewportSize({width: 768, height: 1100});
  await page.screenshot({path: 'test-results/company-shanghai-map-768.png'});
});

test('地图加载失败提供重试，空数据提供空态（模拟）', async ({page}) => {
  await page.setViewportSize({width: 1560, height: 1100});
  let fail = true;
  await page.route('**/api/**', async route => {
    if (route.request().method() !== 'GET') return route.abort();
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/postings/work-locations') && fail) {
      return route.fulfill({status: 500, json: {code: 50001, msg: '地图地点加载失败'}});
    }
    return route.fulfill({json: {code: 200, result: [], page: {totalPages: 1, totalElements: 0}}});
  });
  await page.goto('./companies');
  await expect(page.getByText('还没有公司，先录入目标公司', {exact: true})).toBeVisible();
  await page.getByText('上海地图', {exact: true}).click();
  await expect(page.locator('.el-alert')).toContainText('地图地点加载失败');
  fail = false;
  await page.getByRole('button', {name: '重新加载', exact: true}).click();
  await expect(page.locator('.location-sidebar')).toContainText('没有符合条件的上海工作地点');
});
