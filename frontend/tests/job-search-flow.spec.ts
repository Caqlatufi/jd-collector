import {expect, test, type Locator, type Page} from './native/harness.mjs';

const formItem = (scope: Locator, label: string): Locator =>
  scope.locator('.el-form-item').filter({hasText: label}).first();

const selectOption = async (page: Page, scope: Locator, label: string, option: string) => {
  await formItem(scope, label).locator('.el-select').click();
  await page.getByRole('option', {name: option, exact: true}).click();
};

test('本地单用户求职主链路可从页面完成', async ({page}) => {
  const suffix = Date.now().toString().slice(-7);
  const companyName = `E2E验收公司-${suffix}`;
  const jobTitle = `Java AI 平台工程师-${suffix}`;
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  await page.goto('./');
  await expect(page.getByRole('heading', {name: '今日看板'})).toBeVisible();
  await expect(page.getByText('后端已连接')).toBeVisible();
  await expect(page.getByText('登录')).toHaveCount(0);
  await expect(page.locator('.app-header .top-navigation')).toBeVisible();
  await expect(page.locator('.sidebar')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.getByRole('menuitem', {name: '公司库'}).click();
  await page.getByRole('button', {name: '新增公司'}).click();
  let dialog = page.getByRole('dialog');
  await formItem(dialog, '公司名称').locator('input').fill(companyName);
  await formItem(dialog, '办公地址').locator('input').fill('上海市闵行区');
  await page.getByRole('button', {name: '保存', exact: true}).click();
  await expect(page.getByText(companyName, {exact: true})).toBeVisible();

  const companyRow = page.locator('.el-table__row').filter({hasText: companyName});
  await companyRow.getByRole('button', {name: '查看 JD'}).click();
  await expect(page.locator('.toolbar-search .el-select').first()).toContainText(companyName);

  await page.getByRole('menuitem', {name: '简历版本'}).click();
  await expect(page.getByText('标准版简历', {exact: true})).toBeVisible();
  await expect(page.getByText('标准 Master', {exact: true})).toBeVisible();

  await page.getByRole('menuitem', {name: 'JD 列表'}).click();
  await page.getByRole('button', {name: '新增 JD'}).click();
  dialog = page.getByRole('dialog');
  await selectOption(page, dialog, '公司', companyName);
  await formItem(dialog, '岗位名称').locator('input').fill(jobTitle);
  await formItem(dialog, '地点').locator('input').fill('上海闵行');
  await formItem(dialog, 'JD 原文').locator('textarea').fill('负责 Java Spring Boot 后端、AI Agent 应用和平台工具开发。');
  await formItem(dialog, '必选技术').locator('textarea').fill('Java\nSpring Boot\nLLM');
  await formItem(dialog, '自身匹配点').locator('textarea').fill('Java 全栈、Agent 工具调用、平台开发');
  await formItem(dialog, '匹配度 /35').locator('input').fill('25');
  await formItem(dialog, '公司 /20').locator('input').fill('15');
  await formItem(dialog, '新鲜度 /15').locator('input').fill('10');
  await formItem(dialog, '通勤 /15').locator('input').fill('10');
  await formItem(dialog, '薪资 /15').locator('input').fill('10');
  await page.getByRole('button', {name: '保存并评分'}).click();
  await expect(page.getByText(jobTitle, {exact: true})).toBeVisible();
  await expect(page.locator('.el-table__row').filter({hasText: jobTitle}).getByText('A 档', {exact: true})).toBeVisible();
  await page.locator('.el-table__row').filter({hasText: jobTitle}).getByRole('button', {name: '详情'}).click();
  await expect(page.getByRole('heading', {name: 'JD 原文'})).toBeVisible();
  await expect(page.getByText('负责 Java Spring Boot 后端、AI Agent 应用和平台工具开发。', {exact: true})).toBeVisible();
  await page.locator('.el-drawer__close-btn').click();

  await page.getByRole('menuitem', {name: '投递 Pipeline'}).click();
  await expect(page.getByText(jobTitle, {exact: true})).toHaveCount(0);
  await page.getByRole('menuitem', {name: 'JD 列表'}).click();
  const jdRow = page.locator('.el-table__row').filter({hasText: jobTitle});
  await jdRow.getByRole('button', {name: '投递', exact: true}).click();
  dialog = page.getByRole('dialog');
  await formItem(dialog, '实际使用简历').locator('.el-select').click();
  await page.getByRole('option').filter({hasText: '标准版简历'}).click();
  await page.getByRole('button', {name: '确认已投递'}).click();
  await expect(jdRow.getByText('已在 Pipeline', {exact: true})).toBeVisible();

  await page.getByRole('menuitem', {name: '投递 Pipeline'}).click();
  const jobRow = page.locator('.el-table__row').filter({hasText: jobTitle});
  await jobRow.getByRole('button', {name: '推进'}).click();
  dialog = page.getByRole('dialog');
  await selectOption(page, dialog, '目标阶段', 'HR 沟通');
  await formItem(dialog, '下一步动作').locator('input').fill('三天后跟进 HR');
  await formItem(dialog, '下一步时间').locator('input').fill(`${tomorrow} 10:00:00`);
  await page.getByRole('button', {name: '确认更新'}).click();
  await expect(jobRow.getByText('HR 沟通', {exact: true})).toBeVisible();

  await page.getByRole('menuitem', {name: '简历版本'}).click();
  const masterCard = page.locator('.resource-card').filter({hasText: '标准版简历'});
  await masterCard.getByRole('button', {name: '使用记录'}).click();
  await expect(page.getByText(jobTitle, {exact: true})).toBeVisible();
  await page.locator('.el-drawer__close-btn').click();

  await page.getByRole('menuitem', {name: '面试记录'}).click();
  await page.getByRole('button', {name: '安排面试'}).click();
  dialog = page.getByRole('dialog');
  await selectOption(page, dialog, '岗位', `${companyName} · ${jobTitle} · HR 沟通`);
  await formItem(dialog, '面试官 / 角色').locator('input').fill('技术负责人');
  await formItem(dialog, '下一步 / 改进项').locator('textarea').fill('准备 示例项目 深度故事');
  await page.getByRole('button', {name: '保存', exact: true}).click();
  await expect(page.getByText(jobTitle, {exact: true})).toBeVisible();

  await page.getByRole('menuitem', {name: '今日看板'}).click();
  await expect(page.getByText(jobTitle, {exact: false})).toBeVisible();

  await page.getByRole('menuitem', {name: '面试记录'}).click();
  const interviewRow = page.locator('.el-table__row').filter({hasText: jobTitle});
  await interviewRow.getByRole('button', {name: '记录/调整'}).click();
  dialog = page.getByRole('dialog');
  await selectOption(page, dialog, '面试状态', '已完成');
  await formItem(dialog, '面试问题').locator('textarea').fill('如何设计可观测的 Agent 工具调用链路？');
  await formItem(dialog, '表现与反馈').locator('textarea').fill('回答覆盖日志、指标、追踪与失败恢复。');
  await formItem(dialog, '下一步 / 改进项').locator('textarea').fill('补充 示例项目 的容量与故障案例');
  await page.getByRole('button', {name: '保存', exact: true}).click();
  await expect(interviewRow.getByText('已完成', {exact: true})).toBeVisible();

  await page.getByRole('menuitem', {name: 'JD 列表'}).click();
  await page.locator('.el-table__row').filter({hasText: jobTitle}).getByRole('button', {name: '详情'}).click();
  await expect(page.getByText('已完成', {exact: true})).toBeVisible();
  await page.locator('.el-drawer__close-btn').click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', {name: '导出 CSV'}).click();
  await expect((await download).suggestedFilename()).toContain('jd-collector');
});
