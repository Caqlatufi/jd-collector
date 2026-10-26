import {expect, test, type Page} from './native/harness.mjs';
const p={id:801,companyId:901,companyName:'时间表示例',title:'平台工程师',direction:'FULL_STACK',source:'OTHER',rawJd:'测试',tier:'B',stage:'APPLIED',resumeVersionId:701,appliedAt:'2026-10-13T10:00:00'};
const a={id:'application-801',postingId:801,companyName:p.companyName,jobTitle:p.title,kind:'APPLICATION',title:'已投递',tier:'B',description:'记录',scheduledAt:p.appliedAt,feedbackDueAt:'2026-10-27T10:00:00',elapsedDays:9,status:'WAITING_FEEDBACK'};
const data=(items:unknown[])=>({code:200,result:{serverNow:'2026-10-22T12:00:00',planItems:items,tierCounts:{},conversion:{},todayActions:[],overdueActions:[],nextSevenDayInterviews:[],stageCounts:{}}});
const setup=async(page:Page,items=()=>[a] as unknown[],posting=()=>p)=>{
 await page.setViewportSize({width:1600,height:1000});
 await page.route('**/api/**',r=>r.request().method()==='GET'?r.continue():r.abort());
 await page.route('**/api/dashboard/today',r=>r.fulfill({json:data(items())}));
 await page.route('**/api/postings/801',r=>r.fulfill({json:{code:200,result:posting()}}));
 await page.route('**/api/postings/801/events',r=>r.fulfill({json:{code:200,result:[]}}));
 await page.route('**/api/interviews*',r=>r.fulfill({json:{code:200,result:[]}}));
};
const open=async(page:Page,id='application-801')=>{
 await page.locator(`[data-plan-id="${id}"]`).first().click();const d=page.getByRole('dialog');
 await expect(d.getByRole('button',{name:'保存进度',exact:true})).toBeEnabled();
 await expect.poll(()=>d.evaluate(el=>getComputedStyle(el).transform)).toBe('none');return d;
};

const filterType=async(page:Page,label:string)=>{
 await page.locator('.progress-type-filter .el-select__wrapper').click();
 await expect(page.locator('.el-zoom-in-top-enter-active,.el-zoom-in-top-leave-active')).toHaveCount(0);
 await page.getByRole('option',{name:label,exact:true}).click();
 await expect(page.locator('.progress-type-filter')).toContainText(label);
};

