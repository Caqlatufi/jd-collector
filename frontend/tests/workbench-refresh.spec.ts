import {test, expect} from './native/harness.mjs';

test('工作台刷新保留路由，服务失败保留文档，竖屏入口可用（只读与模拟失败）', async ({page}) => {
  await page.route('**/api/**', route => route.request().method() === 'GET' ? route.continue() : route.abort());
  await page.goto('./postings');
  const refresh = page.getByRole('button', {name: '刷新工作台', exact: true});
  await expect(refresh).toBeVisible();
  for (const width of [720, 768, 1000]) {
    await page.setViewportSize({width, height: 1440});
    await expect(refresh).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await page.evaluate(() => { (window as any).refreshMarker = 'original'; });
  await refresh.click();
  await page.getByRole('button', {name: '取消', exact: true}).click();
  expect(await page.evaluate(() => (window as any).refreshMarker)).toBe('original');

  await page.route('**/api/system/health', route => route.fulfill({status: 503, json: {code: 50001, msg: '测试服务不可用'}}));
  await refresh.click();
  await page.getByRole('button', {name: '确认刷新', exact: true}).click();
  await expect(page.getByText('本地服务暂不可用，已保留当前页面，请稍后重试。')).toBeVisible();
  await expect(refresh).toBeEnabled();
  expect(await page.evaluate(() => (window as any).refreshMarker)).toBe('original');

  await page.unroute('**/api/system/health');
  const url = page.url();
  await refresh.click();
  await Promise.all([
    page.waitForEvent('domcontentloaded'),
    page.getByRole('button', {name: '确认刷新', exact: true}).click(),
  ]);
  await expect(page.getByRole('heading', {name: 'JD 列表', exact: true})).toBeVisible();
  expect(page.url()).toBe(url);
  expect(await page.evaluate(() => (window as any).refreshMarker)).toBeUndefined();
});
