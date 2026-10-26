import {expect, test} from './native/harness.mjs';

test('打招呼超过500字仍展示并可编辑复制，生成期间锁定操作且换简历清空旧结果', async ({page}) => {
  await page.setViewportSize({width: 1418, height: 686});
  const baseGreeting = '您好，想应聘Java后端岗位。\n\n任职资格：\n1. 模块设计：参与模块拆分，处理业务接口与模块依赖，相关项目的实际职责已在简历中列明。\n\n加分项：\n1. 异步任务：维护异步任务的状态流转和异常重试，处理任务执行与失败恢复。\n\n期待您查看简历并进一步沟通。';
  const greeting = baseGreeting.replace('模块设计：', '模块设计：' + '字'.repeat(
    569 - Array.from(baseGreeting.replace(/[\p{White_Space}\uFEFF]/gu, '')).length));
  const posting = {id: 801, companyId: 901, companyName: '打招呼测试公司', title: 'Java后端工程师',
    direction: 'JAVA_BACKEND', source: 'BOSS', rawJd: '负责异步任务编排', stage: 'SCREENED', tier: 'A',
    totalScore: 80, blockingRisk: false, matchScore: 30, companyScore: 15, freshnessScore: 10, commuteScore: 10, salaryScore: 15};
  const resumes = [{id: 701, name: 'Java定向版'}, {id: 702, name: '全栈版'}].map(item => ({...item,
    type: 'TARGETED', versionLabel: 'test-v1', active: true, archived: false, contentReady: true, blockCount: 2}));
  await page.route('**/api/postings?*', route => route.fulfill({json: {code: 200, result: [posting], page: {totalElements: 1}}}));
  await page.route('**/api/companies?*', route => route.fulfill({json: {code: 200, result: []}}));
  await page.route('**/api/resume-versions?*', route => route.fulfill({json: {code: 200, result: resumes}}));
  let submitted: Record<string, unknown> = {};
  let complete: (() => Promise<void>) | undefined;
  let calls = 0;
  await page.route('**/api/postings/801/greeting*', async route => {
    if (route.request().method() === 'GET') return route.fulfill({json: {code: 200, result: null}});
    submitted = route.request().postDataJSON();
    calls++;
    if (calls === 2) {
      await route.fulfill({status: 502, json: {code: 40002, msg: '模拟模型调用失败'}});
      return;
    }
    complete = async () => { await route.fulfill({json: {code: 200, result: {
      postingId: 801, resumeVersionId: 701, resumeName: 'Java定向版', versionLabel: 'test-v1',
      greeting, characterCount: Array.from(greeting).length, model: 'gpt-6.1-sol', reasoningEffort: 'medium',
      evidence: [{jdQuote: '模块设计', resumeQuote: '参与模块拆分'},
        {jdQuote: '负责异步任务编排', resumeQuote: '维护异步任务的状态流转和异常重试'}],
    }}}); };
  });
  await page.goto('./postings');
  await page.getByRole('button', {name: '打招呼', exact: true}).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('GPT 6.1 Sol · medium');
  await expect(dialog.getByRole('button', {name: '生成打招呼用语'})).not.toBeEnabled();
  await dialog.locator('.el-select').click();
  await page.getByRole('option', {name: 'Java定向版 · test-v1', exact: true}).click();
  await dialog.getByRole('button', {name: '生成打招呼用语'}).click();
  await expect.poll(() => submitted.resumeVersionId).toBe(701);
  await expect(dialog.getByRole('button', {name: '关闭', exact: true})).not.toBeEnabled();
  await expect(dialog.getByRole('button', {name: '复制用语'})).not.toBeEnabled();
  await expect(dialog.locator('.el-select input')).not.toBeEnabled();
  await complete!();
  const textarea = dialog.locator('textarea');
  await expect(textarea).toHaveValue(greeting);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await dialog.getByText('生成时匹配依据', {exact: true}).click();
  await expect(dialog.getByText('维护异步任务的状态流转和异常重试')).toBeVisible();
  await expect(dialog.getByRole('button', {name: '复制用语'})).toBeEnabled();
  expect(await dialog.getByRole('button', {name: '复制用语'}).evaluate(el =>
    el.getBoundingClientRect().bottom <= innerHeight)).toBe(true);
  await expect.poll(() => dialog.locator('.el-collapse-item__wrap').evaluate(el =>
    el.getBoundingClientRect().height > 0 && ['', 'auto'].includes((el as HTMLElement).style.height))).toBe(true);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({path: 'test-results/posting-greeting.png'});
  await textarea.fill(greeting.replace('进一步沟通', '交流岗位需求'));
  const edited = await textarea.evaluate(el => (el as HTMLTextAreaElement).value);
  await dialog.getByRole('button', {name: '复制用语'}).click();
  await expect(page.getByText('已复制打招呼用语', {exact: true})).toBeVisible();
  // Windows clipboard represents line endings as CRLF; every line and blank separator must survive.
  expect((await page.app.evaluate(({clipboard}) => clipboard.readText())).replace(/\r\n/g, '\n')).toBe(edited);
  await dialog.getByRole('button', {name: '重新生成'}).click();
  await expect(dialog.getByRole('alert')).toContainText('模拟模型调用失败');
  await expect(textarea).toHaveValue(edited);
  await textarea.fill('太短');
  await expect(dialog.getByRole('button', {name: '复制用语'})).not.toBeEnabled();
  await expect(dialog).toContainText('2 字（建议 100–500 字');
  await textarea.fill('字'.repeat(100));
  await expect(dialog.getByRole('button', {name: '复制用语'})).toBeEnabled();
  await textarea.fill('字'.repeat(200));
  await expect(dialog.getByRole('button', {name: '复制用语'})).toBeEnabled();
  await textarea.fill('字'.repeat(201));
  await expect(dialog.getByRole('button', {name: '复制用语'})).toBeEnabled();
  await textarea.fill('字'.repeat(250) + '\n\n　' + '字'.repeat(250));
  await expect(dialog.getByRole('button', {name: '复制用语'})).toBeEnabled();
  await textarea.fill('字'.repeat(569));
  await expect(dialog.getByRole('button', {name: '复制用语'})).toBeEnabled();
  await expect(dialog).toContainText('569 字（建议 100–500 字');
  await dialog.getByRole('button', {name: '复制用语'}).click();
  await expect.poll(() => page.app.evaluate(({clipboard}) => clipboard.readText())).toBe('字'.repeat(569));
  await dialog.locator('.el-select').click();
  await page.getByRole('option', {name: '全栈版 · test-v1', exact: true}).click();
  await expect(dialog.locator('textarea')).toHaveCount(0);
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog.getByRole('button', {name: '复制用语'})).not.toBeEnabled();
  await dialog.getByRole('button', {name: '关闭', exact: true}).click();
  await expect(page.locator('.el-table__row')).toContainText('已筛选');
  expect(calls).toBe(2);
});

