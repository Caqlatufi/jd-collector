# JD Collector MCP

标准 stdio MCP 服务，复用本地 JD 后端和 Electron 原生 workflow。提供22个工具：13个网页操作、9个 JD/公司/面试/门槛查询。服务不占用新的 HTTP 端口。

## 启动与连接

```powershell
cd <项目根目录>\ops\mcp
npm ci --ignore-scripts
node server.mjs
```

MCP 客户端配置示例，`args` 改为实际绝对路径：

```json
{
  "mcpServers": {
    "jd_collector": {
      "command": "node",
      "args": ["C:/path/to/jd-collector/ops/mcp/server.mjs"]
    }
  }
}
```

后端查询要求 JD 后端已运行。网页工具要求正常 JD Electron 已加载最新桌面构建；旧进程返回 `DESKTOP_UPDATE_REQUIRED`，应保存页内输入后重启客户端。构建命令为 `frontend` 下 `npm run desktop:build`；正常打开仍用项目 `ops/start-desktop.ps1`。后台操作使用已有 `JD_DESKTOP_BACKGROUND_WORKFLOW=true` 配置，标签可见且未最小化时可在不抢系统焦点的情况下操作。

配置遵守项目 `local/env.json` 的环境优先级。`JD_DESKTOP_USER_DATA` 指向目标客户端分区；`JD_MCP_API_URL` 默认 `http://127.0.0.1:7890/jd-collector/api/`，可指定其他回环端口以连接隔离测试后端。不要打印或复制 workflow 连接文件，其内部令牌由客户端读取。

## 使用顺序

1. `jd_browser_info` 检查客户端接口版本，`jd_browser_tabs` 查看标签与来源。
2. `jd_browser_open` 打开 HTTPS 地址，取得 `key`；加载后 `jd_browser_focus` 选择该标签。
3. `jd_browser_capture` 返回原始 PNG 图像内容与 `structuredContent.data` 元数据，包括截图文件路径、哈希、视口、来源、截图ID。
4. 主 Agent 看图，使用最新 `captureId` 执行 click/scroll/type/key；每次动作后重新截图。截图有效期30秒，页面、焦点、几何或像素变化使旧证据失效。
5. 业务资料由 `jd_postings_search` → `jd_posting_get` / `jd_posting_events` 查询；只读工具保留现有 REST 响应。

搜索文本输入仍须先截图点击搜索控件；真实网页只读图像，不执行页面脚本或读取 DOM。认证和验证码由本人在页面完成，消息和投递按现有工作流规则处理。

命令行诊断通过真正的 MCP SDK 客户端调用，不把图片 base64 打进日志：

```powershell
node call.mjs list
node call.mjs jd_health
node call.mjs jd_browser_info
# JSON 参数保存为 UTF-8 文件后传入，避免 Windows shell 丢失引号
node call.mjs jd_postings_search --file search.json
```

## 工具与参数

| 工具 | 参数 |
| --- | --- |
| jd_browser_info / jd_browser_tabs | 无 |
| jd_browser_open | url；可选 key |
| jd_browser_navigate | key、url |
| jd_browser_focus / jd_browser_close / jd_browser_reload | key |
| jd_browser_zoom | key、zoom=in/out/reset |
| jd_browser_capture | key；可选 batchId、rect={x,y,width,height} |
| jd_browser_scroll | key、captureId、x、y、deltaX、deltaY；负deltaY向下 |
| jd_browser_click | key、captureId、x、y、intent=openJob/searchControl/pagination |
| jd_browser_type | key、captureId、text；可选 replace |
| jd_browser_key | key、captureId、keyCode；枚举由 tools/list 提供 |
| jd_health / jd_criteria_get | 无 |
| jd_postings_search | keyword、companyId、resumeVersionId、direction[]、tier[]、stage[]、number、size（均可选） |
| jd_posting_get / jd_posting_events / jd_company_get | id |
| jd_posting_find_source | url |
| jd_companies_search | keyword、number、size（均可选） |
| jd_interviews | postingId、from、to（均可选，本地ISO时间） |

完整字段约束与能力提示通过 MCP `tools/list` 返回。业务失败通过 `isError=true` 返回；浏览器原生失败保留 `TAB_NOT_FOUND`、`READ_BUSY`、`STALE_CAPTURE`、`TARGET_NOT_VISIBLE` 等错误码。超时不自动重发输入。

## 验证

```powershell
npm test
cd ..\..\frontend
npm run desktop:check
npm run desktop:build
node tests/native/run.mjs tests/desktop/mcp-browser.spec.ts
```

MCP测试使用隔离 HTTP/管道和 SDK stdio 握手；原生验收使用独立 userData 和静态领英样式夹具。夹具通过仅证明接口/截图链路，真实领英登录和资料可见性以实际截图为准。
