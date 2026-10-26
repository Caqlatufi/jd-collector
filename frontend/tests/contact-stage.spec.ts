import {expect, test} from './native/harness.mjs';
import type {Locator, Page} from './native/harness.mjs';

const basePosting = {id: 801, companyId: 901, companyName: '沟通进度测试公司', title: '投递前岗位',
  direction: 'JAVA_BACKEND', source: 'OTHER', rawJd: 'Java后端测试JD', stage: 'SCREENED', tier: 'A',
  totalScore: 80, blockingRisk: false, matchScore: 30, companyScore: 15, freshnessScore: 10,
  commuteScore: 10, salaryScore: 15};

const paint = async (page: Page) => page.evaluate(() =>
  new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

const choose = async (page: Page, row: Locator, label: string) => {
  await paint(page);
  await row.locator('.el-select').click();
  await paint(page);
  await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))));
  await page.getByRole('option', {name: label, exact: true}).click();
};

const mockBasics = async (page: Page) => {
  await page.setViewportSize({width: 1665, height: 1000});
  await page.route('**/api/companies?*', route => route.fulfill({json: {code: 200, result: [{id: 901, name: basePosting.companyName, active: true}]}}));
  await page.route('**/api/resume-versions?*', route => route.fulfill({json: {code: 200, result: []}}));
};

test('投递前阶段逐行保存并保留刷新结果，已投递及其关闭历史只读，列表移除下一步', async ({page}) => {
  await mockBasics(page);
  let stage = 'SCREENED';
  const applied = {...basePosting, id: 802, title: '已投递岗位', stage: 'APPLIED', appliedAt: '2026-10-08T09:00:00', resumeVersionId: 701};
  const closed = {...applied, id: 803, title: '投递后关闭岗位', stage: 'CLOSED'};
  const postings = () => [{...basePosting, stage}, applied, closed];
  await page.route('**/api/postings?*', route => route.fulfill({json: {code: 200, result: postings(), page: {totalElements: 3}}}));
  let complete: (() => Promise<void>) | undefined;
  let submitted: Record<string, unknown> = {};
  let calls = 0;
  await page.route('**/api/postings/801/contact-stage', async route => {
    submitted = route.request().postDataJSON();
    calls++;
    expect(submitted.expectedStage).toBe(stage);
    expect(submitted.resumeVersionId).toBeUndefined();
    expect(submitted.appliedAt).toBeUndefined();
    const reply = async () => {
      stage = submitted.toStage as string;
      await route.fulfill({json: {code: 200, result: {...basePosting, stage}}});
    };
    if (calls === 1) complete = reply;
    else await reply();
  });
  await page.goto('./postings');
  const row = page.locator('.el-table__row').filter({hasText: basePosting.title});
  const appliedRow = page.locator('.el-table__row').filter({hasText: applied.title});
  const closedRow = page.locator('.el-table__row').filter({hasText: closed.title});
  await expect(page.locator('.el-table__header-wrapper').getByText('下一步', {exact: true})).toHaveCount(0);
  await expect(appliedRow.locator('.el-select')).toHaveCount(0);
  await expect(appliedRow.getByText('已投递', {exact: true})).toBeVisible();
  await expect(closedRow.locator('.el-select')).toHaveCount(0);
  await choose(page, row, '已发消息未回复');
  await expect.poll(() => submitted.toStage).toBe('MESSAGE_SENT');
  await expect(row.locator('.el-select input')).not.toBeEnabled();
  await expect(row.getByRole('button', {name: '投递', exact: true})).not.toBeEnabled();
  await complete!();
  await expect(row).toContainText('已发消息未回复');
  await expect(row.getByRole('button', {name: '投递', exact: true})).toBeEnabled();
  await page.reload();
  await expect(row).toContainText('已发消息未回复');
  await choose(page, row, '等待进一步沟通');
  await expect(row).toContainText('等待进一步沟通');
  await choose(page, row, '已沟通不合适');
  await expect(row).toContainText('已沟通不合适');
  await paint(page);
  await page.screenshot({path: 'test-results/contact-stage.png'});
  await page.getByRole('menuitem', {name: '投递 Pipeline'}).click();
  await expect(page.locator('.el-table__row').filter({hasText: basePosting.title})).toHaveCount(0);
  await expect(page.locator('.el-table__row').filter({hasText: applied.title})).toHaveCount(1);
  expect(calls).toBe(3);
});

test('沟通保存失败恢复已保存进度，其他页面完成投递后本行自动变为只读', async ({page}) => {
  await mockBasics(page);
  let current = {...basePosting, stage: 'MESSAGE_SENT', appliedAt: undefined as string | undefined};
  await page.route('**/api/postings?*', route => route.fulfill({json: {code: 200, result: [current], page: {totalElements: 1}}}));
  await page.route('**/api/postings/801', route => route.fulfill({json: {code: 200, result: current}}));
  let calls = 0;
  await page.route('**/api/postings/801/contact-stage', async route => {
    calls++;
    if (calls === 1) await route.fulfill({status: 500, json: {code: 50001, msg: '模拟保存失败'}});
    else {
      current = {...current, stage: 'APPLIED', appliedAt: '2026-10-08T09:00:00'};
      await route.fulfill({status: 409, json: {code: 40901, msg: '该岗位已投递，沟通阶段只读'}});
    }
  });
  await page.goto('./postings');
  const row = page.locator('.el-table__row');
  await choose(page, row, '等待进一步沟通');
  await expect(page.getByText('模拟保存失败', {exact: true})).toBeVisible();
  await expect(row).toContainText('已发消息未回复');
  await expect(row.locator('.el-select input')).toBeEnabled();
  await choose(page, row, '已沟通不合适');
  await expect(row.locator('.el-select')).toHaveCount(0);
  await expect(row.getByText('已投递', {exact: true})).toBeVisible();
  await expect(row.getByRole('button', {name: '投递', exact: true})).toHaveCount(0);
});

test('沟通阶段可筛选，改变筛选中的阶段后该行移出当前结果', async ({page}) => {
  await mockBasics(page);
  let stage = 'MESSAGE_SENT';
  await page.route('**/api/postings?*', route => {
    const filter = new URL(route.request().url()).searchParams.get('stage');
    const result = !filter || filter === stage ? [{...basePosting, stage}] : [];
    return route.fulfill({json: {code: 200, result, page: {totalElements: result.length}}});
  });
  await page.route('**/api/postings/801/contact-stage', route => {
    const data = route.request().postDataJSON();
    expect(data.expectedStage).toBe('MESSAGE_SENT');
    stage = data.toStage;
    return route.fulfill({json: {code: 200, result: {...basePosting, stage}}});
  });
  await page.goto('./postings?stage=MESSAGE_SENT');
  const row = page.locator('.el-table__row');
  await expect(row).toContainText('已发消息未回复');
  await choose(page, row, '等待进一步沟通');
  await expect(row).toHaveCount(0);
  await expect(page.getByText('共 0 条岗位', {exact: true})).toBeVisible();
});
