import {expect, test} from './native/harness.mjs';

test('已有岗位总分降序、分页顺序稳定（只读）', async ({page}) => {
  const api='api';
  const response=await (await page.request.get(api+'/postings?size=100')).json();
  const rows=response.result;
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.length).toBe(response.page.totalElements);
  for(let i=1;i<rows.length;i++) {
    expect(rows[i-1].totalScore).toBeGreaterThanOrEqual(rows[i].totalScore);
    if(rows[i-1].totalScore===rows[i].totalScore) expect(rows[i-1].id).toBeGreaterThan(rows[i].id);
  }
  const first=await (await page.request.get(api+'/postings?size=5&number=1')).json();
  const second=await (await page.request.get(api+'/postings?size=5&number=2')).json();
  expect([...first.result,...second.result].map((p:any)=>p.id)).toEqual(rows.slice(0,10).map((p:any)=>p.id));
  const csv=await (await page.request.get(api+'/postings/export.csv')).text();
  expect(csv.length).toBeGreaterThan(0);
  await page.goto('./');
  await page.getByRole('menuitem',{name:'JD 列表'}).click();
  await expect(page.getByText(`共 ${response.page.totalElements} 条岗位`)).toBeVisible();
  await expect(page.locator('.el-table__row').first().locator('strong').first()).toHaveText(rows[0].title);
  const scores=await page.locator('.el-table__row td:nth-child(4) strong').allTextContents();
  expect(scores.map(Number)).toEqual(rows.map((p:any)=>p.totalScore));
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});
