import {expect, test, type Locator, type Page} from './native/harness.mjs';

const formItem = (scope: Locator, label: string): Locator =>
  scope.locator('.el-form-item').filter({hasText: label}).first();

const choose = async (page: Page, scope: Locator, label: string, option: string) => {
  await formItem(scope, label).locator('.el-select').click();
  await page.getByRole('option', {name: option, exact: true}).click();
};

test('JD确认投递后才进入Pipeline，下一步可暂时留空（模拟响应只读）', async ({page}) => {
  let applied = false;
  let submitted: Record<string, unknown> = {};
  const basePosting = {
    id: 801, companyId: 901, companyName: '流程边界测试公司', title: 'Java后端工程师（投递入口）',
    direction: 'JAVA_BACKEND', source: 'BOSS', rawJd: 'Java Spring Boot', location: '上海闵行',
    blockingRisk: false, matchScore: 30, companyScore: 15, freshnessScore: 10, commuteScore: 12,
    salaryScore: 10, totalScore: 77, tier: 'A', recommendation: 'DIRECT_APPLY',
    createdAt: '2026-09-06T10:00:00', updatedAt: '2026-09-06T10:00:00',
  };
  const skippedPosting = {...basePosting, id: 802, title: '跳过岗位', tier: 'SKIP', totalScore: 40};
  const pageResult = () => ({
    code: 200, msg: 'ok',
    result: [
      {...basePosting, stage: applied ? 'APPLIED' : 'SCREENED', resumeVersionId: applied ? 701 : undefined,
        resumeVersionName: applied ? 'Java后端版' : undefined, appliedAt: applied ? '2026-09-06T22:00:00' : undefined},
      {...skippedPosting, stage: 'SCREENED'},
    ],
    page: {number: 1, size: 100, totalElements: 2, totalPages: 1},
  });

  await page.route('**/api/companies?*', route => route.fulfill({json: {code: 200, msg: 'ok', result: [], page: {number: 1, size: 100, totalElements: 0, totalPages: 0}}}));
  await page.route('**/api/resume-versions?*', route => route.fulfill({json: {code: 200, msg: 'ok', result: [{
    id: 701, name: 'Java后端版', type: 'JAVA_BACKEND', versionLabel: '2026.09-v1', templateKey: 'CLASSIC_BLUE', active: true, blockCount: 4, contentReady: true,
    createdAt: '2026-09-06T10:00:00', updatedAt: '2026-09-06T10:00:00',
  }]}}));
  await page.route('**/api/postings?*', route => route.fulfill({json: pageResult()}));
  await page.route('**/api/postings/801/stage', async route => {
    submitted = route.request().postDataJSON();
    applied = true;
    await route.fulfill({json: {code: 200, msg: 'ok', result: pageResult().result[0]}});
  });

  await page.goto('./postings');
  const row = page.locator('.el-table__row').filter({hasText: basePosting.title});
  await expect(row.getByRole('button', {name: '投递', exact: true})).toBeVisible();
  await expect(page.locator('.el-table__row').filter({hasText: skippedPosting.title}).getByRole('button', {name: '投递', exact: true})).toHaveCount(0);
  await row.getByRole('button', {name: '投递', exact: true}).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('确认后该岗位才会进入 Pipeline');
  await choose(page, dialog, '实际使用简历', 'Java后端版 · 2026.09-v1');
  await dialog.getByRole('button', {name: '确认已投递'}).click();

  await expect.poll(() => submitted.toStage).toBe('APPLIED');
  expect(submitted.resumeVersionId).toBe(701);
  expect(submitted.nextAction).toBeUndefined();
  expect(submitted.nextActionAt).toBeUndefined();
  await expect(row.getByText('已在 Pipeline', {exact: true})).toBeVisible();

  await page.getByRole('menuitem', {name: '投递 Pipeline'}).click();
  await expect(page.getByText(basePosting.title, {exact: true})).toBeVisible();
  await expect(page.getByText(skippedPosting.title, {exact: true})).toHaveCount(0);
  await expect(page.getByText('暂无待办', {exact: true})).toBeVisible();
  await expect(page.getByRole('button', {name: '已收集'})).toHaveCount(0);
  await expect(page.getByRole('button', {name: '已筛选'})).toHaveCount(0);
});