test('灰色拒绝和超时、半透明连续区间、跨月与720px布局（隔离模拟）',async({page})=>{
 await setup(page,()=>[{...a,status:'ENDED',scheduledAt:'2026-10-01T10:00:00'},
 {...a,id:'stage-1',kind:'STAGE',title:'被拒',scheduledAt:'2026-10-08T10:00:00',status:'ENDED'},
 {...a,id:'application-802',postingId:802,companyName:'跨月超时',scheduledAt:'2026-09-20T10:00:00',feedbackDueAt:'2026-10-04T10:00:00',status:'TIMED_OUT'},
 {...a,id:'application-803',postingId:803,companyName:'跨月等待',scheduledAt:'2026-10-20T10:00:00',feedbackDueAt:'2026-11-03T10:00:00'},
 {...a,id:'application-804',postingId:804,status:'FEEDBACK_RECEIVED'},
 {...a,id:'interview-4',postingId:804,kind:'INTERVIEW',title:'第 1 轮面试',scheduledAt:'2026-10-24T15:00:00',status:'PLANNED'}]);
 await page.goto('./');
 await expect(page.locator('.top-navigation')).not.toContainText('面试记录');
 await expect(page.locator('tr[data-posting-id]')).toHaveCount(2);
 await expect(page.locator('tr[data-posting-id="802"]')).toHaveCount(0);
 await filterType(page,'被拒');
 await expect(page.locator('[data-plan-id="stage-1"]')).toHaveCSS('background-color','rgb(123, 133, 126)');
 const band=page.locator('tr[data-posting-id="801"] td[data-date="2026-10-05"]');
 await expect(band).toHaveClass(/progress-range/);await expect(band).toHaveCSS('--progress-band','#7b857e26');
 await expect(band).toHaveCSS('background-image',/rgba\(123, 133, 126, 0\.15/);
 await expect(page.locator('tr[data-posting-id="801"] td[data-date="2026-10-09"]')).not.toHaveClass(/progress-range/);
 await filterType(page,'超时');
 const timeout=page.locator('tr[data-posting-id="802"] td[data-date="2026-10-04"] .plan-block');
 await expect(timeout).toContainText('超时');await expect(timeout).toHaveCSS('background-color','rgb(123, 133, 126)');
 await filterType(page,'进行中');
 await expect(page.locator('tr[data-posting-id="804"] td[data-date="2026-10-23"]')).toHaveCSS('--progress-band','#8253a826');
 await expect(page.locator('tr[data-posting-id="803"] td[data-date="2026-10-22"]')).toHaveCSS('background-color','rgb(255, 241, 210)');
 await page.screenshot({path:'test-results/timeline-progress-1600.png',fullPage:true});
 await page.setViewportSize({width:720,height:1100});
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/timeline-progress-720.png',fullPage:true});
 await page.getByRole('button',{name:'下个月',exact:true}).click();
 await expect(page.locator('tr[data-posting-id="803"] td[data-date="2026-11-03"] .plan-block')).toContainText('14天');
 await page.getByRole('button',{name:'回到今天'}).click();
 await expect(page.locator('.plan-table th.is-today')).toHaveAttribute('data-date','2026-10-22');
});

test('点击投递安排面试：必填时间、失败保留和重复提交保护（隔离模拟）',async({page})=>{
 let calls=0,scheduled=false;let sent:Record<string,unknown>={};let finish:(()=>Promise<void>)|undefined;
 await setup(page,()=>scheduled?[{...a,status:'FEEDBACK_RECEIVED'},{...a,id:'interview-10',kind:'INTERVIEW',title:'第 1 轮面试',scheduledAt:'2026-10-24T15:00:00',status:'PLANNED'}]:[a]);
 await page.route('**/api/postings/801/interview-schedule',r=>{calls++;sent=r.request().postDataJSON();
  if(calls===1)return r.fulfill({status:500,json:{code:50001,msg:'模拟保存失败'}});
  finish=async()=>{scheduled=true;await r.fulfill({json:{code:200,result:{id:10}}});};});
 await page.goto('./');const d=await open(page);
 await d.getByRole('button',{name:'保存进度',exact:true}).click();
 await expect(page.getByText('请填写面试时间',{exact:true})).toBeVisible();expect(calls).toBe(0);
 await d.locator('.el-date-editor input').fill('2026-10-24 15:00:00');await d.getByText('面试时间',{exact:true}).click();
 await d.locator('textarea').fill('线上技术面');await d.getByRole('button',{name:'保存进度',exact:true}).click();
 await expect(page.getByText('模拟保存失败',{exact:true})).toBeVisible();await expect(d.locator('textarea')).toHaveValue('线上技术面');
 await d.getByRole('button',{name:'保存进度',exact:true}).click();await expect.poll(()=>calls).toBe(2);
 await expect(d.getByRole('button',{name:'保存进度',exact:true})).not.toBeEnabled();
 expect(sent).toEqual({expectedStage:'APPLIED',scheduledAt:'2026-10-24T15:00:00',type:'TECHNICAL',format:'ONLINE',note:'线上技术面'});
 await finish!();await expect(d).toBeHidden();await expect(page.locator('[data-plan-id="interview-10"]')).toContainText('面试');
});

test('投递节点直接记录被拒并刷新灰色历史（隔离模拟）',async({page})=>{
 let rejected=false;let sent:Record<string,unknown>={};
 await setup(page,()=>rejected?[{...a,status:'ENDED'},{...a,id:'stage-9',kind:'STAGE',title:'被拒',scheduledAt:'2026-10-21T12:00:00',status:'ENDED'}]:[a]);
 await page.route('**/api/postings/801/result',r=>{sent=r.request().postDataJSON();rejected=true;return r.fulfill({json:{code:200,result:{...p,stage:'REJECTED'}}});});
 await page.goto('./');const d=await open(page);await d.getByText('被拒',{exact:true}).click();
 await expect(d.locator('.el-date-editor')).toHaveCount(0);await d.getByRole('button',{name:'保存进度',exact:true}).click();
 await expect(d).toBeHidden();expect(sent).toEqual({expectedStage:'APPLIED',result:'REJECTED',note:''});
 await expect(page.locator('tr[data-posting-id="801"]')).toHaveCount(0);
 await filterType(page,'被拒');
 await expect(page.locator('[data-plan-id="stage-9"]')).toHaveCSS('background-color','rgb(123, 133, 126)');
 await expect(page.locator('tr[data-posting-id="801"] td[data-date="2026-10-18"]')).toHaveCSS('--progress-band','#7b857e26');
});

test('修改本条投递日期只调用日期纠正接口（隔离模拟）',async({page})=>{
 let at=p.appliedAt;let sent:Record<string,unknown>={};
 await setup(page,()=>[{...a,scheduledAt:at,status:'FEEDBACK_RECEIVED'}],()=>({...p,stage:'INTERVIEW',appliedAt:at}));
 await page.route('**/api/postings/801/application-date',r=>{sent=r.request().postDataJSON();at=String(sent.appliedAt);return r.fulfill({json:{code:200,result:{...p,appliedAt:at,stage:'INTERVIEW'}}});});
 await page.goto('./');const d=await open(page);await d.getByText('修改本条记录',{exact:true}).click();
 await d.locator('.el-date-editor input').fill('2026-10-07 10:00:00');await d.getByText('投递时间',{exact:true}).click();
 await d.getByRole('button',{name:'保存进度',exact:true}).click();await expect(d).toBeHidden();
 expect(sent).toEqual({expectedAppliedAt:p.appliedAt,appliedAt:'2026-10-07T10:00:00'});
 await expect(page.locator('td[data-date="2026-10-07"] [data-plan-id="application-801"]')).toBeVisible();
});

test('面试节点支持改期复盘和完成本轮（隔离模拟）',async({page})=>{
 const i={id:10,jobPostingId:801,roundNo:1,type:'TECHNICAL',format:'ONLINE',scheduledAt:'2026-10-20T15:00:00',status:'SCHEDULED',questions:'原问题',feedback:'',nextStep:''};
 let sent:Record<string,unknown>={};
 await setup(page,()=>[{...a,status:'FEEDBACK_RECEIVED'},{...a,id:'interview-10',interviewId:10,kind:'INTERVIEW',title:'第 1 轮面试',scheduledAt:i.scheduledAt,status:'OVERDUE'}],()=>({...p,stage:'INTERVIEW'}));
 await page.route('**/api/interviews*',r=>r.fulfill({json:{code:200,result:[i]}}));
 await page.route('**/api/interviews/10',r=>{sent=r.request().postDataJSON();return r.fulfill({json:{code:200,result:{...i,...sent}}});});
 await page.goto('./');let d=await open(page,'interview-10');await expect(d.getByText('面试已完成',{exact:true})).toBeVisible();
 await d.getByText('修改本条记录',{exact:true}).click();await expect(d.getByText('面试问题',{exact:true})).toBeVisible();
 await d.locator('.el-date-editor input').fill('2026-10-21 15:00:00');await d.getByText('面试时间',{exact:true}).click();
 await d.locator('textarea').first().fill('补充问题');await d.getByRole('button',{name:'保存进度',exact:true}).click();await expect(d).toBeHidden();
 expect(sent.scheduledAt).toBe('2026-10-21T15:00:00');expect(sent.questions).toBe('补充问题');
 d=await open(page,'interview-10');await d.getByRole('button',{name:'保存进度',exact:true}).click();await expect(d).toBeHidden();expect(sent.status).toBe('COMPLETED');
});

test('加载失败可重试、空态与刷新失败提示，旧面试路径返回时间表（隔离模拟）',async({page})=>{
 let fail=false;await setup(page);
 await page.route('**/api/postings/801',r=>fail?r.fulfill({status:500,json:{code:50001,msg:'模拟加载失败'}}):r.fulfill({json:{code:200,result:p}}));
 await page.goto('./interviews');await expect(page).toHaveURL(/jd-collector\/$/);
 fail=true;await page.locator('[data-plan-id="application-801"]').first().click();const d=page.getByRole('dialog');
 await expect(d.getByText('加载失败，请重试后再操作',{exact:true})).toBeVisible();await expect(d.getByRole('button',{name:'保存进度',exact:true})).not.toBeEnabled();
 fail=false;await d.getByRole('button',{name:'重试',exact:true}).click();await expect(d.getByRole('button',{name:'保存进度',exact:true})).toBeEnabled();
 await d.getByRole('button',{name:'关闭',exact:true}).click();
 await page.route('**/api/dashboard/today',r=>r.fulfill({json:data([])}));await page.getByRole('button',{name:'刷新数据'}).click();await expect(page.getByText('本月暂无进行中的计划',{exact:true})).toBeVisible();
 await page.route('**/api/dashboard/today',r=>r.fulfill({status:500,json:{code:50001,msg:'刷新失败'}}));await page.getByRole('button',{name:'刷新数据'}).click();
 await expect(page.getByText('看板刷新失败，以下可能是旧数据。请点击刷新重试。',{exact:true})).toBeVisible();
});


test('结束类型按岗位隔离，隐藏项不进入日程和异常，超时只在明确选择后显示（隔离模拟）',async({page})=>{
 const closed=(id:number,title:string)=>[{...a,id:`application-${id}`,postingId:id,status:'ENDED'},
  {...a,id:`stage-${id}`,postingId:id,kind:'STAGE',title,scheduledAt:'2026-10-22T11:00:00',status:'ENDED'},
  {...a,id:`interview-${id}`,postingId:id,kind:'INTERVIEW',title:'旧面试',scheduledAt:'2026-10-21T10:00:00',status:'OVERDUE'}];
 await setup(page,()=>[a,...closed(802,'被拒'),...closed(803,'主动终止'),...closed(804,'已关闭'),
  {...a,id:'application-805',postingId:805,status:'FEEDBACK_RECEIVED'},
  {...a,id:'interview-805',postingId:805,kind:'INTERVIEW',title:'已取消面试',scheduledAt:'2026-10-22T09:00:00',status:'CANCELLED'},
  {...a,id:'application-806',postingId:806,status:'TIMED_OUT',scheduledAt:'2026-10-08T10:00:00',feedbackDueAt:'2026-10-22T10:00:00'},
  {...a,id:'action-806',postingId:806,kind:'FOLLOW_UP',title:'旧跟进',scheduledAt:'2026-10-22T10:00:00',status:'OVERDUE'},
  {...a,id:'application-807',postingId:807,status:'FEEDBACK_RECEIVED'},
  {...a,id:'interview-807',postingId:807,kind:'INTERVIEW',title:'有效面试',scheduledAt:'2026-10-24T10:00:00',status:'PLANNED'},
  {...a,id:'interview-808',postingId:807,kind:'INTERVIEW',title:'已取消的旧安排',scheduledAt:'2026-10-30T10:00:00',status:'CANCELLED'}]);
 await page.goto('./?postingId=806');
 await expect(page.locator('tr[data-posting-id]')).toHaveCount(2);
 await expect(page.locator('tr[data-posting-id="807"]')).toContainText('有效面试');
 await expect(page.locator('tr[data-posting-id="806"]')).toHaveCount(0);
 await expect(page.locator('.plan-day-agenda h4')).toContainText('0 项安排');
 await expect(page.getByText('暂无超期或排期异常',{exact:true})).toBeVisible();
 await page.locator('.plan-notice .el-switch__core').click();
 await expect(page.getByText('当前类型暂无异常事项',{exact:true})).toBeVisible();
 for(const [type,id] of [['被拒',802],['主动终止',803],['已关闭',804],['已取消',805]] as const){
  await filterType(page,type);await expect(page.locator(`tr[data-posting-id="${id}"]`)).toHaveCount(1);
  await expect(page.locator('tr[data-posting-id="806"]')).toHaveCount(0);
  await expect(page.locator('tr[data-posting-id]')).toHaveCount(1);
 }
 await filterType(page,'超时');
 await expect(page.getByRole('switch')).toHaveAttribute('aria-checked','false');
 await expect(page.locator('tr[data-posting-id="806"]')).toHaveCount(1);
 await expect(page.locator('.plan-day-agenda')).toContainText('旧跟进');
 await page.screenshot({path:'test-results/timeline-filter-timeout.png',fullPage:true});
 await page.getByRole('button',{name:'下个月',exact:true}).click();
 await expect(page.locator('tr[data-posting-id="801"]')).toHaveCount(0);
 await page.getByRole('button',{name:'回到今天'}).click();
 await expect(page.locator('tr[data-posting-id="806"]')).toHaveCount(1);
 await filterType(page,'进行中');
 await expect(page.locator('tr[data-posting-id="806"]')).toHaveCount(0);
 await page.reload();
 await expect(page.locator('tr[data-posting-id="806"]')).toHaveCount(0);
});
