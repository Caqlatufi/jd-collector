import {expect, test} from './native/harness.mjs';

const markdown = `# 示例候选人

> Java 后端 / AI 应用全栈工程师

- 上海

## 职业定位

聚焦 Java 平台后端与 AI 应用交付。

<script>window.__resumeInjected = true</script>
`;

const detail = {
  id: 701,
  name: '标准版简历',
  type: 'MASTER',
  versionLabel: '2026.09-v2',
  contentMarkdown: markdown,
  templateKey: 'CLASSIC_BLUE',
  photoUrl: '',
  active: true,
  notes: 'Markdown 标准版',
  blockCount: 2,
  contentReady: true,
  createdAt: '2026-09-07T10:00:00',
  updatedAt: '2026-09-07T10:00:00',
};

test('简历卡片进入编辑页，安全渲染 Markdown 并保存内容块与导出 PDF', async ({page}) => {
  let saved: Record<string, unknown> = {};
  await page.addInitScript(() => {
    Object.defineProperty(window, 'print', {
      configurable: true,
      value: () => { (window as typeof window & {__printCalled?: number}).__printCalled = 1; },
    });
  });
  await page.route('**/api/resume-versions', route => route.fulfill({
    json: {code: 200, msg: 'ok', result: [{...detail, contentMarkdown: undefined}]},
  }));
  await page.route('**/api/resume-versions/701', async route => {
    if (route.request().method() === 'PUT') {
      saved = route.request().postDataJSON();
      await route.fulfill({json: {code: 200, msg: 'ok', result: {...detail, ...saved, blockCount: 3}}});
      return;
    }
    await route.fulfill({json: {code: 200, msg: 'ok', result: detail}});
  });

  await page.goto('./resumes');
  await page.getByRole('heading', {name: '标准版简历'}).click();
  await expect(page).toHaveURL(/\/resumes\/701\/edit$/);

  const editor = page.locator('textarea');
  await expect(editor).toHaveValue(/聚焦 Java 平台后端与 AI 应用交付。/);
  await expect(page.locator('.resume-paper')).toContainText('职业定位');
  await expect(page.locator('.resume-paper script')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as typeof window & {__resumeInjected?: boolean}).__resumeInjected)).toBeUndefined();

  const changed = markdown.replace('AI 应用交付', 'AI Agent 应用交付');
  await editor.fill(changed);
  await expect(page.locator('.resume-paper')).toContainText('AI Agent 应用交付');
  await page.getByRole('button', {name: '保存简历'}).click();
  await expect.poll(() => saved.contentMarkdown).toBe(changed);
  await expect(page.getByText('已保存 · 3 个内容块')).toBeVisible();

  await page.getByRole('button', {name: '独立预览'}).click();
  await expect(page).toHaveURL(/\/resumes\/701\/view$/);
  await page.getByRole('button', {name: '下载 PDF'}).click();
  await expect.poll(() => page.evaluate(() => (window as typeof window & {__printCalled?: number}).__printCalled)).toBe(1);
});
