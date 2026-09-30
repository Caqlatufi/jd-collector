import {expect, test} from './native/harness.mjs';

test('归档隐藏卡片，投递记录仍可打开原简历', async ({page}) => {
  let archived = false;
  const resume = {id: 9701, name: '归档验收简历', type: 'FULL_STACK', versionLabel: 'v1',
    active: true, contentReady: true, blockCount: 2, templateKey: 'CLASSIC_BLUE',
    contentMarkdown: '# 测试候选人\n\n## 工作经历\n\n归档后保留的正文'};
  await page.route('**/api/resume-versions*', route => {
    if (route.request().method() !== 'GET') return route.abort();
    return route.fulfill({json: {code: 200, result: archived ? [] : [resume]}});
  });
  await page.route('**/api/resume-versions/9701/archive', route => {
    expect(route.request().method()).toBe('POST');
    archived = true;
    return route.fulfill({json: {code: 200, result: {...resume, archived}}});
  });
  await page.route('**/api/resume-versions/9701', route => route.fulfill({json: {code: 200, result: {...resume, archived}}}));
  await page.route('**/api/postings?*', route => route.fulfill({json: {code: 200, result: [{
    id: 9801, title: '测试投递岗位', companyName: '测试公司', direction: 'FULL_STACK', tier: 'A',
    stage: 'APPLIED', resumeVersionId: 9701, resumeVersionName: resume.name,
  }]}}));
  await page.goto('./resumes');
  await page.getByRole('button', {name: '归档', exact: true}).click();
  await expect(page.locator('.resume-card')).toHaveCount(0);
  await expect(page).toHaveURL(/\/resumes$/);
  await page.goto('./pipeline');
  await page.getByRole('button', {name: resume.name, exact: true}).click();
  await expect(page).toHaveURL(/\/resumes\/9701\/view$/);
  await expect(page.locator('.resume-paper')).toContainText('归档后保留的正文');
  await page.screenshot({path: 'test-results/resume-archive-preview.png'});
});
