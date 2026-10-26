# JD Collector 开发与运行约定

本文件适用于整个项目。用户明确指令优先级最高。

## 分组件开发规范

进入前后端子目录时，优先遵循对应约定；本文件继续维护整个项目的运行、备份和协作规则。

- 后端：[开发约定](backend/AGENTS.md)、[代码风格](backend/CODESTYLE.md)。
- 前端：[开发约定](frontend/AGENTS.md)、[代码风格](frontend/CODESTYLE.md)。

## 项目定位

- 本机单用户求职工作台，不建设登录、鉴权、角色、租户和操作审计。
- 页面入口：`http://127.0.0.1:7890/jd-collector/`。
- 健康检查：`http://127.0.0.1:7890/jd-collector/api/system/health`。
- 前端资源打入 Spring Boot JAR，由同一个后台 Java 进程提供页面和 API。
- Electron 桌面壳从 `frontend/src/app/electron` 接入同一工作台，公共桥接位于 `frontend/src/common/desktop`；具体分层约定见前端 AGENTS。业务模块通过公共请求与事件使用桌面能力。

## 仓库结构

- `backend`：Java 17、Spring Boot 3、Gradle 多模块后端；各领域 `com.jd.<module>` 由 `app` 统一挂载。
- `frontend`：Vue 3、TypeScript、Vite、Element Plus；各业务域通过 `index.ts` 注册，由入口统一挂载。
- 桌面运行：先启动本地后端，再在 `frontend` 执行 `npm run desktop:start`；开发使用 `desktop:dev`，边界检查使用 `desktop:check`。平台登录与当前页读取统一使用 Electron；历史 Java 快照只读保留。
- `docs`：按主需求功能平铺，每个功能一份 Markdown，文件内包含需求、架构、开发和验收；README 只作导航。
- `ops`：构建、启动、停止、自动启动和数据库备份脚本。
- `runtime`：本地日志和 PID，不提交。
- `backups`：本地数据库备份，不提交。
- `config`：可公开的配置示例；`local`：个人简历、照片、门槛、搜索任务及环境配置，不提交。
- 基础实体和 REST 响应由 `backend/common` 自包含维护，不依赖本机私有框架。

## 文档约定

- 一个主功能一份 `docs/功能名.md`，不建模块子目录、不拆成四份阶段文件；在同一文件内维护需求分析、架构设计、开发方案和验收方案。
- 文档边界按用户功能划分，不按代码模块划分。同一代码模块可支撑多份功能文档；账号与登录态、JD采集识别、JD管理评分分别维护并链接引用，不能重新合并成账号模块总方案。
- 已有需求或实现变化直接更新对应功能；只有新增独立主功能才新建文件，不新增开发流水。
- 不建立项目级重复的需求、架构、开发或验收总文档。
- 不建立 `docs/research`，不按日期记录渐进需求、搜索过程或普通开发流水。
- 求职冲刺计划独立维护在 `local/求职冲刺计划.md`（模板见 [config/sprint-plan.example.md](config/sprint-plan.example.md)），不当作看板自动排期。
- 项目明确不维护 Bruno 接口测试集合。

## 协作约定

- 默认使用中文沟通、写文档和 commit message。
- 除非用户明确要求，不执行 `git commit` 或远程推送。
- 保留并避开与当前需求无关的工作区改动，只修改当前范围文件。
- 后端继续保持模块挂载模式，禁止把业务代码重新集中到 `app`。
- 前端继续保持业务域挂载模式，共享 HTTP、模型、状态和样式放在 `common`。

## 常用命令

在项目根目录执行：

```powershell
# 网页、Electron + 后端可执行 JAR
.\ops\build.ps1

# 配置与依赖自检；启动后加 -Running，模型调用需显式加 -ProbeModel
.\ops\doctor.ps1

# 后台启动并等待健康检查
.\ops\start.ps1

# 停止由本项目启动的后台进程
.\ops\stop.ps1

# 安装或刷新 Windows 登录后自动启动快捷方式
.\ops\install-autostart.ps1

# 安装或刷新桌面快捷方式（本地后端 + Electron）
.\ops\install-desktop-shortcut.ps1

# 打开桌面客户端，已打开时激活原窗口
.\ops\start-desktop.ps1

# 生成带时间戳的数据库备份（H2 ZIP / MySQL SQL）
.\ops\backup.ps1
```

## 分组件开发与验证

| 目标 | 工作目录 | 命令/说明 |
| --- | --- | --- |
| 前端开发 | `frontend` | `npm run dev`，端口 `3002` |
| 前端生产构建 | `frontend` | `npm run build` |
| 页面业务流 | `frontend` | `npm run test:e2e`，要求一体化应用已启动 |
| 后端集成测试 | `backend` | `.\gradlew.bat :app:test --rerun-tasks` |

