import {expect, test} from './native/harness.mjs';

test('四档颜色在列表、详情、预测、筛选、Pipeline、看板一致（只读/模拟数据）', async ({page}) => {
  // 捕获真实记录，仅在浏览器响应中改成四种档位；不往数据库创建验收数据。
  const api='http://127.0.0.1:7890/jd-collector/api';
  const result=await (await page.request.get(api+'/postings?size=100')).json();
  const tiers=['S','A','B','SKIP'];
  const rows=result.result.slice(0,4).map((p:any,i:number)=>({...p,tier:tiers[i],stage:'APPLIED'}));
  await page.route('**/api/postings?*',r=>r.fulfill({json:{...result,result:rows}}));
  await page.route(/\/api\/postings\/\d+$/,r=>r.fulfill({json:{code:200,result:rows[0]}}));
  const expected: Record<string,string>={S:'rgb(243, 232, 255)',A:'rgb(219, 234, 254)',B:'rgb(254, 243, 199)',SKIP:'rgb(241, 245, 249)'};
  const check=async(scope:string)=>{
    for(const tier of tiers){const badge=page.locator(scope+` .tier-badge[data-tier="${tier}"]`).first();await expect(badge).toBeVisible();await expect(badge).toHaveCSS('background-color',expected[tier]);}
  };
  await page.goto('./');
  await page.getByRole('menuitem',{name:'JD 列表'}).click();
  await expect(page.getByText(/通勤按已保存的 JD 门槛核实/)).toBeVisible();
  await check('.tier-legend');await check('.el-table__body');
  await page.locator('.el-table__row').first().getByRole('button',{name:'详情'}).click();
  await expect(page.locator('.el-drawer .tier-badge')).toHaveCSS('background-color',expected.S);
  await page.locator('.el-drawer__close-btn').click();
  await page.getByRole('button',{name:'新增 JD'}).click();
  await expect(page.locator('.score-summary .tier-badge')).toHaveCSS('background-color',expected.SKIP);
  await page.getByRole('button',{name:'取消',exact:true}).click();
  await page.locator('.toolbar-search .el-select').nth(2).click();
  for(const tier of tiers)await expect(page.getByRole('option').locator(`.tier-badge[data-tier="${tier}"]`)).toHaveCSS('background-color',expected[tier]);
  await page.keyboard.press('Escape');
  await page.getByRole('menuitem',{name:'投递 Pipeline'}).click();await check('.el-table__body');
  await page.getByRole('menuitem',{name:'今日看板'}).click();await check('.dashboard-summary');
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({path:'test-results/tier-colors-dashboard.png',fullPage:true});
});
