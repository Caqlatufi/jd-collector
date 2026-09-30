# JD Collector 后端开发约定

本文件适用于 `backend` 及其子目录，承接项目根目录 [AGENTS.md](../AGENTS.md)。明确的用户指令优先；子目录存在更近的约定时优先遵循近层文件。

## 文档职责与导航

- 本文件负责后端技术概览、模块挂载、协作流程、构建与验收。
- Java、JPA、接口和异常的具体写法见 [CODESTYLE.md](CODESTYLE.md)。
- 业务需求与方案统一维护在 [docs](../docs/README.md)，按主需求功能平铺，一功能一文件、内部含四部分；文档边界不等于代码模块，不建模块子目录、重复 MODULE.md 或开发流水。
- 关联前端：[frontend/AGENTS.md](../frontend/AGENTS.md)。运行、备份、凭证与自启动流程以根目录约定和 `ops` 脚本为准。

## 项目概览

- Java 17、Spring Boot 3.1.1、Spring Web、Bean Validation、Spring Data JPA、Lombok、Gradle 多模块。
- 本地 MySQL；测试使用独立 H2。公共实体、仓储和响应由本项目维护，构建不需要私有框架。
- `app` 提供本机单用户 REST API 和 Vue 静态页面，监听 `127.0.0.1:7890`，上下文路径 `/jd-collector`。
- 外部招聘平台登录由 `account` 管理，不引入工作台自身的用户、角色、租户或登录鉴权体系。
- 招聘平台登录与岗位读取在前端 Electron 内置标签完成；后端 account 仅保留历史读取与旧接口退役响应，不装配浏览器服务、不解密历史快照。

## 模块与职责

| 模块 | 责任 | 文档 |
| --- | --- | --- |
| `app` | 启动、模块聚合、SPA 路由、静态资源与可执行 JAR | [工作台](../docs/01-工作台启动与导航.md) / [桌面浏览器](../docs/02-桌面浏览器与多标签.md) |
| `common` | 统一异常、自包含公共能力、系统健康检查 | [工作台](../docs/01-工作台启动与导航.md) / [桌面浏览器](../docs/02-桌面浏览器与多标签.md) |
| `company` | 公司资料、地址、通勤与质量 | [公司库](../docs/06-公司资料与通勤.md) |
| `resume` | 简历版本、Markdown 与派生内容块 | [版本管理](../docs/07-简历版本管理.md) / [编辑与PDF](../docs/08-简历编辑与PDF输出.md) |
| `posting` | 岗位录入、查询、评分、分档与筛选 | [JD](../docs/05-JD管理与评分.md) |
| `pipeline` | 实际投递、阶段流转和事件历史 | [Pipeline](../docs/09-投递记录与跟进.md) |
| `interview` | 面试安排和复盘 | [面试](../docs/10-面试安排与复盘.md) |
| `dashboard` | 漏斗、计划时间图与异常聚合 | [看板](../docs/11-求职漏斗与计划看板.md) |
| `export` | 岗位 CSV 导出 | [CSV导出](../docs/13-JD筛选导出.md) |
| `recognition` | 截图文件队列、定时启动Codex、状态与重试接口 | [JD采集识别](../docs/04-JD采集与截图识别.md) |
| `account` | 历史账号只读兼容与旧写接口退役 | [账号与登录态](../docs/03-招聘平台账号与登录态.md) / [JD采集识别](../docs/04-JD采集与截图识别.md) |

## 模块挂载

`criteria`（`com.jd.criteria`）独立承担门槛 JSON 读取、版本校验、备份与原子保存，不建表，不调用岗位评分或投递服务；由 app 显式挂载。契约见 [JD门槛填写](../docs/15-JD门槛填写.md)。

新增业务模块按以下顺序接入，业务代码归 `com.jd.<module>`：

