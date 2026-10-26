import {expect, test, type Page} from './native/harness.mjs';

const posting = {id:801,companyId:901,companyName:'反馈示例公司',title:'Java全栈工程师',direction:'FULL_STACK',
  source:'OTHER',rawJd:'示例JD',tier:'B',totalScore:58,stage:'APPLIED',resumeVersionId:701,
  resumeVersionName:'已投递的简历',appliedAt:'2026-10-01T10:00:00'};
const setup = async(page:Page,getPosting:()=>Record<string,unknown>)=>{
  await page.setViewportSize({width:1600,height:1000});
  await page.route('**/api/**',r=>r.request().method()==='GET'?r.continue():r.abort());
  await page.route('**/api/postings?*',r=>r.fulfill({json:{code:200,result:[getPosting()],page:{number:0,size:100,totalElements:1,totalPages:1}}}));
  await page.route('**/api/interviews*',r=>r.fulfill({json:{code:200,result:[]}}));
};

test('初筛反馈仅两种结果；填写面试时间即可保存，防重复提交并保留原投递信息（隔离模拟）',async({page})=>{
  let scheduled=false;
  await setup(page,()=>({...posting,stage:scheduled?'INTERVIEW':'APPLIED',nextAction:scheduled?'参加第 1 轮面试':undefined,
    nextActionAt:scheduled?'2026-11-01T10:00:00':undefined}));
  let submitted:Record<string,unknown>={};
  let calls=0;
  let complete:(()=>Promise<void>)|undefined;
  await page.route('**/api/postings/801/interview-schedule',r=>{
    submitted=r.request().postDataJSON();calls++;
    complete=async()=>{scheduled=true;await r.fulfill({json:{code:200,result:{id:1001,jobPostingId:801,roundNo:1,status:'SCHEDULED'}}});};
  });
  await page.goto('./pipeline?postingId=801');
  await expect(page.locator('.el-table__row')).toContainText('等待反馈');
  await page.getByRole('button',{name:'记录反馈',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await expect.poll(()=>dialog.evaluate(el=>getComputedStyle(el).transform)).toBe('none');
  await expect(dialog.locator('.el-radio-button')).toHaveCount(2);
  await expect(dialog.getByText('安排面试',{exact:true})).toBeVisible();
  await expect(dialog.getByText('初筛不通过',{exact:true})).toBeVisible();
  for(const label of ['目标阶段','使用简历','首次投递时间','下一步时间（可选）','下一步动作（可选）'])
    await expect(dialog.getByText(label,{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'确认面试安排',exact:true}).click();
  await expect(page.getByText('请填写面试时间',{exact:true})).toBeVisible();
  expect(calls).toBe(0);
  await dialog.locator('.el-date-editor input').fill('2026-11-01 10:00:00');
  await dialog.getByText('反馈结果',{exact:true}).click();
  await expect(page.getByText('请填写面试时间',{exact:true})).toBeHidden();
  await page.screenshot({path:'test-results/pipeline-feedback-1600.png',fullPage:true});
  await page.setViewportSize({width:720,height:1050});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/pipeline-feedback-720.png',fullPage:true});
  await page.getByRole('button',{name:'确认面试安排',exact:true}).click();
  await expect.poll(()=>calls).toBe(1);
  await expect(page.getByRole('button',{name:'确认面试安排',exact:true})).not.toBeEnabled();
  expect(submitted).toEqual({expectedStage:'APPLIED',scheduledAt:'2026-11-01T10:00:00',type:'TECHNICAL',format:'ONLINE',note:''});
  await complete!();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.el-table__row')).toContainText('参加第 1 轮面试');
  await expect(page.locator('.el-table__row')).toContainText('2026-11-01 10:00');
  await page.getByRole('button',{name:'时间表',exact:true}).click();
  await expect(page).toHaveURL(/jd-collector\/\?postingId=801/);
});

test('初筛不通过无需面试时间；失败保留输入，成功后结束并禁止再次记录（隔离模拟）',async({page})=>{
  let rejected=false;
  let calls=0;
  let submitted:Record<string,unknown>={};
  await setup(page,()=>({...posting,stage:rejected?'REJECTED':'APPLIED'}));
  await page.route('**/api/postings/801/result',r=>{
    calls++;submitted=r.request().postDataJSON();
    if(calls===1)return r.fulfill({status:500,json:{code:50001,msg:'模拟反馈保存失败'}});
    rejected=true;return r.fulfill({json:{code:200,result:{...posting,stage:'REJECTED'}}});
  });
  await page.goto('./pipeline');
  await page.getByRole('button',{name:'记录反馈',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await expect.poll(()=>dialog.evaluate(el=>getComputedStyle(el).transform)).toBe('none');
  await dialog.getByText('初筛不通过',{exact:true}).click();
  await expect(dialog.getByText('面试时间',{exact:true})).toHaveCount(0);
  await dialog.locator('textarea').fill('招聘方表示经验不符');
  await page.getByRole('button',{name:'确认记录',exact:true}).click();
  await expect(page.getByText('模拟反馈保存失败',{exact:true})).toBeVisible();
  await expect(dialog.locator('textarea')).toHaveValue('招聘方表示经验不符');
  await dialog.locator('textarea').fill('');
  await page.getByRole('button',{name:'确认记录',exact:true}).click();
  await expect(dialog).toBeHidden();
  expect(submitted).toEqual({expectedStage:'APPLIED',result:'REJECTED',note:''});
  await expect(page.locator('.el-table__row')).toContainText('被拒');
  await expect(page.locator('.el-table__row')).toContainText('已结束');
  await expect(page.getByRole('button',{name:'记录反馈',exact:true})).toHaveCount(0);
});

test('面试后与Offer阶段仅展示对应结果；面试详情可调整类型形式（隔离模拟）',async({page})=>{
  let stage='INTERVIEW';
  await setup(page,()=>({...posting,stage}));
  await page.goto('./pipeline');
  await page.getByRole('button',{name:'记录反馈',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await expect.poll(()=>dialog.evaluate(el=>getComputedStyle(el).transform)).toBe('none');
  await expect(dialog.getByText('安排下一轮面试',{exact:true})).toBeVisible();
  await expect(dialog.getByText('收到 Offer',{exact:true})).toBeVisible();
  await expect(dialog.getByText('面试未通过',{exact:true})).toBeVisible();
  await expect(dialog.getByText('初筛不通过',{exact:true})).toHaveCount(0);
  await dialog.getByRole('button',{name:/面试细节/}).click();
  await expect(dialog.getByText('面试类型',{exact:true})).toBeVisible();
  await expect(dialog.getByText('面试形式',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'取消',exact:true}).click();
  stage='OFFER';await page.reload();
  await page.getByRole('button',{name:'记录反馈',exact:true}).click();
  await expect(dialog.locator('.el-radio-button')).toHaveCount(2);
  await expect(dialog.getByText('接受 Offer',{exact:true})).toBeVisible();
  await expect(dialog.getByText('放弃 Offer',{exact:true})).toBeVisible();
  await expect(dialog.getByText('面试时间',{exact:true})).toHaveCount(0);
});
