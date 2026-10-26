import {expect, test} from './native/harness.mjs';

test('BOSS竞争力替换方向列，准确显示两项数值与未采集状态，刷新和窄屏正常（模拟响应）', async ({page}) => {
  await page.setViewportSize({width: 1665, height: 1000});
  const base = {companyId: 9900, companyName: '竞争力夹具公司', direction: 'FULL_STACK', source: 'BOSS',
    rawJd: '完整测试正文', stage: 'SCREENED', tier: 'A', totalScore: 75, matchScore: 30,
    companyScore: 15, freshnessScore: 10, commuteScore: 10, salaryScore: 10,
    createdAt: '2026-10-12T16:00:00', updatedAt: '2026-10-12T16:00:00'};
  const rows = [
    {...base, id: 9901, title: '已采集竞争力岗位', sourceUrl: 'https://www.zhipin.com/job_detail/9901.html',
      bossCompetitionStatus: 'AVAILABLE', bossRank: 1534, bossCompetitorCount: 2143, bossSurpassedPercent: 28.42},
    {...base, id: 9902, title: '末位竞争力岗位', sourceUrl: 'https://www.zhipin.com/job_detail/9902.html',
      bossCompetitionStatus: 'AVAILABLE', bossRank: 5, bossCompetitorCount: 5, bossSurpassedPercent: 0},
    {...base, id: 9903, title: '未采集竞争力岗位', sourceUrl: 'https://www.zhipin.com/job_detail/9903.html'},
    {...base, id: 9904, title: '暂无竞争力岗位', sourceUrl: 'https://www.zhipin.com/job_detail/9904.html',
      bossCompetitionStatus: 'UNAVAILABLE'},
    {...base, id: 9905, title: '关闭竞争力岗位', sourceUrl: 'https://www.zhipin.com/job_detail/9905.html',
      bossCompetitionStatus: 'CLOSED'},
    {...base, id: 9906, title: '无直链竞争力岗位', sourceUrl: 'https://careers.example.com/job/9906'},
  ];
  let requestedSort = '';
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (route.request().method() !== 'GET') return route.abort();
    if (path.endsWith('/postings')) {
      requestedSort = url.searchParams.get('sortBy') || '';
      return route.fulfill({json: {code: 200, result: rows, page: {totalElements: rows.length}}});
    }
    return route.fulfill({json: {code: 200, result: [], page: {totalElements: 0}}});
  });
  await page.goto('./postings');
  await expect.poll(() => requestedSort).toBe('BOSS_COMPETITION');
  await expect(page.locator('.el-table__header th').filter({hasText: 'BOSS 竞争力'})).toBeVisible();
  await expect(page.locator('.el-table__header th').filter({hasText: /^方向$/})).toHaveCount(0);
  const row = (title: string) => page.locator('.el-table__row').filter({hasText: title});
  await expect(row('已采集竞争力岗位')).toContainText('1534 / 2143 人');
  await expect(row('已采集竞争力岗位')).toContainText('超过 28.42% 竞争者');
  await expect(row('末位竞争力岗位')).toContainText('超过 0.00% 竞争者');
  await expect(row('未采集竞争力岗位')).toContainText('未采集');
  await expect(row('暂无竞争力岗位')).toContainText('无竞争力报告');
  await expect(row('关闭竞争力岗位')).toContainText('岗位已关闭');
  await expect(row('无直链竞争力岗位')).toContainText('无 BOSS 直链');
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({path: 'test-results/boss-competition-1665.png'});
  await page.reload();
  await expect(row('已采集竞争力岗位')).toContainText('超过 28.42% 竞争者');
  await expect(page.locator('input[aria-label="岗位排序"]')).toHaveCount(0);
  await page.goto('./postings?sortBy=SCORE');
  await expect.poll(() => requestedSort).toBe('SCORE');
  await expect(page.locator('.el-table__header th').filter({hasText: '评分 ↓'})).toBeVisible();
  await page.reload();
  await expect.poll(() => requestedSort).toBe('SCORE');
  await page.setViewportSize({width: 720, height: 1000});
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({path: 'test-results/boss-competition-720.png'});
});
