# JD Collector 前端开发约定

本文件适用于 `frontend` 及其子目录，承接项目根目录 [AGENTS.md](../AGENTS.md)。明确的用户指令优先，存在更近的子目录约定时优先遵循近层文件。

## 文档职责与导航

- 本文件负责前端入口、业务域挂载、协作方式、工具和验收约定。
- Vue、TypeScript、API、表单和样式的具体写法见 [CODESTYLE.md](CODESTYLE.md)。
- 业务文档统一维护在 [docs](../docs/README.md)，按主需求功能平铺，一功能一文件，内部含需求、架构、开发、验收四部分；直接更新对应功能，不建模块子目录或按日期累积的开发记录。
- 接口与数据边界参照 [backend/AGENTS.md](../backend/AGENTS.md) 和对应 Java DTO/服务实现。

## 项目概览

- Vue 3、TypeScript strict、Vite、Vue Router、Pinia、Element Plus、Axios、SCSS；Markdown 简历使用 markdown-it。
- 当前为单入口 `index.html` + `src/main.ts` 的 Web SPA，以业务模块安装函数组织页面；没有 TwinTag 的多 HTML 入口、NutUI 或 Tailwind 配置。
- 面向本机单用户，采用顶部导航和竖屏桌面布局；当前全局最小宽度为 720px。
- 生产页面由 Spring Boot JAR 提供，基路径 `/jd-collector/`。Electron 从 `src/app/electron` 接入，复用同一 Vue 工作台；网页入口继续保留。

## 目录与业务域

| 目录 | 职责 | 文档 |
| --- | --- | --- |
| `src/app` | 页面壳、顶部导航、路由聚合、Electron 启动和 preload | [工作台](../docs/01-工作台启动与导航.md) / [桌面浏览器](../docs/02-桌面浏览器与多标签.md) |
| `src/common` | 公共 HTTP、模型、状态、样式、桌面契约与通用能力 | [工作台](../docs/01-工作台启动与导航.md) / [桌面浏览器](../docs/02-桌面浏览器与多标签.md) |
| `src/company` | 公司库页面 | [公司库](../docs/06-公司资料与通勤.md) |
| `src/resume` | 简历版本、Markdown 编辑、预览与打印 | [版本管理](../docs/07-简历版本管理.md) / [编辑与PDF](../docs/08-简历编辑与PDF输出.md) |
| `src/posting` | JD 列表、筛选、编辑和投递入口 | [JD](../docs/05-JD管理与评分.md) |
| `src/pipeline` | 已实际投递岗位的跟进 | [Pipeline](../docs/09-投递记录与跟进.md) |
| `src/interview` | 面试安排和复盘 | [面试](../docs/10-面试安排与复盘.md) |
| `src/dashboard` | 漏斗、计划时间图与异常 | [看板](../docs/11-求职漏斗与计划看板.md) |
| `src/account` | 平台登录入口、平台规则与采集适配（与账号功能分开维护文档） | [账号与登录态](../docs/03-招聘平台账号与登录态.md) / [JD采集识别](../docs/04-JD采集与截图识别.md) |
| `tests` | Electron 原生页面与业务流程验收 | 对应功能文档的验收章节 |

## 新模块挂载

门槛填写独立在 `src/criteria`，从 JD 列表“JD门槛”按钮进入 `/criteria`，不设一级菜单；路由 `meta.activeMenu=/postings` 保持列表高亮。通过后端 criteria API 读写local/ 下的 JSON，不导入 Electron，不维护 localStorage 副本。详见 [JD门槛填写](../docs/15-JD门槛填写.md)。

