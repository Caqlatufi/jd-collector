import {expect, test} from './native/harness.mjs';

const ok = (result: unknown) => ({code: 200, msg: 'success', result});

test('JD列表可进入知识图谱并按选中JD重新计算（模拟知识接口）', async ({page}) => {
  const options = [
    {postingId: 101, companyName: '甲公司', title: 'AI应用开发', direction: 'K1', tier: 'A', stage: 'SCREENED', processed: true, termCount: 3, stale: false},
    {postingId: 102, companyName: '乙公司', title: '全栈开发', direction: 'K2', tier: 'B', stage: 'CLOSED', processed: true, termCount: 2, stale: false},
  ];
  const graphFor = (ids: number[]) => ({
    selectedPostingCount: ids.length,
    processedPostingCount: ids.length,
    taggedPostingCount: ids.length,
    stalePostingCount: 0,
    unprocessedPostingIds: [], emptyPostingIds: [], stalePostingIds: [],
    nodes: ids.length ? [{id: 'spring boot', label: 'Spring Boot', documentCount: ids.length, weightedCount: ids.length * 3,
      highCount: ids.length, mediumCount: 0, lowCount: 0, postingIds: ids}] : [],
    edges: ids.length > 1 ? [{source: 'spring boot', target: 'mysql', documentCount: 2, weightedCount: 4, postingIds: ids}] : [],
  });
  const graphRequests: number[][] = [];

  await page.route('**/api/posting-knowledge/**', async route => {
    const request = route.request();
    if (request.url().endsWith('/postings')) return route.fulfill({json: ok(options)});
    if (request.url().endsWith('/graph')) {
      const body = request.postDataJSON();
      graphRequests.push(body.postingIds);
      return route.fulfill({json: ok(graphFor(body.postingIds))});
    }
    if (request.url().endsWith('/postings/101/terms')) return route.fulfill({json: ok({postingId: 101, processed: true,
      extractorVersion: 'jd-term-v1', sourceHash: 'hash', stale: false, updatedAt: '2026-09-12T10:00:00', terms: [
        {term: 'Spring Boot', normalizedTerm: 'spring boot', priority: 'HIGH', weight: 3},
      ]})});
    return route.fulfill({status: 404, json: {code: 404, msg: 'not found'}});
  });

  await page.goto('./postings');
  await page.getByRole('button', {name: '知识图谱', exact: true}).click();
  await expect(page).toHaveURL(/\/postings\/knowledge-graph$/);
  await expect(page.getByText('JD知识图谱', {exact: true})).toBeVisible();
  await expect(page.getByText('已勾选 2／2，当前筛选 2', {exact: true})).toBeVisible();
  expect(await page.locator('.knowledge-metrics strong').allTextContents()).toEqual(['2', '2', '2', '0', '1', '1']);
  expect(graphRequests[0]).toEqual([101, 102]);

  await page.locator('.posting-check-row').first().getByRole('button', {name: '编辑', exact: true}).click();
  await expect(page.getByText('高优先级 · 权重3', {exact: true})).toBeVisible();
  await expect(page.getByText('Spring Boot', {exact: true})).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', {name: '清除当前', exact: true}).click();
  await page.getByRole('button', {name: '重新计算', exact: true}).click();
  await expect(page.getByText('已勾选 0／2，当前筛选 2', {exact: true})).toBeVisible();
  expect(graphRequests.at(-1)).toEqual([]);

  await page.reload();
  await expect(page.getByText('JD知识图谱', {exact: true})).toBeVisible();
  await page.getByRole('button', {name: '返回JD列表', exact: true}).click();
  await expect(page).toHaveURL(/\/postings$/);
});
