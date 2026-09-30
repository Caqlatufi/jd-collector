---
name: jd-liepin
description: 在 JD Collector 的 Electron 内处理猎聘岗位请求。用户要求在猎聘登录、查找、核实、采集或更新职位时使用；复用内置平台登录，不要求用户选择标签或手动读取。
---

# 猎聘岗位 workflow

## 入口与边界

项目：`项目根目录`。先读取项目 AGENTS.md 及本 Skill 的 [公共操作规则](../platform-workflow.md)，按其顺序执行；不要要求用户操作“读取标签”。
平台代码：`LIEPIN`；官方主站：`https://www.liepin.com/`。
领域适配：`frontend/src/account/adapters/platforms.ts` 中本平台配置；共享原生执行由 app 装配，不把 Electron 导入业务模块。

识别核心统一为 `gpt-6-astra` / `medium`；进行图片识别时完整读取 [标准Prompt](../jd-vision-prompt.md)。原生 capture/scroll/click/type 已接入；使用公共操作规则中的命令取图，不退回旧 DOM 读取。

## 本平台步骤

1. 在项目 frontend 运行 `node src/app/electron/workflow.mjs LIEPIN open`，再 `LIEPIN tabs` 确认页面。
2. 若用户本轮只要求登录，保持页面打开交给本人，不擅自采集。本人登录/验证完成后才继续需要认证的操作。
3. 区域搜索先读 本地 `local/JD搜索任务单-猎聘.md`（未建立时参考 [任务单示例](../../../config/search-task.example.md)），按公共规则设置并截图核验地点、经验、薪资、规模及工作安排，再浏览列表。经验主搜与补搜档位以本地门槛和任务单为准；平台档位以当前页面为准，未支持的条件明确记缺口。公开官方域链接只作补充线索，不使用第三方摘要替代真实原文。
4. 用 `LIEPIN navigate "<已核实的官方岗位URL>" [key]` 定位，`LIEPIN tabs` 确认目标；focus 明确目标后 capture 取得原生图片，再交 Astra/medium 按标准 Prompt 识别。URL 必须属于本平台注册域；不编造搜索 API 或绕过验证。
5. 按公共规则核对后，只在用户授权采集/更新时走现有 JD HTTP 接口。报告链接、时间、缺口和已保存数量。

## 本平台真实性

原生截图、受限输入和旧 DOM 退役已实现。2026-09-09 已执行本平台真实详情 → Astra/medium → 主 Agent 对图复核 → 独立 H2 的真实 HTTP 保存、来源查重及状态回读。结果仅代表该样本与当次页面，不代表全站搜索覆盖、长期认证或所有岗位符合门槛。遇到登录、验证码、空页或无法辨识的图，停止相应操作交本人处理。

## 视觉操作要点

- 首先看“暂停招聘”提示；失效详情下的推荐卡片是其他岗位，不得拼入失效岗位。已暂停的原申通、上海科学智能研究院样本不作有效 JD。
- 详情头部有标题、薪资、年限和更新文字，右侧公司区可有“职位地址”；公司简介或注册地址不能代替岗位地址。
- 通过截图点击推荐卡片可新开详情，tabs 重新定位 key。正文滚至“其他信息”核对结束；避开“投简历”“聊一聊”。