1. 在 `src/<feature>` 建立 `index.ts`、`pages`、`api`，按需增加 `components`、模块模型或工具。
2. 在模块 `index.ts` 定义路由，默认导出 `install(app)`，通过 `baseInstall` 注册到 `$routes`。
3. 在 `src/main.ts` 引入模块并 `app.use(Module)`，安装顺序必须在路由聚合器之前。
4. `src/app/router.ts` 统一创建 `/jd-collector/` 的 history router；模块中不再创建第二个 router。
5. 顶部菜单在 `src/app/App.vue` 挂载；路由填写中文 `meta.title`，页面组件采用懒加载。
6. 同步后端 `SpaController` 的直达路径，验证新页面直接打开、刷新和返回导航。

业务页面和组件放所属域；跨域复用能力进入 `common`。不要把新功能全部塞入 App.vue 或全局路由文件。

## API 与前后端协作

- 所有业务请求优先复用 `src/common/api/request.ts` 的 Axios 实例，基地址 `/jd-collector/api`；模块 API 封装放 `src/<feature>/api`。
- 响应类型见 `src/common/model/response.ts`。模块 API 明确返回 `result` 或完整分页响应，不混用不同层级。
- 当前请求拦截器不做页码转换、不做登录重定向；保持 JD Collector 自己的接口契约。
- 修改字段、枚举、分页、状态或校验前同时核对后端实现。前端显示不能代替后端的业务校验。
- 工作台不增加自身登录页面；外部平台登录只在网站页面内完成，业务表单不收集平台密码或导出会话。

## 工具与常用命令

在真实 `frontend` 目录执行：

```powershell
npm ci
npm run dev
npm run build
npm run test:e2e -- tests/accounts.spec.ts
npm run desktop:check
npm run desktop:start
```

- `npm ci` 仅在首次安装或需要同步锁文件时运行。依赖变更同时维护 package.json 与 package-lock.json。
- 开发端口 3002，访问 `/jd-collector/`，通过 Vite 代理连接本地后端；验收配置默认连接 `127.0.0.1:7890/jd-collector/`。
- 沿用本机前端工具约定：不运行 `vue-tsc`，包括 `vue-tsc --noEmit`。校验不得往源码目录生成 `.js`。
- 当前没有 ESLint/Prettier 配置或对应 npm 脚本；不要宣称已运行不存在的校验。Vite 构建不是完整的 TypeScript/SFC 类型检查。
- 前后端一体化构建从项目根执行 `ops/build.ps1`。Vite 输出 dist 与 Gradle 复制 dist 不能同时进行。
- 页面验收使用项目Electron二进制及`tests/native/run.mjs`，每次创建独立userData；无需系统Chrome/Edge。测试专用宿主不会连接个人客户端，未匹配的写请求默认阻断。

## Electron 分层约定

- **截图读取、Electron原生执行**：截图使用capturePage，点击、滚动与键盘使用sendInputEvent，文字使用insertText；统一通过受限本地workflow调用，不启用调试端口。真实招聘页禁止DOM、locator、语义选择器、无障碍树、页面脚本和网络响应读取或定位控件。主Agent根据截图确定坐标，动作绑定最新截图与目标页，页面或几何变化即停止重看。URL、标签key、viewport只作来源和几何元数据。本地工作台与隔离夹具可使用测试专用元素断言，该能力不进入生产管道。
- BOSS 操作脚本在app入口装配，公共连接与图像锚点校验复用公共层，平台坐标步骤归account适配；视口不符或图像变化必须停止重新看图，不能静默回退元素定位。统一使用正常客户端的原生管道，保留现有登录数据；不提供调试连接。

Electron 的接入保持在入口层与公共基础层。约定同时约束今后新增的桌面能力：

| 层 | 位置 | 可承担的职责 |
| --- | --- | --- |
| 入口装配 | `src/app/electron` | 主进程启动、窗口生命周期、preload、开发与构建入口 |
| 桌面入口 UI | `src/app/electron/browser.*` | 顶部标签栏与地址导航，使用公共客户端；Vue 工作台不挂载重复的桌面工具抽屉 |
| 公共契约 | `src/common/desktop/contract.ts` | 类型化命令、响应、事件；不依赖 Vue、Electron、Node |
| 渲染侧公共工具 | `src/common/desktop/client.ts` | 请求/事件适配、超时、错误、网页模式降级 |
| 主进程公共实现 | `src/common/desktop/main` | 通用窗口、会话摘要、IPC 校验与事件推送 |
| 业务模块 | `src/account`、`src/resume` 等 | 发起公共命令、订阅业务所需结果，保持原领域职责 |

