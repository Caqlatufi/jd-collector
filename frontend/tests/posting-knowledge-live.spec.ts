import {expect, test} from './native/harness.mjs';

test('真实知识图谱覆盖当前全部JD并可直接刷新（只读）', async ({page}) => {
  const api = 'http://127.0.0.1:7890/jd-collector/api';
  const options = (await (await page.request.get(api + '/posting-knowledge/postings')).json()).result;
  const graphResponse = await fetch(api + '/posting-knowledge/graph', {method: 'POST', headers: {'content-type': 'application/json'},
    body: JSON.stringify({postingIds: options.map((item: any) => item.postingId), minDocumentCount: 2,
      minEdgeDocumentCount: 2, maxNodes: 80})});
  const graphBody = await graphResponse.json();
  expect(options.length).toBeGreaterThan(0);
  expect(options.every((item: any) => item.processed)).toBe(true);
  expect(options.some((item: any) => item.stale)).toBe(false);
  expect(graphResponse.status).toBe(200);
  expect(graphBody.result.nodes.length).toBeGreaterThan(0);
  await page.route('**/api/posting-knowledge/graph', route => route.fulfill({json: graphBody}));

  await page.goto('./postings/knowledge-graph');
  await expect(page.getByText(`已勾选 ${options.length}／${options.length}，当前筛选 ${options.length}`, {exact: true})).toBeVisible();
  const expectedCoverage = [String(options.length), String(options.length),
    String(options.filter((item: any) => item.termCount > 0).length), '0'];
  await expect.poll(async () => (await page.locator('.knowledge-metrics strong').allTextContents()).slice(0, 4))
    .toEqual(expectedCoverage);
  const metrics = await page.locator('.knowledge-metrics strong').allTextContents();
  expect(Number(metrics[4])).toBeGreaterThan(0);
  expect(Number(metrics[5])).toBeGreaterThan(0);
  const graphBox = await page.locator('.knowledge-graph-canvas canvas').boundingBox();
  expect(graphBox.width).toBeGreaterThan(400);
  expect(graphBox.height).toBeGreaterThan(600);

  await page.reload();
  await expect(page.getByText('JD知识图谱', {exact: true})).toBeVisible();
});