1. 在 `backend/<module>/build.gradle` 声明所需依赖，生成普通 JAR；公共依赖见根 `build.gradle`。
2. 在 `settings.gradle` 中 `include '<module>'`。
3. 提供 `<Module>Config`：扫描本模块 `ctrl`，声明实体和仓储扫描范围，以 `@Bean` 注册服务。
4. 在 `app/build.gradle` 引入模块依赖，并在 `app/.../Config.java` 的 `@Import` 中挂载配置。
5. 新增前端页面路径时同步检查 `SpaController`，确保深链接直接打开和刷新可用。
6. 在对应主功能文档内更新责任边界、数据和验收场景；跨功能通过链接协作，不按新代码模块另建总方案。

`app` 保持入口职责；跨模块调用通过明确的 Gradle 依赖与服务契约协作，避免循环依赖及把领域实现集中回 `app`。

## 协作与配置

- 默认中文沟通和文档，提交信息使用中文。未经明确要求不提交 Git 或推送。
- Git 根目录是 `项目所在仓库`，前后端共享分支；操作前检查仓库根和工作区，仅处理当前需求相关改动。
- 日常局部调整在当前工作分支完成；大型改造确需隔离时再建立分支，不自动把后端变成独立仓库。
- 主配置位于 `app/src/main/resources/application.yml`；测试配置位于 `app/src/test/resources/application-test.yml`。当前不存在 TwinTag 的 dev/test/prod 三套配置目录。
- 数据库凭证从根目录约定的 `JD_COLLECTOR_DB_*` 用户环境变量读取；密钥、会话和浏览器数据不写入源码、文档或日志。
- 新实体、新字段先由 JPA `ddl-auto=update` 承接并实际验证落表。尚未接入 simple-migration；需要视图或数据兼容 SQL 时再评估，不照搬框架迁移目录。
- 一次性数据整理应直接操作或使用受控临时工作目录；`ops` 只放持续维护的构建、运行与备份入口。

## 构建与运行

推荐从项目根运行 `ops/build.ps1`、`ops/start.ps1`、`ops/stop.ps1`。构建脚本先构建前端，再打包后端，前端产物进入 `app` 的静态资源。

后端直接验证在 ASCII junction 中执行：

```powershell
Set-Location 'backend'
.\gradlew.bat :app:compileJava
.\gradlew.bat :account:test :app:test
.\gradlew.bat :app:bootJar
```

- junction 必须指向真实项目目录，校验方式见 `ops/build.ps1`。Java 17 使用本机 `JAVA_HOME`。
- `:app:bootJar` 打包已有 `frontend/dist`，不会代替前端构建。Vite 重建 dist 与 Gradle 复制静态资源应串行执行。
- 只有 `app` 产出可执行 JAR；其他模块为库。需要强制重新执行测试时再加 `--rerun-tasks`。
- 集成测试使用 test profile；不得让测试的 `create-drop` 指向个人实际求职数据库。

## 回归与完成标准

- 修改数据写入、业务状态或接口后，从真实 HTTP 入口验证关键主流程、失败分支与最终存储；构建和 mock 只能作为辅助证据。
- 测试数据放独立环境。必须使用本地业务库时，限定可识别的测试对象并核对清理结果，不覆盖已有岗位、简历或账号。
- 页面模拟响应测试应拒绝未匹配的写请求，避免 mock 漏匹配落入真实数据库。
- 外部平台流程分别记录“窗口打开”“页面持续可用”“采集成功”“认证确认”“重开恢复”。应覆盖延迟跳转、空白页、窗口关闭和失效会话，不能以几秒内能打开页面作为完整验证。
- 浏览器事件和秘密数据保持在对应模块边界内；失败不能吞掉后继续返回成功。账号会话数量不能替代认证证据。
- 缺少外部账号或人工验证条件的场景如实标记待验证；测试站通过不等于真实招聘平台通过。
- 验收结果更新对应功能文档的验收章节。纯约定文档改动检查链接、路径和一致性即可，不因此启动服务或重复运行全部测试。
