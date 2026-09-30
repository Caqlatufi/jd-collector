# JD Collector 前端代码风格

本文件约束具体编码方式，入口和协作流程见 [AGENTS.md](AGENTS.md)。以当前 Vue/Element Plus 实现为基准，修改就近保持一致，不为格式统一批量重写无关代码。

## 1. 格式与文件命名

- UTF-8、2 空格缩进、文件末尾一个换行；TypeScript 使用单引号和分号。
- 命名导入沿用 `import {ref, computed} from 'vue';` 的无括号内空格写法，推荐单行不超过 120 字符。
- 长模板属性和多步函数展开为多行；简单声明可保持紧凑，避免把复杂交互压成一行。
- 页面和业务组件使用 PascalCase，例如 `AccountsPage.vue`、`ResumePaper.vue`；API 文件使用 `accountApi.ts`，目录按既有业务域命名。
- 当前无自动格式化配置，以上是人工约定；将来引入工具时同步配置与本文件。

## 2. TypeScript 与导入

- 维持 tsconfig 的 `strict: true`；请求、响应、Props、Emits 显式定义类型，优先 `unknown` 加类型收窄，不用全局 `any` 掩盖不匹配。
- 纯类型使用 `import type`；项目路径优先 `@/`，同模块可用短相对路径；导入按来源分组并保持所在文件顺序。
- 模块私有模型可放 `src/<feature>/model.ts` 或 `model/`；被多个领域复用的类型放 `src/common/model`。不为目录形式一致迁移已有模型。
- 枚举值保持后端机器值，例如 `JAVA_BACKEND`、`CAPTURED`；中文名称通过显示映射转换，不把中文文案提交为枚举值。
- 精确区分 `undefined`、`null`、空字符串和零。零分、零条记录正常展示；通勤未知、日期未设置按未知显示，不补造默认事实。

## 3. Vue SFC 与状态

当前文件顺序为：

```vue
<script setup lang="ts">
// imports、类型、状态、派生值、请求和事件处理
</script>

<template>
  <!-- 页面内容 -->
</template>

<style scoped lang="scss">
/* 模块局部样式 */
</style>
```

- 使用 Composition API。简单状态用 `ref`，表单用 `reactive`，派生值用 `computed`；不同时维护可以从同一来源计算的重复状态。
- `defineProps`、`defineEmits` 显式类型化；组件不修改传入 Props，以事件表达写操作。
- `v-for` 使用稳定业务 ID/平台代码作为 key。模板复杂判断和数据转换下沉到函数或 computed。
- 生命周期中创建的定时器、监听器、Object URL 和外部资源应有对应清理；路由切换后避免旧请求覆盖新页面状态。
- Pinia 用于跨页面共享状态，页面局部表单和 loading 不默认上升为全局 store。

## 4. API 封装与分页

- 组件调用模块 API，不在模板或每个页面重复创建 Axios 实例。
- 单对象接口从 `data.result` 取值；分页接口保留 `result` 与 `page`，由模块 API 的返回类型表达清楚。
- 默认超时来自共享客户端；浏览器启动等确实较慢的接口局部设置超时，配合 busy 提示，避免放大全部请求超时。
- 请求页码从 1 开始，由后端转换为 Spring 的 0-based。当前响应 `page.number` 为框架的 0-based，绑定到 1-based 控件时显式加 1；共享 Axios 不做转换。
- 列表总数读取 `page.totalElements`，不要拿当前页数组长度充当总记录数。
- 排序、筛选、分页参数与后端一致，不在前端只排序当前页而让用户误以为是全量排序。

```ts
import client from '@/common/api/request';
import type {RestResultResponse} from '@/common/model/response';
import type {Posting} from '@/common/model/domain';

export const postingApi = {
  get: async (id: number) =>
    (await client.get<RestResultResponse<Posting>>('/postings/' + id)).data.result,
};
```

## 5. 表单与异步操作

