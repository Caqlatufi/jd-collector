# 简历编辑与PDF输出

负责简历正文的Markdown编辑、事务切片、A4实时预览和浏览器打印PDF。复用[版本管理](07-简历版本管理.md)的版本身份与启停规则；不新建重复版本接口。本文件保留v0.2方案与原验收证据，历史完成记录不代表本次重新验证。

## 1. 需求分析

### 背景

现有简历版本只关联外部 DOCX 路径，系统无法直接读取、编辑、切片或渲染内容；Agent 生成的 DOCX 也难以稳定保持版式。已有 `早期独立简历页面` 证明“网页 UI + 浏览器打印 PDF”更适合当前简历工作流，但旧页面把内容与样式写在一个 HTML 中，无法管理多个版本，且曾出现第二页大面积空白。

### 需求目标

| 目标 | 结果 |
| --- | --- |
| 内容内置 | 简历正文存入 JD Collector，不再依赖外部 DOCX |
| Agent 友好 | 使用 Markdown 作为唯一可编辑内容源 |
| 区块切片 | 保存时按标题和段落生成稳定、可检索的内容块 |
| 页面化简历 | 每个版本可进入独立编辑页和 A4 预览页 |
| PDF 输出 | 从简历页面调用浏览器打印，保存高质量 PDF |
| 样式复用 | 建立项目内 `resume-page` Skill，约束后续版本页面质量 |

### 使用对象

- 候选人：编辑版本、预览版式、打印 PDF、查看使用记录。
- Codex：依据 Skill 将最新版 Word 或定向材料转为 Markdown，并维护 Vue 简历页面。

### v0.2 本期范围

- 简历列表点击卡片进入 `/resumes/{id}/edit`。
- 编辑元数据和 Markdown 正文，提供实时 A4 预览。
- 独立 `/resumes/{id}/view` 打印页面和“下载 PDF”按钮。
- Markdown 保存、读取及派生内容块查询。
- 以最新版 Word 内容初始化标准版，沿用旧 HTML 的蓝色专业视觉与照片。
- 复用[简历版本管理](07-简历版本管理.md)的唯一Master和历史关联规则；本功能不另维护版本生命周期。

### 本期边界

- Markdown 是内容源，Vue/CSS 是排版源；不允许在 Markdown 中写任意 HTML。
- PDF 由浏览器原生打印对话框保存，不在数据库保存 PDF 二进制。
- 内容块是 Markdown 的派生索引，不能绕过正文单独编辑。
- 不继续维护 DOCX 路径；旧 `relativePath` 仅作为数据库兼容字段保留，不在页面展示。
- 不为每个简历版本生成一套重复的编译期 Vue 文件；统一页面模板按版本内容渲染。

### 核心需求

#### Markdown 结构

正文采用 ATX 标题：一级标题为姓名，引用块为目标岗位，二级标题为一级简历区块，三级/四级标题表示公司与项目。列表、粗体和普通段落用于经历描述；照片地址作为版本元数据管理。

#### 区块与切片

保存 Markdown 后按 `##` 区块、`###/####` 子区块和段落边界切片；单块过长时按段落拆分，保留区块标题、顺序、纯文本、字符数和内容哈希。每次保存事务内全量重建当前版本的派生块。

#### 页面与 PDF

编辑页采用“Markdown 编辑器 + A4 实时预览”；查看页只保留简历和工具条。打印时隐藏应用导航、工具条和编辑器，使用 A4、零浏览器页边距、精确颜色和避免标题孤行的分页规则。

### 接口与后台边界

后端负责 Markdown、版本、切片和持久化；前端负责 Markdown 安全渲染、编辑体验、A4 样式和浏览器打印。列表接口返回摘要，详情接口返回完整 Markdown，切片接口用于调试和后续 Agent 检索。

### 版本与兼容策略

- 编辑输出能力沿用v0.2口径。
- 既有简历 ID、类型、启停状态及岗位关联不变。
- 旧路径列保留内部兼容值；保存新内容后不再读取外部文件。
- 没有 Markdown 的旧版本在编辑页显示待迁移状态；标准版在本期写入最新版 Word 转换结果。

### 成功标准

- 点击任一简历卡片可进入对应编辑页。
- 保存后刷新内容不丢失，派生块顺序和哈希稳定。
- 标准版能以 A4 页面正确呈现，打印预览无异常大空白页。
- “下载 PDF”能打开打印流程，页面只打印简历正文。
- 投递选择和历史使用记录不受影响。

### 工作量预估

