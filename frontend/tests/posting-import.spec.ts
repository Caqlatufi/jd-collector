import {expect, test} from './native/harness.mjs';

test('新增只填链接，任务持久化、明确失败、继续收录和关闭后完成（模拟响应）', async ({page}) => {
  await page.setViewportSize({width: 1050, height: 1100});
  const sourceUrl = 'https://nio.jobs.feishu.cn/index/position/7697199510845622566/detail';
  const queued = {taskId: '00000000-0000-0000-0000-000000000001', sourceUrl, tabKey: 'jd-import:fixture',
    status: 'QUEUED', createdAt: '2026-10-13T10:00:00Z', attempt: 0};
  let tasks: Record<string, unknown>[] = [];
  let submitted: unknown;
  let writes = 0;
  let retries = 0;
  let reloads = 0;
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith('/posting-imports') && request.method() === 'POST') {
      writes++; submitted = request.postDataJSON(); tasks = [queued];
      return route.fulfill({json: {code: 200, result: queued}});
    }
    if (url.pathname.endsWith('/retry') && request.method() === 'POST') {
      retries++; tasks = [{...queued, attempt: 2}];
      return route.fulfill({json: {code: 200, result: tasks[0]}});
    }
    if (request.method() !== 'GET') return route.abort();
    if (url.pathname.endsWith('/posting-imports')) return route.fulfill({json: {code: 200, result: tasks}});
    if (url.pathname.endsWith('/postings')) reloads++;
    return route.fulfill({json: {code: 200, result: [], page: {totalElements: 0}}});
  });
  await page.goto('./postings');
  const open = page.getByRole('button', {name: '新增 JD', exact: true});
  await expect(open).toBeEnabled(); // No company form prerequisites.
  await open.click();
  const dialog = page.getByRole('dialog', {name: '新增 JD', exact: true});
  const input = dialog.locator('input[aria-label="新增 JD 链接"]');
  await expect(dialog.locator('input')).toHaveCount(1);
  await dialog.getByRole('button', {name: '开始收录', exact: true}).click();
  await expect(dialog.getByText('请填写完整的 HTTPS 岗位详情链接', {exact: true})).toBeVisible();
  await input.fill('javascript:alert(1)');
  await dialog.getByRole('button', {name: '开始收录', exact: true}).click();
  expect(writes).toBe(0);
  await input.fill('  ' + sourceUrl + '  ');
  await dialog.getByRole('button', {name: '开始收录', exact: true}).click();
  await expect.poll(() => writes).toBe(1);
  expect(submitted).toEqual({sourceUrl});
  await expect(dialog.getByText('等待收录', {exact: true})).toBeVisible();
  tasks = [{...queued, status: 'FAILED', attempt: 1, errorCode: 'CODEX_USAGE_LIMIT', message: 'Codex 使用额度已用完，无需重新登录'}];
  await expect(dialog.getByText('CODEX_USAGE_LIMIT', {exact: true})).toBeVisible();
  await expect(dialog.getByText('Codex 使用额度已用完，无需重新登录', {exact: true})).toBeVisible();
  await page.reload();
  await open.click();
  await expect(dialog.getByText('CODEX_USAGE_LIMIT', {exact: true})).toBeVisible();
  await dialog.getByRole('button', {name: '重试', exact: true}).click();
  await expect.poll(() => retries).toBe(1);
  tasks = [{...queued, status: 'WAITING_USER', attempt: 2, errorCode: 'LOGIN_REQUIRED', message: '请在 BOSS 原网页登录后继续'}];
  await expect(dialog.getByRole('button', {name: '继续收录', exact: true})).toBeVisible();
  await dialog.getByRole('button', {name: '继续收录', exact: true}).click();
  await expect.poll(() => retries).toBe(2);
  await dialog.getByRole('button', {name: '关闭', exact: true}).click();
  const before = reloads;
  tasks = [{...queued, status: 'SUCCEEDED', postingId: 9901, title: '自动收录夹具岗位', message: 'JD 已收录并评分，阶段为已筛选'}];
  await expect.poll(() => reloads > before).toBe(true);
  await page.setViewportSize({width: 720, height: 1000});
  await open.click();
  await expect(dialog.getByText('自动收录夹具岗位', {exact: true})).toBeVisible();
  await expect.poll(() => page.evaluate(() => !document.querySelector('.dialog-fade-enter-active'))).toBe(true);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({path: 'test-results/posting-import-720.png'});
  expect(writes).toBe(1);
});