- 使用 Element Plus 表单和输入组件，模型字段与 DTO 对齐；若使用表单规则，绑定 `:model` 并为字段设置对应 `prop`。
- 必填、长度和类型校验与后端一致；复杂业务规则仍由后端判定。捕获验证失败后停止提交。
- 请求前设置 loading/busy，在 `finally` 恢复；重复点击和冲突操作在执行期间禁用。
- 加载、无数据、请求失败和成功状态分别表达；失败保留用户输入，避免自动关闭对话框或展示成功。
- 共享请求拦截器把失败转成 Error；页面通过 `showRequestError` 或持久错误区展示，同一次失败避免重复弹多次。
- 清除凭证/会话等明确删除动作使用二次确认；普通保存和只读查看不额外增加审批流程。
- 招聘平台密码、验证码与换号在外站页面完成；工作台不提供此类输入表单。不把密码、会话或 Token 写入前端 localStorage、控制台和测试截图。
- 超时只代表本次等待结束，不能直接再次发起登录、投递等写操作；先查询真实状态。

## 6. 样式与竖屏布局

- 默认 scoped SCSS/CSS；通用视觉放 `src/common/style/global.scss`。跨组件覆盖应限制到明确组件类名。
- 当前没有 Tailwind、NutUI 或全局 variables.scss 注入，直接复用现有 Element Plus 与项目样式。
- 保持顶部菜单、深绿色工作台与金色强调风格。桌面最小宽度为 720px，检查 720/768/1000 等宽度下的阅读与操作。
- 网格子项使用 `min-width: 0`，列宽按 `minmax(0, 1fr)` 或与业务最小卡片宽度匹配的规则分配。
- 大表格、计划时间图和 A4 预览在各自容器滚动；避免固定宽度子元素撑开整个页面。
- 状态颜色由公共映射或组件统一输出；等级、评分、通勤证据和招聘状态是不同维度，颜色不能暗示未经证实的结论。
- 长账号、职位名称和备注允许换行或带完整提示的截断；按钮组合随容器宽度换行。

## 7. Markdown、资源与 PDF

- 简历 Markdown 是内容源，Vue/CSS 是排版源；不把排版 HTML 混进正文。
- `v-html` 仅用于经过明确处理的渲染结果；当前 Markdown 解析关闭原始 HTML，不直接渲染外部 JD 或用户输入的 HTML。
- 站内资源路径考虑 Vite 的 `/jd-collector/` 基路径；打印前确认照片等资源实际加载成功。
- 简历打印样式隐藏应用壳和操作按钮，遵循 A4 与真实分页规则；避免对整段长容器统一 `break-inside: avoid` 导致空白页。
- 当前“下载 PDF”通过浏览器打印完成；若交互行为变化，同步按钮提示和[简历编辑与PDF输出文档](../docs/08-简历编辑与PDF输出.md)。

## 8. 页面验收代码

- 使用角色、标签或稳定业务标识定位控件，减少依赖易变的组件嵌套层级。
- 测试名称写明真实接口、只读检查、模拟响应或测试站场景，不混淆证据来源。
- 请求 mock 使用明确路径匹配；对未匹配写请求采取 abort，避免测试数据进入个人工作库。
- 异步结果使用可观察状态与断言等待；不要用固定长 sleep 代替验证，检查延迟异常时则应覆盖其发生时间。
- 断言业务结果、错误提示与最终状态；仅检查按钮存在或页面 HTTP 200 不足以验证保存、登录或会话复用。
- 测试产物放已忽略的 `test-results`、`desktop-test-results`；含真实账号内容时避免截图或记录敏感值。

## 9. Electron 与事件契约

- 类型集中于 `common/desktop/contract.ts`；命令采用 `能力.动作` 命名，事件采用 `能力.changed` 等状态语义。输入、响应和事件 payload 都显式类型化。
- 业务模块统一导入 `common/desktop/client`，使用 `request` 和 `on`；不导入 Electron、Node、preload 或主进程实现，也不读取全局桥接对象。
- 桌面 IPC 通道只在边界层声明；preload 白名单、主进程校验与契约同时更新。需要结果的操作不能只发无回执事件。
- 公共客户端负责网页降级和错误转换。Promise 的超时不会自动重发原操作；事件监听需在卸载时解除。
- 主进程文件只被 Electron bundle 使用，preload 打为独立 CommonJS 产物以适配 sandbox；避免渲染代码混入 Node 依赖。
- app 负责装配，common 按通用能力拆分；领域状态机、账号规则和简历内容仍归业务模块。
