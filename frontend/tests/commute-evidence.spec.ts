import {expect, test} from './native/harness.mjs';
import {commuteSummary} from '../src/common/utils/commute';

test('通勤标签不依赖等级；缺失不虚构，优先读取最新备注', () => {
  expect(commuteSummary().status).toBe('未核验');
  expect(commuteSummary('A级 示例区 示例路')).toMatchObject({status:'未核验',estimate:'无可靠时间'});
  expect(commuteSummary('【通勤状态】多办公点待确认\r\n【通勤估算】35–55 分钟（估算）\r\n---历史---\n【通勤状态】旧结论')).toMatchObject({status:'多办公点待确认',estimate:'35–55 分钟（估算）'});
});

test('列表显示独立通勤证据，详情区分公司地址与岗位地址（模拟响应）', async ({page}) => {
  const posting = {id: 8801, companyId: 8802, companyName: '通勤夹具公司',
    title: '后端开发工程师（平台）', direction: 'JAVA_BACKEND', source: 'BOSS',
    stage: 'SCREENED', tier: 'A', totalScore: 78, location: '示例办公区',
    rawJd: 'Java 平台开发',
    riskNotes: '【通勤状态】多办公点待确认\n【通勤估算】35–55 分钟（估算）\n官网另列示例路100号，岗位办公点待核实'};
  const snapshot = {code: 200, result: [posting], page: {number: 0, size: 100, totalElements: 1, totalPages: 1}};
  await page.route('**/api/**', route => {
    const routePath = new URL(route.request().url()).pathname;
    if (routePath.endsWith('/postings/8801')) return route.fulfill({json: {code: 200, result: posting}});
    if (routePath.endsWith('/postings')) return route.fulfill({json: snapshot});
    if (route.request().method() !== 'GET') return route.abort();
    return route.fulfill({json: {code: 200, result: [], page: {number: 0, totalElements: 0, totalPages: 0, size: 100}}});
  });
  const errors: string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('./');
  await page.getByRole('menuitem',{name:'JD 列表'}).click();
  await expect(page.getByText('岗位档位与通勤分开判断；S/A 不代表已通过通勤硬筛选。')).toBeVisible();
  await expect(page.getByText(`共 ${snapshot.page.totalElements} 条岗位`)).toBeVisible();
  const row=page.locator('.el-table__row').filter({hasText:posting.title});
  await expect(row.locator('.tier-badge')).toHaveAttribute('data-tier','A');
  await expect(row.locator('.commute-status')).toHaveText('多办公点待确认');
  await row.getByRole('button',{name:'详情'}).click();
  const drawer=page.locator('.el-drawer');
  await expect(drawer.getByRole('heading',{name:'通勤证据（与岗位等级独立）'})).toBeVisible();
  await expect(drawer.locator('p').filter({hasText:'官网另列示例路100号'}).first()).toBeVisible();
  await expect(drawer.getByText('条件估算不是工作日地图实测；总部地址不等于该岗位办公点。详细来源与待确认事项见下方风险说明。')).toBeVisible();
  await page.locator('.el-drawer__close-btn').click();
  await expect(drawer).toBeHidden();
  await page.evaluate(()=>window.scrollTo(0,0));
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({path:'test-results/commute-evidence-postings.png'});
});
