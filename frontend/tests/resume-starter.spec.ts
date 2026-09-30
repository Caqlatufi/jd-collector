import {expect, test} from './native/harness.mjs';

test('新增简历使用接口返回的本地模板和照片，进入对应编辑页（模拟接口）', async ({page}) => {
  const starter = {contentMarkdown: '# 夹具候选人\n\n## 技术能力\n\n平台开发',
    templateKey: 'CLASSIC_BLUE', photoUrl: '/resume/photo.png', versionLabel: 'fixture-v1'};
  let saved: Record<string, unknown> | undefined;
  await page.route('**/api/**', route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/resume-starter')) return route.fulfill({json: {code: 200, result: starter}});
    if (pathname.endsWith('/resume-versions') && route.request().method() === 'POST') {
      saved = route.request().postDataJSON();
      return route.fulfill({json: {code: 200, result: {id: 9901, ...saved, blockCount: 1, contentReady: true}}});
    }
    if (pathname.endsWith('/resume-versions/9901')) {
      return route.fulfill({json: {code: 200, result: {id: 9901, ...saved, blockCount: 1, contentReady: true}}});
    }
    if (route.request().method() !== 'GET') return route.abort();
    return route.fulfill({json: {code: 200, result: []}});
  });
  await page.goto('./resumes');
  await page.getByRole('button', {name: '新增版本'}).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('.el-form-item').filter({hasText: '版本名称'}).locator('input').fill('配置模板版');
  await expect(dialog.locator('.el-form-item').filter({hasText: '版本标签'}).locator('input')).toHaveValue('fixture-v1');
  await dialog.getByRole('button', {name: '创建并编辑'}).click();
  await expect(page).toHaveURL(/resumes\/9901\/edit$/);
  expect(saved?.contentMarkdown).toBe(starter.contentMarkdown);
  expect(saved?.photoUrl).toBe('/resume/photo.png');
  await expect(page.locator('textarea')).toHaveValue(starter.contentMarkdown);
});

test('模板加载失败时保留列表且不创建空白简历（模拟接口）', async ({page}) => {
  let writes = 0;
  await page.route('**/api/**', route => {
    if (route.request().method() !== 'GET') { writes++; return route.abort(); }
    if (new URL(route.request().url()).pathname.endsWith('/resume-starter')) {
      return route.fulfill({status: 500, json: {code: 50001, msg: '配置夹具读取失败'}});
    }
    return route.fulfill({json: {code: 200, result: []}});
  });
  await page.goto('./resumes');
  await page.getByRole('button', {name: '新增版本'}).click();
  await expect(page.getByText('配置夹具读取失败')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(writes).toBe(0);
});
