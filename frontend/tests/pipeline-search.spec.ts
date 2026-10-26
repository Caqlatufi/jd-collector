import {expect, test, type Page} from './native/harness.mjs';

const base = {
  id: 801, companyId: 901, companyName: 'Example科技', title: 'AI全栈工程师', direction: 'FULL_STACK',
  source: 'BOSS', rawJd: '独立开发业务系统', tier: 'A', totalScore: 75, stage: 'APPLIED',
  appliedAt: '2026-10-08T09:00:00', resumeVersionId: 701, resumeVersionName: '全栈简历',
};
const postings = [base,
  {...base, id: 802, companyName: '另一家科技', stage: 'INTERVIEW'},
  {...base, id: 803, title: '平台后端工程师', stage: 'CLOSED'},
  {...base, id: 804, title: '尚未投递岗位', stage: 'MESSAGE_SENT', appliedAt: undefined, resumeVersionId: undefined},
];
const paint = (page: Page) => page.evaluate(() =>
  new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

const mockBasics = async (page: Page) => {
  await page.setViewportSize({width: 1665, height: 1000});
  await page.route('**/api/**', async route => {
    if (route.request().method() !== 'GET') return route.abort();
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/companies')) return route.fulfill({json: {code: 200, result: [], page: {totalElements: 0}}});
    if (path.endsWith('/resume-versions')) return route.fulfill({json: {code: 200, result: []}});
    return route.continue();
  });
};

test('已投递阶段跳转精确岗位，名称模糊搜索支持公司、同名岗位、筛选及刷新（模拟只读）', async ({page}) => {
  await mockBasics(page);
  await page.route('**/api/postings?*', route => route.fulfill({json: {
    code: 200, result: postings, page: {totalElements: postings.length, totalPages: 1},
  }}));
  await page.goto('./postings');
  const applied = page.locator('.el-table__row').filter({hasText: base.companyName}).filter({hasText: base.title});
  const closed = page.locator('.el-table__row').filter({hasText: '平台后端工程师'});
  const unapplied = page.locator('.el-table__row').filter({hasText: '尚未投递岗位'});
  await expect(applied.getByRole('button', {name: '打招呼', exact: true})).toHaveCount(0);
  await expect(closed.getByRole('button', {name: '打招呼', exact: true})).toHaveCount(0);
  await expect(page.getByText('已在 Pipeline', {exact: true})).toHaveCount(0);
  await expect(unapplied.getByRole('button', {name: '打招呼', exact: true})).toBeVisible();
  await expect(unapplied.getByRole('button', {name: '投递', exact: true})).toBeVisible();
  await paint(page);
  await applied.getByRole('button', {name: '已投递', exact: true}).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('keyword')).toBe(base.title);
  expect(new URL(page.url()).searchParams.get('postingId')).toBe(String(base.id));
  const search = page.getByRole('textbox', {name: '搜索公司或岗位名称'});
  await expect(search).toHaveValue(base.title);
  await expect(page.locator('.el-table__row')).toHaveCount(1);
  await expect(page.locator('.el-table__row')).toContainText(base.companyName);
  await page.reload();
  await expect(search).toHaveValue(base.title);
  await expect(page.locator('.el-table__row')).toHaveCount(1);

  await search.fill('全栈');
  await expect.poll(() => new URL(page.url()).searchParams.has('postingId')).toBe(false);
  await expect(page.locator('.el-table__row')).toHaveCount(2);
  await page.getByRole('button', {name: /^面试\s*1$/}).click();
  await expect(page.locator('.el-table__row')).toHaveCount(1);
  await expect(page.locator('.el-table__row')).toContainText('另一家科技');
  await expect(search).toHaveValue('全栈');
  await page.reload();
  await expect(page.locator('.el-table__row')).toHaveCount(1);
  await expect(search).toHaveValue('全栈');
  await page.goto('./pipeline?keyword=%20EXAMPLE%20');
  await expect(page.locator('.el-table__row')).toHaveCount(2);
  await search.fill('不存在的公司');
  await expect(page.locator('.el-table__row')).toHaveCount(0);
  await expect(page.getByText('没有匹配的投递记录，请调整搜索或筛选条件', {exact: true})).toBeVisible();
  await search.fill('');
  await expect(page.locator('.el-table__row')).toHaveCount(3);
  await expect(page.locator('.el-table__row').filter({hasText: '尚未投递岗位'})).toHaveCount(0);

  await page.goto('./postings');
  await expect(closed).toBeVisible();
  await paint(page);
  await closed.getByRole('button', {name: '已关闭', exact: true}).click();
  await expect(page.locator('.el-table__row')).toHaveCount(1);
  await expect(page.locator('.el-table__row')).toContainText('平台后端工程师');
  await page.getByRole('button', {name: '查看全部岗位', exact: true}).click();
  await expect(search).toHaveValue('');
  await expect(page.locator('.el-table__row')).toHaveCount(3);
  await page.setViewportSize({width: 720, height: 1000});
  await expect(search).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await paint(page);
  await page.screenshot({path: 'test-results/pipeline-search-720.png'});
});

test('Pipeline名称搜索覆盖第二页，保留计划时间图的岗位定位入口（模拟只读）', async ({page}) => {
  await mockBasics(page);
  const requested: number[] = [];
  await page.route('**/api/postings?*', route => {
    const number = Number(new URL(route.request().url()).searchParams.get('number') || 1);
    requested.push(number);
    const result = number === 1
      ? Array.from({length: 100}, (_, index) => ({...base, id: index + 1, stage: 'SCREENED', appliedAt: undefined}))
      : [base];
    return route.fulfill({json: {code: 200, result, page: {totalElements: 101, totalPages: 2}}});
  });
  await page.goto('./pipeline?keyword=example');
  await expect(page.locator('.el-table__row')).toHaveCount(1);
  expect(requested).toEqual([1, 2]);
  await page.goto('./pipeline?postingId=801');
  await expect(page.locator('.el-table__row')).toHaveCount(1);
  await expect(page.locator('.el-table__row')).toContainText(base.title);
  await expect(page.getByRole('textbox', {name: '搜索公司或岗位名称'})).toHaveValue('');
  await page.getByRole('button', {name: '查看全部岗位', exact: true}).click();
  await expect.poll(() => new URL(page.url()).searchParams.has('postingId')).toBe(false);
  await expect(page.locator('.el-table__row')).toHaveCount(1);
});

test('真实本机只读：JD已投递链接与Pipeline搜索结果一致，不写入岗位数据', async ({page}) => {
  await page.setViewportSize({width: 1665, height: 1000});
  const response = await (await page.request.get('./api/postings?size=100')).json();
  const posting = response.result.find((row: {appliedAt?: string; stage: string}) => row.appliedAt || row.stage === 'APPLIED');
  expect(Boolean(posting)).toBe(true);
  await page.route('**/api/**', route => route.request().method() === 'GET' ? route.continue() : route.abort());
  await page.goto('./postings');
  const row = page.locator('.el-table__row').filter({hasText: posting.title}).filter({hasText: posting.companyName});
  await expect(row.getByRole('button', {name: '打招呼', exact: true})).toHaveCount(0);
  await paint(page);
  await row.getByRole('button', {name: '已投递', exact: true}).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('postingId')).toBe(String(posting.id));
  await expect(page.getByRole('textbox', {name: '搜索公司或岗位名称'})).toHaveValue(posting.title);
  await expect(page.locator('.el-table__row')).toHaveCount(1);
  await expect(page.locator('.el-table__row')).toContainText(posting.companyName);
  await paint(page);
  await page.screenshot({path: 'test-results/pipeline-jd-jump.png'});
});
