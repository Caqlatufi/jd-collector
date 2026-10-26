import {readFile} from 'node:fs/promises';
import {expect, test} from './native/harness.mjs';
import {parseRoads} from '../src/company/map/roads';

test('打包的上海路网含真实道路几何、主干路和街道名称', async () => {
  const roads = parseRoads(JSON.parse(await readFile('src/company/assets/shanghai-roads.geojson', 'utf8')));
  expect(roads.length).toBeGreaterThan(5000);
  expect(roads.some(road => road.name === '南京西路')).toBe(true);
  expect(roads.some(road => road.tier === 3)).toBe(true);
  expect(roads.every(road => road.coordinates.every(([x, y]) => x > 120.7 && x < 122.3 && y > 30.6 && y < 32))).toBe(true);
});

test('本地道路离线显示、缩放分级、开关和地点聚焦保持可用', async ({page}) => {
  await page.setViewportSize({width: 1560, height: 1300});
  const external: string[] = [];
  await page.route('**/*', async route => {
    const request = route.request();
    if (!['127.0.0.1', 'localhost'].includes(new URL(request.url()).hostname)) {
      external.push(request.url());
      return route.abort();
    }
    if (request.method() !== 'GET') return route.abort();
    if (request.url().includes('/api/')) {
      const companies = [{id: 1, name: '道路旁的公司', address: '上海静安区南京西路', active: true,
        businessType: 'UNKNOWN', productOwnership: 'UNKNOWN', workLocations: [{address: '上海静安区南京西路', longitude: 121.459, latitude: 31.229}]}];
      return route.fulfill({json: {code: 200, result: new URL(request.url()).pathname.endsWith('/companies') ? companies : [],
        page: {totalElements: 1, totalPages: 1}}});
    }
    return route.continue();
  });
  await page.goto('./companies');
  await page.getByText('上海地图', {exact: true}).click();
  const map = page.locator('[data-testid="company-shanghai-map"]');
  await expect(map.locator('.road-status')).toContainText('本地路网 · 主干路');
  await expect.poll(async () => Number(await map.locator('.road-status').getAttribute('data-road-count'))).toBeGreaterThan(5000);
  await expect.poll(() => map.locator('.road-label').count()).toBeGreaterThan(0);
  await map.locator('.company-name').first().click();
  await expect(map.locator('.road-status')).toContainText('街道路网');
  await expect(map.locator('.location-card')).toHaveCount(1);
  await expect.poll(() => map.locator('.road-label').count()).toBeGreaterThan(0);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({path: 'test-results/company-roads-street.png'});
  await map.getByRole('button', {name: '放大地图', exact: true}).click();
  await map.getByRole('button', {name: '放大地图', exact: true}).click();
  await expect(map.locator('.road-status')).toContainText('街道与支路');
  await map.locator('.map-actions .el-switch').click();
  await expect(map.locator('.road-status')).toContainText('道路已隐藏');
  await expect(map.locator('.road-label')).toHaveCount(0);
  await map.locator('.map-actions .el-switch').click();
  await map.getByRole('button', {name: '全上海', exact: true}).click();
  await expect(map.locator('.road-status')).toContainText('本地路网 · 主干路');
  await page.setViewportSize({width: 768, height: 1100});
  await expect.poll(() => map.locator('.road-label').count()).toBeGreaterThan(0);
  await page.screenshot({path: 'test-results/company-roads-768.png'});
  expect(external).toEqual([]);
});

test('道路文件失败可重试，仍保留公司地点和底图', async ({page}) => {
  let fail = true;
  await page.route('**/*', async route => {
    const request = route.request();
    if (request.method() !== 'GET') return route.abort();
    if (request.url().includes('.geojson') && fail) return route.abort();
    if (request.url().includes('/api/')) return route.fulfill({json: {code: 200, result: [], page: {totalElements: 0}}});
    return route.continue();
  });
  await page.goto('./companies');
  await page.getByText('上海地图', {exact: true}).click();
  await expect(page.locator('.el-alert')).toContainText('本地道路加载失败');
  await expect.poll(() => page.locator('.map-canvas canvas').count()).toBeGreaterThan(0);
  fail = false;
  await page.getByRole('button', {name: '重试道路', exact: true}).click();
  await expect(page.locator('.el-alert')).toHaveCount(0);
  await expect.poll(async () => Number(await page.locator('.road-status').getAttribute('data-road-count'))).toBeGreaterThan(5000);
});