Gradle/JUnit 在部分中文路径下存在兼容问题。可在 `local/env.json` 设置 `JD_COLLECTOR_BUILD_ROOT` 指向 ASCII junction；`ops/build.ps1` 校验其目标。前端仍从真实项目路径构建。

## 数据库约定

运行脚本从 `local/env.json` 加载 JD_* 配置；`JD_COLLECTOR_ISOLATED=true` 时本项目配置优先，其他情况下进程变量优先，兼容 Windows 用户数据库环境变量。直接 Gradle 命令先 dot-source `ops/env.ps1`。公开示例在 `config/`，个人配置、模板、照片和进度统一放 `local/`，不得提交。数据库变量：

- `JD_COLLECTOR_DATA_DIR`：默认 `local/data`，与构建产物分离；安装器可指定用户数据目录。
- `JD_COLLECTOR_DB_URL`：默认 H2 文件，显式配置时兼容原 MySQL。
- `JD_COLLECTOR_DB_USERNAME`
- `JD_COLLECTOR_DB_PASSWORD`

不得在代码、文档、提交信息或沟通中回显明文密码。数据库结构由 JPA `ddl-auto=update` 管理，当前业务表为：

- `jd_company`
- `jd_company_work_location`
- `jd_company_location_cache`
- `jd_company_address_discovery`
- `jd_resume_version`
- `jd_posting`
- `jd_posting_greeting`
- `jd_posting_direction`
- `jd_posting_term`
- `jd_posting_term_profile`
- `jd_stage_event`
- `jd_interview`
- `jd_resume_content_block`
- `jd_platform_account`

默认运行库为内嵌 H2 2.2.224，驱动随 JAR 打包，由 JDBC URL 推断驱动。JD 文件使用 `MODE=MySQL;DATABASE_TO_LOWER=TRUE;AUTO_SERVER=TRUE`，允许本机面试服务经 SELECT 专用账号读取；两个应用必须使用同版 H2。详见[内嵌数据库与迁移](docs/19-内嵌数据库与迁移.md)。

历史 MySQL 同时承载`aic_`表。迁移后 JD 与面试业务分别保存到各自 H2 文件，两个应用继续按前缀隔离：

- JD Collector只拥有并管理`jd_`表；禁止在本项目实体、JPA结构更新、修复SQL、清理脚本或测试中创建、修改、删除、重命名或回填`aic_`表。
- AI Interview Coach只拥有`aic_`表，并以只读连接访问`jd_`表。`aic_interview_session.jd_posting_id`只是逻辑引用，不在两组表之间建立数据库外键。
- 全库备份必须保留两组前缀；恢复、清库或重置测试数据时按表前缀核对范围，禁止为了重建JD Collector而清空整个`jd_collector`Schema。
- 若未来两个应用对同一字段产生写入需求，先调整数据归属或增加明确接口，不允许直接跨应用更新对方表。

普通实体和字段默认由 JPA DDL 承接；只有未来出现视图、索引、数据兼容或必须启动执行的 SQL 时，才评估迁移机制。

## 备份与恢复

- `.\ops\backup.ps1` 在 `backups` 生成 H2 一致性 ZIP；显式 MySQL 配置仍生成全库 SQL。
- H2 恢复使用 `.\ops\restore.ps1 -BackupFile <zip> -DatabasePath <不存在的数据库基础路径>`；拒绝覆盖，不修改运行配置。
- 存在账号密钥时同时生成配套 `.accounts.key` 并核对哈希；自定义密钥位置用 `-AccountKeyPath` 传入。
- 恢复前先停止应用，并先恢复到独立临时库核对，禁止直接覆盖正在使用的库。
- 核对上述业务表、关键行数和唯一启用 Master 后，先备份正式库，再执行正式恢复。
- 恢复后重新启动应用，执行健康检查和关键页面抽查。

## 招聘平台账号与浏览器