- 只有 `app/electron` 与 `common/desktop/main` 可以导入 Electron 或 Node 原生模块；业务模块和普通 common 工具不得导入这些主进程文件。
- `window.jdDesktop` 仅在公共客户端和 preload 边界使用。业务模块禁止直接调用该全局对象、`ipcRenderer`、`ipcMain`，禁止反向依赖 `app`。
- 有成功/失败结果的操作使用 `desktop.request(command, payload)`；状态变化使用 `desktop.on(event, callback)`。订阅返回取消函数，组件卸载必须调用；不暴露任意 IPC channel 的 send/invoke 接口。
- 业务模块不要散落 `isElectron`、`window.require`、环境分支或平台路径。通用能力在公共适配层统一降级；app 入口负责决定是否显示桌面专用 UI。
- 公共基础工具按能力拆分，不能把各领域服务整体搬进 `common`。新增命令先确定契约和数据归属，再实现主进程处理器和适配。
- 主进程校验请求来源、命令和参数；向渲染进程仅返回可序列化的数据，不返回 Electron 对象、系统句柄、密码或会话原文。
- 工作台启用 contextIsolation、sandbox，关闭 nodeIntegration；外部网页窗口不加载工作台 preload，不能获得本机能力。
- Electron 只创建一个 BrowserWindow，顶部工具栏及固定 JD Collector 标签与外站标签共用该窗口。工作台和外站分别使用 WebContentsView；切换只改变可见性，不销毁或重载页面。`app/electron/browser.*` 负责入口 UI，`common/desktop/main` 管理标签生命周期。
- 标签 key 与 sessionKey 分开：每页唯一 key，同站点 UI 使用同一 sessionKey 共享持久化登录状态；不同分区隔离。默认生产打开 HTTPS；回环 HTTP 仅在显式测试开关下允许。持久化数据位于本机 userData，不进入 Git。
- JD Collector 固定标签 key 为 jd-workbench，列表第一项、pinned=true，无关闭按钮；主进程拒绝对它的关闭、替换和外站导航请求。关闭最后一个外站标签后回到固定工作台。关闭客户端窗口退出全部页面；未保存输入不承诺跨退出恢复。
- 实际交付给用户的客户端用正常启动流程常驻；自动化验收只关闭自己的隔离测试实例，不把测试结束当作用户客户端退出指令。
- 招聘平台采用 platform.list/open 和 platform.changed；旧 platform.inspect/read 明确退役。平台域与持久分区归 account/adapters，app 注入公共主进程执行；原生 capture/scroll/click/type/key 仅通过本地 Agent 管道，业务网页不获得截图路径或任意脚本能力。common 不反向导入 account。
- `src/account/vision.ts` 是纯识别协议/证据校验，纳入 desktop:check；`app/electron/review.ts` 为离线只读校验入口。运行时PNG在项目runtime/captures（隔离实例在userData/captures），模型及复核结果在runtime，不提交。
- 原生动作只允许客户端中当前选中的可见平台页，绑定30秒内最新截图和几何/像素锚点；后台模式允许宿主未获系统焦点，仍禁止隐藏/最小化目标和跨标签操作。目标/几何/像素变化重新截图。用户窗口位置和尺寸保持，显示更多正文用页内缩放；后台切换标签不激活窗口。原生超时只结束等待，底层任务结束前不释放锁，迟到结果不发布；没有自动重试输入或投递。
- 已注册平台的主域、子域和新标签统一使用原 sessionKey；多个同平台标签由 Agent 核对 key；打开优先复用活跃页，否则首个同平台页，不重新导航。读取绑定 key/pageRevision，导航或关闭丢弃结果；加载、登录、可读取性独立判定。
- 账号页只负责打开/返回平台，不显示标签选择、登录检查、读取预览和转草稿。Agent 通过 app/electron/workflow.mjs 调用 common/desktop/main 的受限本地管道；平台解析规则仍归 account/adapters。用户明确要求采集后，Agent 核对来源、公司、方向和评分再走原 JD HTTP 接口。旧 Java 密文只读保留，不代表当前 Electron 身份。
- `npm run desktop:check` 检查桌面 TypeScript 和上述导入边界。新增能力同时补齐该命令覆盖、Electron 实际流程测试及对应主功能文档（桌面容器、账号登录态、采集识别分别维护）。

