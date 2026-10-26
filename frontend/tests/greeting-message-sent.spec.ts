import {expect, test} from './native/harness.mjs';

const posting = {id: 801, companyId: 901, companyName: '消息进度测试公司', title: 'Java后端工程师',
  direction: 'JAVA_BACKEND', source: 'BOSS', rawJd: '负责异步任务编排', stage: 'SCREENED', tier: 'A',
  totalScore: 80, blockingRisk: false, matchScore: 30, companyScore: 15, freshnessScore: 10, commuteScore: 10, salaryScore: 15};

test('已发送消息无需生成或选择简历，保存期间防重复，成功关闭弹窗并同步列表（模拟接口）', async ({page}) => {
  let current = {...posting};
  let writes = 0;
  let finish: (() => Promise<void>) | undefined;
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'PUT' && path.endsWith('/postings/801/contact-stage')) {
      expect(request.postDataJSON()).toEqual({toStage: 'MESSAGE_SENT', expectedStage: 'SCREENED'});
      writes++;
      finish = async () => {
        current = {...current, stage: 'MESSAGE_SENT'};
        await route.fulfill({json: {code: 200, result: current}});
      };
      return;
    }
    if (request.method() !== 'GET') return route.abort();
    if (path.endsWith('/greeting')) return route.fulfill({json: {code: 200, result: null}});
    return route.fulfill({json: {code: 200, result: path.endsWith('/postings') ? [current] : [], page: {totalElements: 1}}});
  });
  await page.app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].setBounds({x: 0, y: 0, width: 1434, height: 965}));
  await page.goto('./postings');
  await expect(page.locator('.el-table__row')).toContainText(posting.title);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.getByRole('button', {name: '打招呼', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: '打招呼', exact: true});
  const sent = dialog.getByRole('button', {name: '已发送消息', exact: true});
  await expect(sent).toBeEnabled();
  await expect(dialog.getByRole('button', {name: '生成打招呼用语', exact: true})).not.toBeEnabled();
  await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))));
  await page.screenshot({path: 'test-results/greeting-message-sent.png'});
  await sent.click();
  await expect.poll(() => writes).toBe(1);
  await expect(sent).not.toBeEnabled();
  await expect(dialog.getByRole('button', {name: '关闭', exact: true})).not.toBeEnabled();
  // A duplicate DOM click in this local fixture must not issue another write while pending.
  await sent.evaluate(el => (el as HTMLButtonElement).click());
  expect(writes).toBe(1);
  await finish!();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.el-table__row')).toContainText('已发消息未回复');
  await page.getByRole('button', {name: '打招呼', exact: true}).click();
  await expect(sent).not.toBeEnabled();
  await dialog.getByRole('button', {name: '关闭', exact: true}).click();
  await page.reload();
  await expect(page.locator('.el-table__row')).toContainText('已发消息未回复');
  expect(writes).toBe(1);
});

test('消息进度保存失败保留弹窗和原阶段，重试成功后遵守阶段筛选（模拟接口）', async ({page}) => {
  let current = {...posting};
  let writes = 0;
  const greeting = '真实经历支持的打招呼正文。'.repeat(12);
  const resume = {id: 701, name: '测试定向版', versionLabel: 'test-v1', active: true, contentReady: true};
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'POST' && url.pathname.endsWith('/postings/801/greeting')) {
      return route.fulfill({json: {code: 200, result: {postingId: 801, resumeVersionId: 701,
        resumeName: resume.name, versionLabel: resume.versionLabel, greeting, evidence: []}}});
    }
    if (request.method() === 'PUT' && url.pathname.endsWith('/postings/801/contact-stage')) {
      expect(request.postDataJSON()).toEqual({toStage: 'MESSAGE_SENT', expectedStage: 'SCREENED'});
      if (++writes === 1) return route.fulfill({status: 500, json: {code: 50001, msg: '模拟保存失败'}});
      current = {...current, stage: 'MESSAGE_SENT'};
      return route.fulfill({json: {code: 200, result: current}});
    }
    if (request.method() !== 'GET') return route.abort();
    if (url.pathname.endsWith('/greeting')) return route.fulfill({json: {code: 200, result: null}});
    const result = url.pathname.endsWith('/resume-versions') ? [resume] : url.pathname.endsWith('/postings/801') ? current
      : url.pathname.endsWith('/postings') && (!url.searchParams.get('stage') || url.searchParams.get('stage') === current.stage) ? [current] : [];
    return route.fulfill({json: {code: 200, result, page: {totalElements: Array.isArray(result) ? result.length : 0}}});
  });
  await page.app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].setBounds({x: 0, y: 0, width: 1434, height: 965}));
  await page.goto('./postings?stage=SCREENED');
  await expect(page.locator('.el-table__row')).toContainText(posting.title);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.getByRole('button', {name: '打招呼', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: '打招呼', exact: true});
  const sent = dialog.getByRole('button', {name: '已发送消息', exact: true});
  await expect(sent).toBeEnabled();
  await dialog.locator('.el-select').click();
  await page.getByRole('option', {name: '测试定向版 · test-v1', exact: true}).click();
  await dialog.getByRole('button', {name: '生成打招呼用语', exact: true}).click();
  await expect(dialog.locator('textarea')).toHaveValue(greeting);
  await sent.click();
  await expect(page.getByText('模拟保存失败', {exact: true})).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('textarea')).toHaveValue(greeting);
  await expect(page.locator('.el-table__row')).toContainText('已筛选');
  await expect(sent).toBeEnabled();
  await sent.click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.el-table__row')).toHaveCount(0);
  expect(writes).toBe(2);
});

test('岗位已被其他操作投递时拒绝覆盖，回读最新阶段并禁用标记按钮（模拟并发）', async ({page}) => {
  let current: Record<string, unknown> = {...posting};
  let writes = 0;
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'PUT' && path.endsWith('/postings/801/contact-stage')) {
      writes++;
      current = {...current, stage: 'APPLIED', appliedAt: '2026-10-17T12:00:00', resumeVersionId: 701};
      return route.fulfill({status: 409, json: {code: 40901, msg: '岗位阶段已更新，请刷新后重试'}});
    }
    if (request.method() !== 'GET') return route.abort();
    if (path.endsWith('/greeting')) return route.fulfill({json: {code: 200, result: null}});
    return route.fulfill({json: {code: 200, result: path.endsWith('/postings/801') ? current
      : path.endsWith('/postings') ? [current] : [], page: {totalElements: 1}}});
  });
  await page.app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].setBounds({x: 0, y: 0, width: 1434, height: 965}));
  await page.goto('./postings');
  await expect(page.locator('.el-table__row')).toContainText(posting.title);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.getByRole('button', {name: '打招呼', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: '打招呼', exact: true});
  const sent = dialog.getByRole('button', {name: '已发送消息', exact: true});
  await expect(sent).toBeEnabled();
  await sent.click();
  await expect(dialog).toBeVisible();
  await expect(sent).not.toBeEnabled();
  await expect(page.locator('.el-table__row')).toContainText('已投递');
  expect(writes).toBe(1);
});