- 账号代码位于 `backend/account`、`frontend/src/account`；功能文档见[招聘平台账号与登录态](docs/03-招聘平台账号与登录态.md)。页面 `/accounts` 仅提供平台打开/返回；[JD采集与截图识别](docs/04-JD采集与截图识别.md)独立维护。本地工作台仍为单用户。
- 服务只监听 `127.0.0.1`。`/api/accounts` 不返回密码、Cookie、Token 或密文；禁止在日志或对话输出这些秘密。
- 招聘平台统一在 Electron 内置标签打开；用户在网站内完成登录和验证，由 Agent 按平台 Skill 读取目标岗位页。普通浏览器提示使用客户端，不启动独立 Chrome。
- 平台适配规则归 frontend/account，app 注入 common/desktop 执行；业务模块通过类型化请求/事件使用能力。
- 登录会话沿用 Electron 持久化分区，不向 Java 导出密码、Cookie 或存储原文；数据库搬迁原样保留历史密文，runtime/accounts/master.key 保留原位置、不清除，继续配套备份。
- 旧账号写接口返回 HTTP 400 / code 40002；GET /api/accounts 仅作历史兼容，不代表当前登录状态。Java 浏览器服务和 Playwright 运行依赖已移除。
- 平台读取由 Agent workflow 执行，账号页只提供打开/返回平台。只有用户要求采集或更新时才通过原 JD 接口保存，不自动投递或排期。真实平台认证、DOM 适配效果与隔离夹具测试分别报告。
- 回归：后端 ASCII junction 执行 .\gradlew.bat :account:test :app:test；前端 npm run test:desktop 和 npm run test:e2e -- tests/accounts.spec.ts。写入使用独立 H2，Electron 测试使用独立 userData。

## 自动启动

`.\ops\install-autostart.ps1` 在当前用户 Startup 目录创建 `JD Collector.lnk`，以隐藏窗口运行 `ops/start.ps1`。启动脚本必须先检查健康状态，避免重复启动。

桌面快捷方式 `JD Collector.lnk` 使用 `ops/start-desktop.ps1`：隐藏启动后端并确认健康，再打开已构建的 Electron；重复点击激活原客户端，保留标签。日常启动不重新构建，源码变更后先执行 `ops/build.ps1`，其中已包含 Electron 构建。启动失败以弹窗提示，后端启动日志位于 `runtime/desktop-backend-start.*.log`。重新安装快捷方式不会修改开机自启动设置。

桌面启动器以健康接口的 code=200、service=jd-collector、status=UP 为成功标准：已健康时直接打开 Electron；未健康时才调用 start.ps1 并再次检查。Windows PowerShell 重定向日志时子进程 ExitCode 可能为空，不据此误报失败。等待仅针对启动脚本，不等待长驻 Java 子进程树。

## 完成标准

- 构建通过不等于业务验收通过。
- 修改后按风险执行后端测试、前端构建和相关 Electron 页面流程。
- 涉及状态流转或数据落库时，必须核对真实接口响应和最终数据库状态。
- 交付时说明修改范围、验证结果、未完成项以及是否提交 Git。

## 招聘平台 Agent workflow

