import {expect, test} from './native/harness.mjs';

test('计划时间图：今天整列、月份导航、跨月异常、详情定位和竖屏布局（模拟数据只读）', async ({page}) => {
  page.setDefaultTimeout(10_000);
  const response=await (await page.request.get('api/dashboard/today')).json();
  const postingResponse=await (await page.request.get('api/postings?size=100')).json();
  const common={postingId:8,companyName:'示例公司',jobTitle:'平台后端开发',tier:'S',description:'面试准备与跟进',kind:'FOLLOW_UP',status:'PLANNED'};
  const items=[
    {...common,id:'action-next',title:'确认岗位名额',scheduledAt:'2026-09-07T10:00:00'},
    {...common,id:'interview-today',interviewId:900,kind:'INTERVIEW',title:'第 1 轮面试',scheduledAt:'2026-09-06T15:00:00'},
    {...common,id:'action-overdue',postingId:27,companyName:'拼多多',title:'回复招聘方',scheduledAt:'2026-09-05T09:00:00',status:'OVERDUE'},
    {...common,id:'old-overdue',title:'上月未处理',scheduledAt:'2026-08-31T10:00:00',status:'OVERDUE'},
    {...common,id:'done',kind:'INTERVIEW',interviewId:901,title:'已完成技术面',scheduledAt:'2026-09-04T09:00:00',status:'COMPLETED'},
    {...common,id:'missing',postingId:20,companyName:'本原智数',title:'待补时间',status:'UNSCHEDULED',scheduledAt:null},
    {...common,id:'next-month',title:'第二月面试',kind:'INTERVIEW',interviewId:902,scheduledAt:'2026-10-12T10:00:00'},
  ];
  await page.route('**/api/dashboard/today',r=>r.fulfill({json:{...response,result:{...response.result,serverNow:'2026-09-06T10:00:00',planItems:items}}}));
  await page.route('**/api/postings?*',r=>r.fulfill({json:{...postingResponse,result:postingResponse.result.map((p:any)=>p.id===8?{...p,stage:'APPLIED'}:p)}}));
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('./');
  await expect(page.getByRole('heading',{name:'求职计划时间图'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'阶段统计'})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'未来七天面试'})).toHaveCount(0);
  await expect(page.locator('.metric-grid')).toHaveCount(0);
  const funnel=await page.locator('.funnel-panel').boundingBox();const plan=await page.locator('.plan-panel').boundingBox();
  expect(funnel!.y).toBeLessThan(plan!.y);
  const today=page.locator('.plan-table th[data-date="2026-09-06"]');
  await expect(today).toHaveClass(/is-today/);
  await expect(today).toHaveCSS('background-color','rgb(255, 241, 210)');
  await expect(today.getByRole('button')).toHaveAttribute('aria-current','date');
  await expect(page.getByText('异常提醒：3 项待处理')).toBeVisible();
  await expect(page.locator('[data-plan-id="action-overdue"] .plan-block')).toHaveClass(/overdue/);
  await expect(page.locator('[data-plan-id="done"] .plan-block')).toHaveClass(/completed/);
  await expect(page.locator('.plan-day-agenda')).toContainText('第 1 轮面试');
  await page.locator('.plan-notice .el-switch').click();
  await expect(page.getByRole('switch')).toHaveAttribute('aria-checked','true');
  await expect(page.locator('[data-plan-id="old-overdue"]')).toBeVisible();
  await expect(page.locator('[data-plan-id="missing"]')).toContainText('排期不完整');
  await expect(page.locator('[data-plan-id="done"]')).toHaveCount(0);
  await page.getByRole('button',{name:'本月之外 · 定位日期 →'}).click();
  await expect(page.locator('.plan-navigation')).toContainText('2026-08');
  await expect(page.locator('[data-plan-id="old-overdue"] .plan-block')).toBeVisible();
  await page.getByRole('button',{name:'回到今天'}).click();
  await page.locator('.plan-notice .el-switch').click();
  await page.getByRole('button',{name:'下个月',exact:true}).click();
  await expect(page.locator('[data-plan-id="next-month"]')).toBeVisible();
  await page.getByRole('button',{name:'回到今天'}).click();
  await page.locator('[data-plan-id="interview-today"] .plan-block').click();
  await expect(page.getByRole('dialog')).toContainText('今日计划');
  await expect(page.getByRole('button',{name:'去更新面试记录'})).toBeVisible();
  await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({path:'test-results/dashboard-plan-example.png',fullPage:true});
  await page.locator('[data-plan-id="action-next"] .plan-task-name').click();
  await page.getByRole('button',{name:'去处理跟进'}).click();
  await expect(page).toHaveURL(/pipeline\?postingId=8/);
  await expect(page.locator('.el-table__row')).toHaveCount(1);
  await expect(page.locator('.el-table__row')).toContainText('示例公司');
  await page.locator('.el-table__row').getByRole('button',{name:'推进',exact:true}).click();
  await expect(page.getByRole('dialog').getByText('下一步时间（可选）',{exact:true})).toBeVisible();
  await expect(page.getByRole('dialog').getByText('下一步动作（可选）',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'取消',exact:true}).click();
  expect(errors).toEqual([]);
});

test('空计划仍有今天标记，刷新失败显示提示（模拟响应只读）',async({page})=>{
  const response=await (await page.request.get('api/dashboard/today')).json();
  let fail=false;
  let serverNow='2026-09-06T10:00:00';
  await page.route('**/api/dashboard/today',r=>fail?r.fulfill({status:500,json:{code:500,msg:'test failure'}}):r.fulfill({json:{...response,result:{...response.result,serverNow,planItems:[]}}}));
  await page.goto('./');
  await expect(page.getByText('本月暂无计划', {exact:true})).toBeVisible();
  await expect(page.locator('.plan-table th.is-today')).toHaveCount(1);
  await expect(page.getByText('暂无超期或排期异常', {exact:true})).toBeVisible();
  await page.setViewportSize({width:768,height:1366});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  serverNow='2026-10-01T00:00:05';
  await page.getByRole('button',{name:'刷新数据'}).click();
  await expect(page.locator('.plan-table th.is-today')).toHaveAttribute('data-date','2026-10-01');
  fail=true;await page.getByRole('button',{name:'刷新数据'}).click();
  await expect(page.getByText('看板刷新失败，以下可能是旧数据。请点击刷新重试。')).toBeVisible();
});

test('真实计划接口与页面一致，不改写JD或面试状态（只读）',async({page})=>{
  const snapshot=await (await page.request.get('api/dashboard/today')).json();
  const real=snapshot.result;
  expect(real.serverNow).toBeTruthy();expect(Array.isArray(real.planItems)).toBe(true);
  await page.goto('./');
  await expect(page.getByRole('heading',{name:'求职计划时间图'})).toBeVisible();
  await expect(page.locator('.plan-table tbody tr[data-plan-id]')).toHaveCount(real.planItems.filter((p:any)=>p.scheduledAt?.startsWith(real.serverNow.slice(0,7))).length);
  await page.screenshot({path:'test-results/dashboard-plan-real.png',fullPage:true});
});