调用示例（模块只依赖 common）：

```ts
import {desktop} from '@/common/desktop/client';

const unsubscribe = desktop.on('browser.changed', state => { /* 更新本模块展示状态 */ });
await desktop.request('browser.open', {key: 'platform-window', url: 'https://www.zhipin.com/'});
// 组件卸载时 unsubscribe()。
```

## 桌面开发与验证

- `desktop:start`：构建主进程/preload 后打开7890的工作台；先用现有 ops 启动后端。Electron 不重复管理 Java 进程。
- `desktop:dev`：启动独占3002端口的 Vite 和 Electron，渲染层支持 HMR；主进程或 preload 改动后重启该命令。
- 正式模式的 Vue 页面发布后，通过 App 页头“刷新工作台”确认并加载当前路由；保留招聘标签。按钮不更新源码或原生壳。开发期可使用 desktop:dev，不将日常桌面快捷方式默认改成开发模式，也不定时强制刷新未保存内容。
- `desktop:build`：只构建 `dist-electron`，不替代 Vue 或后端构建。`test:desktop` 使用独立临时 userData，不使用个人登录会话。
- Electron 依赖及首次二进制下载需要 Node22.12+：安装依赖后运行 `npm run desktop:install`。使用已有适配版本，不修改全局默认 Node。二进制就绪后，当前 Web 构建与桌面启动脚本仍能在本机原有 Node18 下执行。
- 启动脚本清除继承的 `ELECTRON_RUN_AS_NODE`，避免把桌面误启动为 Node 控制台。
- `dist-electron`、`desktop-test-results` 是产物目录，均被 Git 忽略。Electron 原生代码不进入 Vite 浏览器 bundle。
- 后端不可达应显示离线重试页；外站延迟空白应推送 blank/failed 状态，不能保留“页面已加载”或冒称已登录。

## 协作与验收

- 中文沟通与文档，中文提交信息；未经明确要求不提交或推送。前后端共享 `项目所在仓库` 仓库，不另建前端仓库。
- 保留未提交的无关工作，按当前需求修改对应功能文档。纯文档变动只检查路径、链接与一致性。
- 页面变化至少检查 loading、空态、失败态、实际操作和竖屏布局；表格/时间图允许容器内滚动，不额外撑宽整个页面。
- 数据流程检查页面动作、请求参数、响应和最终数据。模拟响应与真实后端验证要分别报告。
- Mock 页面测试必须拦住未匹配的写请求，避免错误路由匹配把测试密码或测试岗位写入真实库。
- 真实测试优先独立数据环境；不直接跑会写入个人库的全量流程，除非已明确准备可识别数据和清理方案。
- 外部平台页面需要观察延迟跳转、空白页、验证码和重开后的状态；“窗口已打开”“会话已保存”不能表达为“登录成功”。
- 简历输出检查真实 PDF 每页的照片、文本、断页与空白尾页；复用 [resume-page Skill](../.agents/skills/resume-page/SKILL.md)。
- 未实际验证的外站认证、完整类型检查或业务分支要明确说明，不以构建成功代替。
