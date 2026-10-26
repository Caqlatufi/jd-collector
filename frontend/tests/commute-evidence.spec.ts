import {expect, test} from './native/harness.mjs';
import {commuteSummary} from '../src/common/utils/commute';

test('通勤标签不依赖等级；缺失不虚构，优先读取最新备注', () => {
  expect(commuteSummary()).toMatchObject({estimate: '未填写', note: '', hasEstimate: false});
  expect(commuteSummary('A级 示例区 示例路')).toMatchObject({estimate:'未填写', note: ''});
  expect(commuteSummary('【通勤估算】无可靠时间')).toMatchObject({hasEstimate: false});
  expect(commuteSummary('【通勤估算】0 分钟（手动填写）\n【通勤备注】楼下办公')).toMatchObject({hasEstimate: true, note: '楼下办公'});
  expect(commuteSummary('【通勤状态】多办公点待确认\r\n【通勤估算】35–55 分钟（估算）\r\n---历史---\n【通勤状态】旧结论')).toMatchObject({note:'',estimate:'35–55 分钟（估算）'});
  expect(commuteSummary('【通勤估算】45–55 分钟（手动填写）\n【通勤备注】手动填写，待核验')).toMatchObject({note: '', hasEstimate: true});
  expect(commuteSummary('【通勤估算】45–55 分钟（手动填写）\n【通勤备注】\n\n【通勤备注】旧备注')).toMatchObject({note: '', hasEstimate: true});
});

test('列表显示独立通勤证据，详情区分公司地址与岗位地址（模拟响应）', async ({page}) => {
  const posting = {id: 8801, companyId: 8802, companyName: '通勤夹具公司',
    title: '后端开发工程师（平台）', direction: 'JAVA_BACKEND', source: 'BOSS',
    stage: 'SCREENED', tier: 'A', totalScore: 78, location: '示例办公区',
    rawJd: 'Java 平台开发',
    riskNotes: '【通勤状态】多办公点待确认\n【通勤估算】35–55 分钟（估算）\n【通勤备注】地铁，含候车和步行\n官网另列示例路100号，岗位办公点待核实'};
  const snapshot = {code: 200, result: [posting], page: {number: 0, size: 100, totalElements: 1, totalPages: 1}};
  await page.route('**/api/**', route => {
    const routePath = new URL(route.request().url()).pathname;
    if (route.request().method() !== 'GET') return route.abort();
    if (routePath.endsWith('/postings/8801')) return route.fulfill({json: {code: 200, result: posting}});
    if (routePath.endsWith('/postings')) return route.fulfill({json: snapshot});
    return route.fulfill({json: {code: 200, result: [], page: {number: 0, totalElements: 0, totalPages: 0, size: 100}}});
  });
  const errors: string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width: 1665, height: 1000});
  await page.goto('./postings');
  await expect(page.getByText('等级由综合评分决定；通勤时间可单独修改。')).toBeVisible();
  await expect(page.getByText(`共 ${snapshot.page.totalElements} 条岗位`)).toBeVisible();
  const row=page.locator('.el-table__row').filter({hasText:posting.title});
  await expect(row.locator('.tier-badge')).toHaveAttribute('data-tier','A');
  await expect(row.locator('.commute-note')).toHaveText('地铁，含候车和步行');
  await expect(row.locator('.commute-estimate')).toHaveText('35–55 分钟（估算）');
  expect(await row.locator('.commute-cell').evaluate(el =>
    [...el.children].slice(0, 2).map(child => child.textContent))).toEqual(['35–55 分钟（估算）', '地铁，含候车和步行']);
  await expect(row.getByRole('button', {name: '详情', exact: true})).toHaveCount(0);
  await expect(row.getByRole('button', {name: '编辑', exact: true})).toHaveCount(0);
  await row.getByRole('button', {name: posting.title, exact: true}).click();
  const drawer=page.locator('.el-drawer');
  await expect(drawer.getByRole('heading',{name:'通勤时间与备注'})).toBeVisible();
  await expect(drawer.locator('p').filter({hasText:'官网另列示例路100号'}).first()).toBeVisible();
  await expect(drawer.getByText('通勤时间按填写值保存和计分。办公地点与路线说明见下方风险备注。')).toBeVisible();
  await expect.poll(() => drawer.evaluate(el => Math.round(el.getBoundingClientRect().right - innerWidth))).toBe(0);
  await page.locator('.el-drawer__close-btn').click();
  await expect(drawer).toBeHidden();
  await page.evaluate(()=>window.scrollTo(0,0));
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({path:'test-results/commute-evidence-postings.png'});
});