| 工作 | 预估 |
| --- | ---: |
| 文档、格式和 Skill | 0.5 天 |
| 后端 Markdown 与切片 | 1 天 |
| 编辑、预览与打印页面 | 1.5 天 |
| 数据初始化与验收 | 0.5–1 天 |

## 2. 架构设计

### 总体架构

```text
简历列表
├─ 点击卡片 -> ResumeEditorPage
│  ├─ 元数据表单
│  ├─ Markdown 编辑器
│  └─ ResumePaper 实时预览
└─ 打开简历 -> ResumeViewPage -> window.print() -> PDF
                       │
                       ▼
ResumeVersionController
└─ ResumeVersionService
   ├─ jd_resume_version（唯一 Markdown 内容源）
   └─ ResumeBlockService
      └─ jd_resume_content_block（派生切片）
```



### 关键规则矩阵

| 规则 | 口径 |
| --- | --- |
| 内容源 | `contentMarkdown` 是唯一正文源 |
| 渲染 | `markdown-it` 禁用原始 HTML，Vue/CSS 控制版式 |
| 切片 | 保存版本时事务内删除旧块并重建 |
| 块边界 | 优先按 H2/H3/H4，其次按段落；目标每块不超过 1200 字符 |
| PDF | A4 打印 CSS + 浏览器原生打印 |
| 照片 | 版本保存 URL，图片从被忽略的本地文件运行时读取，不保存图片二进制、不打包个人照片 |



### 核心链路

```text
保存编辑
  -> 校验 Markdown 与模板
  -> 保存 ResumeVersion
  -> 解析标题/段落
  -> 生成内容块和 SHA-256
  -> 替换该版本旧块
  -> 同一事务提交

查看/打印
  -> 获取版本详情
  -> Markdown 安全渲染
  -> ResumePaper 应用模板
  -> 打印时隐藏非简历 UI
```

异常分支：正文为空或没有一级姓名标题时拒绝；区块重建失败时版本正文一起回滚；旧版本正文为空时允许进入编辑但不能打印。



### 模块目录与职责边界

图例：`[+]` 新增，`[~]` 修改，`[-]` 删除。

```text
jd-collector
├─ .agents/skills/resume-page
│  ├─ [+] SKILL.md
│  └─ references/[+] visual-system.md
├─ backend/resume/src/main/java/com/jd/resume
│  ├─ model/[~] ResumeVersion.java, ResumeDtos.java
│  ├─ model/[+] ResumeContentBlock.java
│  ├─ repo/[+] ResumeContentBlockRepository.java
│  ├─ service/[~] ResumeVersionService.java
│  ├─ service/[+] ResumeBlockService.java
│  └─ ctrl/[~] ResumeVersionController.java
├─ local/resume/photo.png（运行时读取，不打包，不提交）
└─ frontend/src/resume
      ├─ [~] index.ts
      ├─ api/[~] resumeApi.ts
      ├─ components/[+] ResumePaper.vue
      └─ pages/[+] ResumeEditorPage.vue, ResumeViewPage.vue
```



### 数据与迁移边界

新增字段与新实体表由本地 JPA `ddl-auto=update` 创建。旧 `relative_path` 非空约束为兼容保留，新记录由后端写 `internal://markdown`；本期不需要视图、索引、兼容数据 SQL 或 simple-migration。

### 数据归属

jd_resume_version是正文及编辑元数据的持久化载体；jd_resume_content_block是派生索引，不允许独立编辑。版本类型、启停和投递引用归[简历版本管理](07-简历版本管理.md)。详细字段统一见本文件开发方案。

## 3. 开发方案

### 本地简历配置

`local/resume-starter.md` 为新增版本的初始正文，`JD_RESUME_STARTER_FILE` 可指定其他文件；未配置本地文件时读取打包的匿名示例。`GET /api/resume-starter` 返回正文、模板、照片 URL 和当前年月版本标签，不创建或修改已有版本。明确指定不存在的文件时返回错误，不静默改用示例。

`local/resume/photo.png` 通过 `/resume/photo.png` 提供，`JD_RESUME_PHOTO_FILE` 可覆盖路径；无照片时初始版本不带照片 URL。`JD_RESUME_LEGACY_PHOTO_ROUTE` 可兼容数据库中已保存的旧 URL。模板和照片响应使用 `Cache-Control: no-store`，源码导出不包含这两项。实际简历及内容块继续保存在数据库中。

### 开发目标与首批范围

以 Markdown 替换外部 DOCX 依赖，交付版本详情编辑、事务切片、A4 页面、打印 PDF、标准版内容初始化和项目内简历页面 Skill。

