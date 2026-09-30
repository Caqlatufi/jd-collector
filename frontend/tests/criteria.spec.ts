import {expect, test} from './native/harness.mjs';
import fs from 'node:fs';
import type {CriteriaResponse} from '../src/criteria/model';

function fixture(): CriteriaResponse {
  const document = JSON.parse(fs.readFileSync('../config/criteria.example.json', 'utf8'));
  for (const section of document.sections) {
    for (const field of section.fields) {
      field.value = null;
      field.status = 'PENDING';
    }
  }
  document.sections[0].fields[0].value = '15K以上';
  document.sections[0].fields[0].status = 'CONFIRMED';
  const work = document.sections.find((s: {id: string}) => s.id === 'work');
  work.fields.find((f: {id: string}) => f.id === 'work-8').value = '不派遣，可以第三方签约，不外包';
  return {revision: 'a'.repeat(64), document};
}

test('JD门槛从列表按钮进入，不占一级菜单（只读）', async ({page}) => {
  await page.route('**/api/**', route => {
    if (route.request().method() !== 'GET') return route.abort();
    if (new URL(route.request().url()).pathname.endsWith('/api/criteria')) {
      return route.fulfill({json: {code: 200, result: fixture()}});
    }
    return route.fulfill({json: {code: 200, result: [], page: {number: 0, size: 100, totalElements: 0}}});
  });
  await page.goto('./postings');
  await expect(page.getByRole('menuitem', {name: 'JD门槛', exact: true})).toHaveCount(0);
  await page.getByRole('button', {name: 'JD门槛', exact: true}).click();
  await expect(page).toHaveURL(/criteria$/);
  await expect(page.getByRole('heading', {name: 'JD门槛', exact: true})).toBeVisible();
  await expect(page.getByRole('menuitem', {name: 'JD 列表', exact: true})).toHaveClass(/is-active/);
  await page.reload();
  await expect(page.getByRole('heading', {name: 'JD门槛', exact: true})).toBeVisible();
  await page.getByRole('menuitem', {name: 'JD 列表', exact: true}).click();
  await expect(page).toHaveURL(/postings$/);
});

test('精简选择题、其他原文、保存与清空回读（模拟写入）', async ({page}) => {
  let stored = fixture();
  let puts = 0;
  await page.route('**/api/**', route => {
    if (new URL(route.request().url()).pathname.endsWith('/api/criteria')) {
      if (route.request().method() === 'PUT') {
        puts++;
        const body = route.request().postDataJSON();
        expect(body.revision).toBe(stored.revision);
        expect(body.answers).toHaveLength(20);
        for (const section of stored.document.sections) {
          for (const field of section.fields) Object.assign(field, body.answers.find((a: {id: string}) => a.id === field.id));
        }
        stored.revision = 'b'.repeat(64);
      }
      return route.fulfill({json: {code: 200, result: stored}});
    }
    return route.request().method() === 'GET' ? route.continue() : route.abort();
  });
  await page.goto('./criteria');
  await expect(page.getByText('已填 2 / 20', {exact: true})).toBeVisible();
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByRole('navigation', {name: '门槛分组'}).getByRole('button')).toHaveCount(4);
  const salary = page.locator('[data-field="salary-1"]');
  await expect(salary.getByRole('radio', {name: '15K以上', exact: true})).toBeChecked();
  await salary.getByRole('radio', {name: '18K以上', exact: true}).check();
  await page.getByRole('button', {name: '工作安排', exact: true}).click();
  const contract = page.locator('[data-field="work-8"]');
  await expect(contract.getByRole('radio', {name: '其他', exact: true})).toBeChecked();
  await expect(contract.getByRole('textbox')).toHaveValue('不派遣，可以第三方签约，不外包');
  await contract.getByRole('textbox').fill('可以第三方签约，但不能驻场或派遣');
  await contract.getByRole('radio', {name: '只接受公司直签', exact: true}).check();
  await contract.getByRole('radio', {name: '其他', exact: true}).check();
  await expect(contract.getByRole('textbox')).toHaveValue('可以第三方签约，但不能驻场或派遣');
  await page.getByRole('button', {name: '保存门槛', exact: true}).click();
  await expect(page.getByText('答案已保留', {exact: true})).toBeVisible();
  expect(puts).toBe(1);
  expect(stored.document.sections.flatMap(s => s.fields).filter(f => f.value).every(f => f.status === 'CONFIRMED')).toBe(true);
  await page.reload();
  await expect(salary.getByRole('radio', {name: '18K以上', exact: true})).toBeChecked();
  await page.getByRole('button', {name: '工作安排', exact: true}).click();
  await expect(contract.getByRole('textbox')).toHaveValue('可以第三方签约，但不能驻场或派遣');
  await contract.getByRole('button', {name: '清空：签约和外包', exact: true}).click();
  await page.getByRole('button', {name: '保存门槛', exact: true}).click();
  await expect(page.getByText('答案已保留', {exact: true})).toBeVisible();
  const cleared = stored.document.sections.flatMap(s => s.fields).find(f => f.id === 'work-8')!;
  expect(cleared.value).toBeNull();
  expect(cleared.status).toBe('PENDING');
  for (const group of ['薪资', '工作安排', '岗位与通勤', '其他偏好']) {
    await page.getByRole('navigation', {name: '门槛分组'}).getByRole('button', {name: group, exact: true}).click();
    expect(await page.getByRole('radio', {name: '其他', exact: true}).count()).toBe(
      await page.locator('[data-field]').count(),
    );
  }
  for (const width of [1000, 720]) {
    await page.setViewportSize({width, height: 1440});
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole('button', {name: '工作安排', exact: true}).click();
  await page.screenshot({path: 'test-results/criteria-simple-720.png', fullPage: true});
});

test('加载失败可重试，保存冲突及取消离开保留其他输入（模拟接口）', async ({page}) => {
  let failLoad = true;
  await page.route('**/api/**', route => {
    if (new URL(route.request().url()).pathname.endsWith('/api/criteria')) {
      if (route.request().method() === 'PUT') {
        return route.fulfill({status: 409, json: {code: 40901, msg: '文件已被修改，请重新加载后合并。'}});
      }
      if (failLoad) return route.fulfill({status: 500, json: {code: 50001, msg: '文件格式无效'}});
      return route.fulfill({json: {code: 200, result: fixture()}});
    }
    return route.request().method() === 'GET' ? route.continue() : route.abort();
  });
  await page.goto('./criteria');
  await expect(page.getByText('文件格式无效', {exact: true})).toBeVisible();
  failLoad = false;
  await page.getByRole('button', {name: '重新加载', exact: true}).click();
  const salary = page.locator('[data-field="salary-1"]');
  await salary.getByRole('radio', {name: '其他', exact: true}).check();
  await salary.getByRole('textbox').fill('18K，特殊公司可以谈');
  await page.getByRole('button', {name: '保存门槛', exact: true}).click();
  await expect(page.getByText('文件已被修改，请重新加载后合并。')).toBeVisible();
  await expect(salary.getByRole('textbox')).toHaveValue('18K，特殊公司可以谈');
  await page.getByRole('menuitem', {name: 'JD 列表', exact: true}).click();
  await page.getByRole('button', {name: '继续填写', exact: true}).click();
  await expect(page).toHaveURL(/criteria$/);
  await expect(salary.getByRole('textbox')).toHaveValue('18K，特殊公司可以谈');
});
