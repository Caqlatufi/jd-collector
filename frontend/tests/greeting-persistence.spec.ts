import {expect, test} from './native/harness.mjs';

const posting = {id: 891, companyName: '持久化测试公司', title: 'Java工程师', direction: 'JAVA_BACKEND',
  stage: 'SCREENED', source: 'BOSS', tier: 'A'};
const resumes = [711, 712, 713].map(id => ({id, name: `简历${id}`, versionLabel: 'v1',
  active: true, archived: false, contentReady: true}));
const saved = (resumeVersionId: number, greeting = '已保存的真实项目经历与岗位匹配用语。'.repeat(10)) => ({
  postingId: 891, resumeVersionId, resumeName: `简历${resumeVersionId}`, versionLabel: 'v1', greeting,
  characterCount: greeting.length, model: 'gpt-6.1-sol', reasoningEffort: 'medium',
  evidence: [{jdQuote: '后端开发', resumeQuote: '模块开发与上线'}],
});

test('打开恢复最近用语，按简历读取，刷新后仍恢复，重新生成失败保留原文（模拟接口）', async ({page}) => {
  let latest = saved(711);
  let posts = 0;
  let fail = false;
  const versions = new Map([[711, latest], [712, saved(712, '另一个简历的已保存内容。'.repeat(12))]]);
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith('/postings/891/greeting')) {
      if (request.method() === 'GET') {
        const selected = url.searchParams.get('resumeVersionId');
        return route.fulfill({json: {code: 200, result: selected ? versions.get(Number(selected)) ?? null : latest}});
      }
      if (request.method() === 'POST') {
        posts++;
        if (fail) return route.fulfill({status: 502, json: {code: 40002, msg: '模拟重新生成失败'}});
        latest = saved(request.postDataJSON().resumeVersionId, '重新生成并保存的内容。'.repeat(14));
        versions.set(latest.resumeVersionId, latest);
        return route.fulfill({json: {code: 200, result: latest}});
      }
    }
    if (request.method() !== 'GET') return route.abort();
    return route.fulfill({json: {code: 200, result: url.pathname.endsWith('/postings') ? [posting]
      : url.pathname.endsWith('/resume-versions') ? resumes : [], page: {totalElements: 1}}});
  });
  await page.goto('./postings');
  await page.getByRole('button', {name: '打招呼', exact: true}).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('textarea')).toHaveValue(latest.greeting);
  expect(posts).toBe(0);
  await expect(dialog.getByRole('button', {name: '重新生成', exact: true})).toBeEnabled();
  await dialog.locator('.el-select').click();
  await page.getByRole('option', {name: '简历712 · v1', exact: true}).click();
  await expect(dialog.locator('textarea')).toHaveValue(versions.get(712)!.greeting);
  await dialog.locator('.el-select').click();
  await page.getByRole('option', {name: '简历713 · v1', exact: true}).click();
  await expect(dialog.locator('textarea')).toHaveCount(0);
  await dialog.locator('.el-select').click();
  await page.getByRole('option', {name: '简历711 · v1', exact: true}).click();
  await expect(dialog.locator('textarea')).toHaveValue(latest.greeting);
  await dialog.getByRole('button', {name: '重新生成', exact: true}).click();
  await expect(dialog.locator('textarea')).toHaveValue('重新生成并保存的内容。'.repeat(14));
  await dialog.getByRole('button', {name: '关闭', exact: true}).click();
  await page.reload();
  await page.getByRole('button', {name: '打招呼', exact: true}).click();
  await expect(dialog.locator('textarea')).toHaveValue(latest.greeting);
  fail = true;
  const edited = latest.greeting + '临时编辑';
  await dialog.locator('textarea').fill(edited);
  await dialog.getByRole('button', {name: '重新生成', exact: true}).click();
  await expect(dialog.getByRole('alert')).toContainText('模拟重新生成失败');
  await expect(dialog.locator('textarea')).toHaveValue(edited);
  await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))));
  await page.screenshot({path: 'test-results/greeting-persistence.png'});
  expect(posts).toBe(2);
});

test('读取失败可重试，已归档简历的历史结果可查看但不能重新生成（模拟接口）', async ({page}) => {
  let reads = 0;
  let finish: (() => Promise<void>) | undefined;
  const history = saved(799);
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== 'GET') return route.abort();
    if (url.pathname.endsWith('/postings/891/greeting')) {
      if (++reads === 1) return route.fulfill({status: 500, json: {code: 50001, msg: '模拟历史读取失败'}});
      finish = () => route.fulfill({json: {code: 200, result: history}});
      return;
    }
    return route.fulfill({json: {code: 200, result: url.pathname.endsWith('/postings') ? [posting]
      : url.pathname.endsWith('/resume-versions') ? resumes : [], page: {totalElements: 1}}});
  });
  await page.goto('./postings');
  await page.getByRole('button', {name: '打招呼', exact: true}).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toContainText('模拟历史读取失败');
  await dialog.getByRole('button', {name: '重试读取已保存用语', exact: true}).click();
  await expect.poll(() => reads).toBe(2);
  await expect(dialog.getByRole('status')).toContainText('正在读取');
  await expect(dialog.getByRole('button', {name: '关闭', exact: true})).not.toBeEnabled();
  await finish!();
  await expect(dialog.locator('textarea')).toHaveValue(history.greeting);
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog.getByRole('button', {name: '重新生成', exact: true})).not.toBeEnabled();
  await expect(dialog.getByRole('button', {name: '复制用语', exact: true})).toBeEnabled();
  await page.setViewportSize({width: 800, height: 1000});
  await page.screenshot({path: 'test-results/greeting-persistence-portrait.png'});
});