### 模块拆分与实施顺序

| 顺序 | 功能 | 交付结果 |
| ---: | --- | --- |
| 1 | Skill | 从旧 HTML 提炼视觉、分页和内容结构规则 |
| 2 | 存储 | ResumeVersion 增加 Markdown/模板/照片，新增 Block 实体 |
| 3 | 切片 | Markdown 解析、段落分片、纯文本和 SHA-256 |
| 4 | 接口 | 列表摘要、详情保存、区块查询 |
| 5 | 编辑页 | 路由、元数据、Markdown 编辑和实时预览 |
| 6 | 查看/PDF | 独立 A4 页面和打印样式 |
| 7 | 初始化 | 最新 Word 转为标准版 Markdown并写入现有 Master |
| 8 | 验收 | 后端、构建、页面编辑、刷新、打印预览和数据核对 |

### 后端实现约束

- 版本正文和切片必须在同一事务成功。
- 列表响应不返回大段 Markdown；详情接口才返回正文。
- Markdown 至少包含一个 `# ` 姓名标题和一个 `## ` 内容区块。
- 切片器不依赖前端渲染库，只识别 ATX 标题、空行和基础 Markdown 标记。
- `relativePath` 仅写兼容标识，不接受用户编辑。

### 数据模型

字段定义见本节末尾“持久化字段”。保存请求包含：`name`、`type`、`versionLabel`、`contentMarkdown`、`templateKey`、`photoUrl`、`active`、`notes`。区块只由服务生成，不提供保存请求。

### 接口契约

#### 版本列表

`GET /jd-collector/api/resume-versions?active=&type=` 返回摘要数组：`id/name/type/versionLabel/templateKey/photoUrl/active/notes/blockCount/createdAt/updatedAt`。

#### 版本详情

`GET /jd-collector/api/resume-versions/{id}` 返回摘要字段及 `contentMarkdown`。

#### 新增与保存

`POST /jd-collector/api/resume-versions`、`PUT /jd-collector/api/resume-versions/{id}`。

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `name` | String | 是 | ≤120 |
| `type` | Enum | 是 | 合法 ResumeType |
| `versionLabel` | String | 是 | ≤50 |
| `contentMarkdown` | String | 是 | 非空；含 H1 与 H2 |
| `templateKey` | String | 否 | 默认 CLASSIC_BLUE |
| `photoUrl` | String | 否 | ≤500；站内路径 |
| `active` | Boolean | 否 | 默认 true |
| `notes` | String | 否 | 版本说明 |

返回完整详情，并保证区块已经重建。

#### 内容块

`GET /jd-collector/api/resume-versions/{id}/blocks` 返回：`id/sectionKey/heading/headingLevel/chunkIndex/sortOrder/contentMarkdown/contentPlainText/characterCount/contentHash`。

#### 错误码

| code | 触发条件 |
| ---: | --- |
| 40001 | 字段长度、枚举、Markdown 结构或照片 URL 非法 |
| 40401 | 版本不存在 |
| 40901 | 版本状态或 Master 规则冲突 |
| 50001 | 保存或切片事务异常 |

### 前端实现

- `markdown-it` 以 `html:false` 渲染，禁止用户 Markdown 注入 HTML。
- 编辑页保存后更新版本和块数；离开有未保存内容时提示。
- `ResumePaper` 复用 Skill 的 A4 视觉系统，屏幕与打印使用同一 DOM。
- “下载 PDF”调用 `window.print()`；打印媒体隐藏应用壳和按钮。
- 打印 CSS 使用 `@page size:A4; margin:0`、`print-color-adjust:exact`，对公司条、项目标题和其后首段设置分页保护。

### 部署、风险与完成标志

随一体化应用部署，无外部文件服务。风险包括旧列非空约束、Markdown 结构漂移、分页空白和打印设置差异；分别用兼容标识、结构校验、真实打印截图和页面提示控制。接口、编辑、切片、预览、打印、历史投递五条链路全部验证后完成。

### 持久化字段


#### `jd_resume_version`

| 字段 | 类型 | 必填 | 用途/约束 |
| --- | --- | --- | --- |
| `name` | String(120) | 是 | 版本名称 |
| `type` | Enum | 是 | MASTER/AI_APPLICATION/JAVA_BACKEND/FULL_STACK/PLATFORM_ENGINEERING/TARGETED |
| `versionLabel` | String(50) | 是 | 版本标签 |
| `contentMarkdown` | TEXT | 新保存是 | 唯一正文源 |
| `templateKey` | String(40) | 是 | 当前固定 `CLASSIC_BLUE` |
| `photoUrl` | String(500) | 否 | 站内静态资源地址 |
| `relativePath` | String(500) | 兼容 | 旧数据库列，新数据写内部标识 |
| `active` | Boolean | 是 | 是否可用于新投递 |
| `notes` | TEXT | 否 | 版本改动和适用岗位 |