test('空通勤可填写范围，校验、失败保留输入、提交和刷新均正确（模拟响应）', async ({page}) => {
  await page.setViewportSize({width: 1665, height: 1000});
  let posting = {id: 8803, companyId: 8802, companyName: '手动通勤夹具公司', title: '待补通勤岗位',
    direction: 'JAVA_BACKEND', source: 'OTHER', rawJd: '测试JD', stage: 'SCREENED', tier: 'A',
    totalScore: 70, commuteScore: 0, matchScore: 35, companyScore: 15, freshnessScore: 10, salaryScore: 10,
    riskNotes: '技能风险原备注'};
  const other = {...posting, id: 8804, title: '比较岗位', totalScore: 75,
    riskNotes: '【通勤估算】45–55 分钟（手动填写）\n【通勤备注】手动填写，待核验'};
  let listLoads = 0;
  let calls = 0;
  let submitted: Record<string, unknown> = {};
  let complete: (() => Promise<void>) | undefined;
  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/postings/8803/commute') && route.request().method() === 'PUT') {
      calls++;
      submitted = route.request().postDataJSON();
      if (calls === 1) return route.fulfill({status: 500, json: {code: 50001, msg: '模拟保存失败'}});
      complete = async () => {
        posting = {...posting, commuteScore: 10, totalScore: 80, tier: 'S',
          riskNotes: '【通勤估算】45–60 分钟（手动填写）\n【通勤备注】电动车，含停车\n【通勤评分】10/15（按时间上限60分钟计算）\n\n技能风险原备注'};
        await route.fulfill({json: {code: 200, result: posting}});
      };
      return;
    }
    if (route.request().method() !== 'GET') return route.abort();
    if (pathname.endsWith('/postings')) {
      listLoads++;
      return route.fulfill({json: {code: 200, result: [posting, other].sort((a, b) => b.totalScore - a.totalScore), page: {totalElements: 2}}});
    }
    if (pathname.endsWith('/postings/8803')) return route.fulfill({json: {code: 200, result: posting}});
    return route.fulfill({json: {code: 200, result: [], page: {totalElements: 0}}});
  });
  await page.goto('./postings');
  const row = page.locator('.el-table__row').filter({hasText: posting.title});
  await expect(page.locator('.el-table__row').first()).toContainText('比较岗位');
  const otherRow = page.locator('.el-table__row').filter({hasText: '比较岗位'});
  await expect(otherRow.locator('.commute-note')).toHaveCount(0);
  await otherRow.getByRole('button', {name: '修改时间范围', exact: true}).click();
  await expect(page.getByRole('dialog', {name: '填写通勤时间范围'}).locator('input[aria-label="通勤备注"]')).toHaveValue('');
  await page.getByRole('dialog', {name: '填写通勤时间范围'}).getByRole('button', {name: '取消', exact: true}).click();
  await expect(page.getByRole('dialog', {name: '填写通勤时间范围'})).toBeHidden();
  await expect(row.locator('.commute-estimate')).toHaveText('未填写');
  await expect(row.locator('.commute-note')).toHaveCount(0);
  await row.getByRole('button', {name: '填写时间范围', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: '填写通勤时间范围'});
  const min = dialog.locator('input[aria-label="时间下限（分钟）"]');
  const max = dialog.locator('input[aria-label="时间上限（分钟）"]');
  await dialog.getByRole('button', {name: '提交', exact: true}).click();
  await expect(dialog.getByText('请填写时间下限和上限')).toBeVisible();
  await min.fill('60');
  await max.fill('45');
  await dialog.getByRole('button', {name: '提交', exact: true}).click();
  await expect(dialog.getByText('时间下限不能大于上限')).toBeVisible();
  expect(calls).toBe(0);
  await min.fill('45');
  await max.fill('60');
  await dialog.locator('input[aria-label="通勤备注"]').fill('电动车，含停车');
  await dialog.getByRole('button', {name: '提交', exact: true}).click();
  await expect(page.getByText('模拟保存失败', {exact: true})).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(min).toHaveValue('45');
  await expect(max).toHaveValue('60');
  await dialog.getByRole('button', {name: '提交', exact: true}).click();
  await expect.poll(() => calls).toBe(2);
  await expect(dialog.getByRole('button', {name: '取消', exact: true})).not.toBeEnabled();
  expect(submitted).toEqual({minMinutes: 45, maxMinutes: 60, note: '电动车，含停车', expectedRiskNotes: '技能风险原备注'});
  await complete!();
  await expect(dialog).toBeHidden();
  await expect(row.locator('.commute-estimate')).toHaveText('45–60 分钟（手动填写）');
  await expect(row.locator('.commute-note')).toHaveText('电动车，含停车');
  await expect.poll(() => listLoads).toBe(2);
  await expect(page.locator('.el-table__row').first()).toContainText('待补通勤岗位');
  await expect(row.locator('.tier-badge')).toHaveAttribute('data-tier', 'S');
  await expect(row).toContainText('80 / 100');
  await page.reload();
  await expect(row.locator('.commute-estimate')).toHaveText('45–60 分钟（手动填写）');
  await row.getByRole('button', {name: '修改时间范围', exact: true}).click();
  await expect(min).toHaveValue('45');
  await expect(max).toHaveValue('60');
  await dialog.getByRole('button', {name: '取消', exact: true}).click();
  expect(calls).toBe(2);
  await row.getByRole('button', {name: posting.title, exact: true}).click();
  await expect(page.locator('.el-drawer .commute-estimate')).toHaveText('45–60 分钟（手动填写）');
  await expect(page.locator('.el-drawer .commute-note')).toHaveText('电动车，含停车');
  await expect(page.locator('.el-drawer')).toContainText('通勤 10/15');
  await expect.poll(() => page.locator('.el-drawer').evaluate(el => Math.round(el.getBoundingClientRect().right - innerWidth))).toBe(0);
  await page.locator('.el-drawer__close-btn').click();
  await expect(page.locator('.el-drawer')).toBeHidden();
  await page.setViewportSize({width: 720, height: 1000});
  await row.locator('.commute-cell').evaluate(el => {
    const scroller = el.closest('.el-table')!.querySelector('.el-table__body-wrapper .el-scrollbar__wrap')!;
    scroller.scrollLeft += el.getBoundingClientRect().left - scroller.getBoundingClientRect().left - 20;
  });
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await row.getByRole('button', {name: '修改时间范围', exact: true}).click();
  await expect(dialog).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))));
  await page.screenshot({path: 'test-results/commute-manual-720.png'});
});
