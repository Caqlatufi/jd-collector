import {expect, test} from './native/harness.mjs';

test('普通浏览器账号页提示使用桌面客户端，不再请求旧登录接口（只读）', async ({page}) => {
  let legacyRequests = 0;
  await page.route('**/api/**', route => {
    if (new URL(route.request().url()).pathname.includes('/accounts')) legacyRequests++;
    return route.request().method() === 'GET' ? route.continue() : route.abort();
  });
  await page.goto('./accounts');
  await expect(page.getByText('请从桌面快捷方式打开 JD Collector，再进入招聘平台登录。', {exact: false})).toBeVisible();
  await expect(page.getByRole('button', {name: /配置账号|尝试登录|获取会话|清除凭证|读取岗位|检查登录|刷新标签/})).toHaveCount(0);
  expect(legacyRequests).toBe(0);
  await page.setViewportSize({width: 720, height: 1280});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