#### `jd_resume_content_block`

| 字段 | 类型 | 必填 | 用途/约束 |
| --- | --- | --- | --- |
| `resumeVersionId` | Long | 是 | 所属版本 |
| `sectionKey` | String(80) | 是 | `profile` 或稳定区块键 |
| `heading` | String(200) | 否 | 当前标题 |
| `headingLevel` | Integer | 是 | 0、2、3、4 |
| `chunkIndex` | Integer | 是 | 同一标题内切片序号 |
| `sortOrder` | Integer | 是 | 全文顺序 |
| `contentMarkdown` | TEXT | 是 | 原始切片 |
| `contentPlainText` | TEXT | 是 | 去标记纯文本 |
| `characterCount` | Integer | 是 | 纯文本字符数 |
| `contentHash` | String(64) | 是 | SHA-256，用于稳定性比较 |

## 4. 验收方案

### 验收范围

唯一Master和投递关联独立用例见[版本管理验收](07-简历版本管理.md#4-验收方案)。本功能验收Markdown新增/编辑、版本详情、内容块、列表跳转、A4 预览、打印 PDF、标准版初始化及投递关联。

### 非验收范围

DOCX 编辑/导出、PDF 二进制存储、第三方云文件和任意 HTML 渲染。

### 验收前置条件

- 一体化应用和本地数据库可用。
- 最新标准 Word 与旧 HTML/照片参考可读取。
- 本机 Chrome 可打开打印预览。
- 标准版现有 ID 和至少一条投递关联可核对。

### 验收通过标准

- 所有 P0 通过，页面、接口、数据库最终状态一致。
- 后端真实 HTTP/集成测试、前端构建、Electron 页面流程和打印截图分别留有结果。
- 保存失败不产生正文与切片不一致。

### 验收矩阵

| 编号 | 优先级 | 场景 | 前置条件 | 操作 | 预期结果 | 责任角色 |
| --- | --- | --- | --- | --- | --- | --- |
| RES-201 | P0 | 卡片进入编辑 | 有版本 | 点击卡片 | 进入对应 ID 编辑页 | 候选人 |
| RES-202 | P0 | 保存 Markdown | 编辑页 | 修改一段并保存、刷新 | 内容持久化且更新时间变化 | 候选人 |
| RES-203 | P0 | 结构校验 | 编辑页 | 删除 H1 或全部 H2 后保存 | 返回 40001，旧内容不变 | Codex |
| RES-204 | P0 | 区块重建 | 合法多标题正文 | 连续保存两次并查 blocks | 顺序稳定、无重复、哈希稳定 | Codex |
| RES-205 | P0 | 事务回滚 | 制造区块写入失败 | 保存正文 | 正文和旧块均不变 | Codex |
| RES-206 | P0 | 标准版迁移 | 现有 Master | 写入最新版 Word 的 Markdown | ID、类型、启用和历史引用不变 | Codex |
| RES-207 | P0 | 实时预览 | 编辑页 | 修改标题、列表、粗体 | 预览同步且无原始 HTML 执行 | 候选人 |
| RES-208 | P0 | A4 页面 | 标准版有内容 | 打开查看页 | 视觉符合 Skill，内容完整 | 候选人 |
| RES-209 | P0 | PDF | 查看页 | 点击下载 PDF | 打开打印界面，仅简历正文进入 A4 输出 | 候选人 |
| RES-210 | P0 | 分页质量 | 打印标准版 | 查看全部页 | 无标题孤行或异常大空白页 | 候选人 |
| RES-213 | P1 | 旧版本待迁移 | contentMarkdown为空 | 打开编辑页 | 可编辑，禁止直接打印空内容 | 候选人 |

### 角色分工

候选人确认内容与视觉、执行最终打印；Codex 实现并验证接口、切片、构建、页面和数据。

### 验证说明

个人数据库操作、真实岗位样本与历史验收证据保存在本地 `local/private-docs/`。公开仓库的测试使用隔离夹具；实际验证范围以测试输出为准。

#### 验证说明

个人数据库操作、真实岗位样本与历史验收证据保存在本地 `local/private-docs/`。公开仓库的测试使用隔离夹具；实际验证范围以测试输出为准。