test('首次生成失败在弹窗保留原因，重试显示等待状态并在成功后清除错误', async ({page}) => {
  await page.setViewportSize({width: 1418, height: 686});
  const posting = {id: 802, companyName: '失败提示测试公司', title: '后端工程师', direction: 'JAVA_BACKEND',
    stage: 'SCREENED', tier: 'B', source: 'BOSS'};
  const resume = {id: 703, name: '测试定向版', versionLabel: 'test-v1', type: 'TARGETED', active: true,
    archived: false, contentReady: true, blockCount: 1};
  await page.route('**/api/postings?*', route => route.fulfill({json: {code: 200, result: [posting], page: {totalElements: 1}}}));
  await page.route('**/api/companies?*', route => route.fulfill({json: {code: 200, result: []}}));
  await page.route('**/api/resume-versions?*', route => route.fulfill({json: {code: 200, result: [resume]}}));
  let calls = 0;
  let fail: (() => Promise<void>) | undefined;
  let succeed: (() => Promise<void>) | undefined;
  const failure = 'GPT 6.1 Sol 当前容量不足（CODEX_MODEL_CAPACITY），请稍后重试，无需重新登录；HTTP 503';
  const greeting = '您好，想应聘后端工程师岗位。\n\n任职资格：\n1. 模块开发：参与业务模块拆分，处理接口及任务依赖，并完成对应功能的开发、测试和上线验证，维护任务状态流转与异常重试，跟进线上问题定位和修复。\n\n欢迎查看我的简历，期待进一步沟通项目经历。';
  await page.route('**/api/postings/802/greeting*', async route => {
    if (route.request().method() === 'GET') return route.fulfill({json: {code: 200, result: null}});
    expect(route.request().postDataJSON()).toEqual({resumeVersionId: 703});
    calls++;
    if (calls === 1) fail = async () => { await route.fulfill({status: 502, json: {code: 40002, msg: failure}}); };
    else succeed = async () => { await route.fulfill({json: {code: 200, result: {
      postingId: 802, resumeVersionId: 703, resumeName: resume.name, versionLabel: resume.versionLabel,
      greeting, characterCount: Array.from(greeting).length, model: 'gpt-6.1-sol', reasoningEffort: 'medium', evidence: [],
    }}}); };
  });
  await page.goto('./postings');
  await page.getByRole('button', {name: '打招呼', exact: true}).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('.el-select').click();
  await page.getByRole('option', {name: '测试定向版 · test-v1', exact: true}).click();
  await dialog.getByRole('button', {name: '生成打招呼用语'}).click();
  await expect.poll(() => calls).toBe(1);
  await expect(dialog.getByRole('status')).toContainText('正在对照 JD');
  await expect(dialog.getByRole('button', {name: '关闭', exact: true})).not.toBeEnabled();
  await fail!();
  await expect(dialog.getByRole('alert')).toContainText(failure);
  await expect(dialog.getByRole('button', {name: '重试生成'})).toBeEnabled();
  await expect(dialog.getByRole('button', {name: '复制用语'})).not.toBeEnabled();
  await expect(dialog.getByRole('status')).toHaveCount(0);
  await dialog.locator('.el-select').click();
  await page.keyboard.press('Escape');
  await expect(dialog.getByRole('alert')).toContainText(failure);
  await page.screenshot({path: 'test-results/posting-greeting-failure.png'});
  await dialog.getByRole('button', {name: '重试生成'}).click();
  await expect.poll(() => calls).toBe(2);
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog.getByRole('status')).toContainText('正在对照 JD');
  await succeed!();
  await expect(dialog.locator('textarea')).toHaveValue(greeting);
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog.getByRole('button', {name: '重新生成'})).toBeEnabled();
});