- 新候选人接手按 [README 快速开始](README.md#快速开始windows) 初始化环境与本地配置，先执行 `ops/doctor.ps1`，启动后执行 `-Running`。用户简历附件和转换结果放 `local/`，通过简历 API 保存一个有正文的启用 `MASTER` 并回读；`resume-starter.md` 是表单模板，不会自动入库。按用户范围保存已确认门槛并建立本地搜索任务单，不沿用匿名示例或上一候选人的答案。
- 评分前读取 `GET /api/resume-versions?active=true&type=MASTER`，再读取该版本详情取得真实正文；缺少母版时先完成导入，不推测经历。平台 Skill 负责读取岗位，匹配评分由主 Agent 根据当前母版核对并记录证据与缺口。

- **截图读取、Electron原生执行**：截图使用capturePage，点击、滚动与键盘使用sendInputEvent，文字使用insertText；统一通过受限本地workflow调用，不启用调试端口。真实招聘页禁止DOM、locator、语义选择器、无障碍树、页面脚本和网络响应读取或定位控件。主Agent根据截图确定坐标，动作绑定最新截图与目标页，页面或几何变化即停止重看。URL、标签key、viewport只作来源和几何元数据。本地工作台与隔离夹具可使用测试专用元素断言，该能力不进入生产管道。
- BOSS 固定脚本使用本项目的截图校准配方。动作前核对目标、视口及图像锚点，动作后截图供主Agent读取；布局或锚点变化停止，不自动回退元素读取。登录/验证码、聊天和投递不自动化。
- 2026-09-10起统一使用Electron原生workflow；已移除调试连接、自动化启动开关和相关依赖。平台登录分区继续复用。原生能力验证与真实站点筛选覆盖分别记录，不能由构建或夹具测试推断全站可用。

- 筛选或采集JD前通过 GET `/api/criteria` 读取当前有效门槛（默认 `local/JD门槛.json`）：`baselineRules` 保留原有已确认前提，`agentNotes` 保留采集证据与操作边界；`sections[].fields[]` 为精简问卷答案。非空且 `status=CONFIRMED` 的答案生效，空白、PENDING 和选项本身不代表接受或拒绝。用户保存即确认已填写内容，页面不再要求逐项勾选或指定性质；`kind` 只作兼容参考，按答案明确语义判断，不把可协商选项误作硬条件。新答案如明确调整基础条件，以用户最新保存的明确表述为准。页面与 Agent 共用此 JSON，不维护 Markdown 副本，不自动重评、删岗或投递。
- JD门槛由独立 criteria 模块维护，页面位于 `/criteria`。配置 `jd-collector.criteria-file` 可指定文件，默认读取项目 `local/JD门槛.json`，环境变量 `JD_COLLECTOR_CRITERIA_FILE` 可覆盖；保存先核对版本并备份到门槛文件同级的 `backups/criteria`，再原子替换。Agent 优先通过 GET/PUT `/api/criteria` 更新答案以使用版本校验，需改结构时读取最新文件并避免与表单并行编辑。不要将此文件放进前端产物或数据库生成第二份有效来源。
- 用户用自然语言提出岗位条件；不要要求其选择标签、检查登录、读取或转草稿。本人只负责平台网页内登录及验证码。
- 平台列表筛选与批次采集当前使用 BOSS，读取 [BOSS SOP](.agents/skills/jd-boss/SKILL.md)。用户“新增 JD”粘贴链接为通用 HTTPS 单岗位流程，覆盖招聘网站及企业官网，通过 LangGraph、WEB 后台原生截图/滚动和 [链接收录 Prompt](.agents/skills/jd-import-prompt.md) 核对页面有效性、完整性后评分归档；不要求未知网站套用 BOSS 页面布局。
- Agent 入口为 `frontend/src/app/electron/workflow.mjs`，复用正常 Electron 会话。JD图片识别核心默认为 `gpt-6-astra` / `medium`，标准Prompt见 [.agents/skills/jd-vision-prompt.md](.agents/skills/jd-vision-prompt.md)。模型配置必须由主Agent实际指定，不只写在任务正文。
- BOSS 的筛选、批次采集、集中复核和归档统一遵循 [BOSS 采集 SOP](.agents/skills/jd-boss/SKILL.md)；公共原生操作与保存契约见 [公共规则](.agents/skills/platform-workflow.md)。本文件不复制平台步骤。当前条件读取 criteria API，本轮覆盖与断点读取对应平台任务单；接续文件只作摘要，历史验收不作为当前任务。
- backend/recognition每5秒扫描，默认并发2组，独立Codex CLI默认Astra/medium，以用户本地配置为准；主Agent继续操作并集中处理结果。状态与结果见 `/api/recognition/tasks`，运行中任务不重复启动。初筛结果是文件候选记录，不自动写正式JD；新增仍为SCREENED，不投递、不联系HR、不排期。
- 用户已选择截图主链路；原生 capture/scroll/click/type/key 已实现，旧 inspect/read/diagnose 返回 WORKFLOW_DEPRECATED，正文DOM/字体提取代码已移除。真实网站必须使用原生PNG证据，按平台Skill逐步操作，不静默回退DOM。禁止任意脚本或全权限调试端口。
- `node dist-electron/review.cjs <task.json> <result.json>` 只读校验图片哈希/尺寸、识别协议和证据完整性；通过不代表业务门槛已满足。BOSS 单岗位真实详情已于2026-09-09通过Astra/medium及独立H2的HTTP保存/查重/回读，详细范围见docs/04，不能外推为全站或所有岗位已符合条件。
- 本地连接清单位于 userData，包含通信令牌，不打印、不提交、不当作招聘平台认证；不能把它返回给网页。

## MCP 操作入口

- `ops/mcp/server.mjs` 为标准 stdio MCP，工具与连接方式见[接口说明](ops/mcp/README.md)、[功能文档](docs/18-MCP操作接口.md)。Agent 可通过 `node ops/mcp/call.mjs <工具名> --file <UTF-8参数文件>` 诊断调用；图像只返回 MCP 图像内容及原生 PNG 引用，不在终端打印 base64。
- `WEB` 为通用网页目标，复用同一个本地 workflow、BrowserWindows 与 VisualCapture，不加入业务平台/岗位来源枚举。招聘平台专用流程保持原有平台约束。通用网页读取同样只用原生截图，动作绑定最新截图，不增加脚本执行、DOM、调试端口或系统鼠标能力。
- 当前 MCP 开放网页标签/截图/页内搜索操作，以及岗位、公司、投递历史、面试和门槛查询。后台操作沿用 `JD_DESKTOP_BACKGROUND_WORKFLOW=true`；客户端旧进程返回 `DESKTOP_UPDATE_REQUIRED`，保存未完成输入并重启正常客户端后接续，不能以编译成功冒充进程已升级。
