import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {z} from 'zod';
import {pathToFileURL} from 'node:url';
import {desktopRequest, jdRequest, captureImage} from './desktop.mjs';

const id = z.number().int().positive();
const key = z.string().regex(/^[a-zA-Z0-9:_-]{1,100}$/);
const https = z.string().max(2048).url().refine(value => {
  const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password;
}, '只允许不含凭据的 HTTPS 地址');
const rect = z.object({x: z.number().int().nonnegative(), y: z.number().int().nonnegative(), width: id, height: id}).strict();
const page = {number: id.optional(), size: id.max(100).optional()};
const bound = {key, captureId: z.string().uuid()};
const point = {x: z.number().int().nonnegative(), y: z.number().int().nonnegative()};
const textResult = data => ({content: [{type: 'text', text: JSON.stringify(data)}], structuredContent: {data}});

export function createServer(dependencies = {}) {
  const desktop = dependencies.desktop || desktopRequest;
  const api = dependencies.api || jdRequest;
  const image = dependencies.image || captureImage;
  const server = new McpServer({name: 'jd-collector', version: '0.1.0'});
  const register = (name, description, schema, readOnly, handler, openWorld = false) => {
    server.registerTool(name, {description, inputSchema: schema,
      annotations: {readOnlyHint: readOnly, destructiveHint: false, openWorldHint: openWorld}}, async args => {
      try { return await handler(args); }
      catch (error) { return {isError: true, content: [{type: 'text', text: error.message}]}; }
    });
  };
  const browser = (name, description, action, schema) => register(name, description, schema, ['info', 'tabs', 'capture'].includes(action),
    async args => textResult(await desktop(action, args)), true);
  browser('jd_browser_info', '检查 Electron 是否已加载通用浏览接口；旧客户端会明确提示重启。', 'info', {});
  browser('jd_browser_tabs', '列出 JD Electron 标签及来源 URL、加载状态。标题或 ready 状态不代表已登录。', 'tabs', {});
  browser('jd_browser_open', '在 JD Electron 打开 HTTPS 网页。可指定 key 复用标签；同主机复用会话。不会操作桌面鼠标。', 'open', {url: https, key: key.optional()});
  browser('jd_browser_navigate', '将指定网页标签导航至 HTTPS 地址。导航完成后重新截图核实页面。', 'navigate', {key, url: https});
  browser('jd_browser_focus', '选择 Electron 中的网页标签。后台模式不抢占系统焦点。', 'focus', {key});
  browser('jd_browser_close', '关闭指定外站标签；固定 JD 工作台不能关闭。', 'close', {key});
  browser('jd_browser_reload', '刷新指定外站标签。可能丢失该页未保存输入，应先核实。', 'reload', {key});
  browser('jd_browser_zoom', '调整指定网页标签的页内缩放；随后重新截图。', 'zoom', {key, zoom: z.enum(['in', 'out', 'reset'])});
  register('jd_browser_capture', '使用 Electron capturePage 返回原始 PNG、哈希和页面元数据。读取图像后才可决定页面内容与坐标。',
    {key, batchId: z.string().uuid().optional(), rect: rect.optional()}, true, async args => {
      const ref = await desktop('capture', args);
      return {...textResult(ref), content: [{type: 'text', text: JSON.stringify(ref)}, await image(ref)]};
    }, true);
  browser('jd_browser_scroll', '按最近30秒截图在页内滚动；负 deltaY 向下。每次不得超过一个视口，之后重新截图。', 'scroll',
    {...bound, ...point, deltaX: z.number().int(), deltaY: z.number().int()});
  browser('jd_browser_click', '基于最新截图点击页面链接、搜索控件或翻页。禁止登录验证、消息发送和投递；不使用 DOM。', 'click',
    {...bound, ...point, intent: z.enum(['openJob', 'searchControl', 'pagination'])});
  browser('jd_browser_type', '向已通过截图选中的搜索框输入文本。每次输入后截图；不输入密码、验证码或消息。', 'type',
    {...bound, text: z.string().min(1).max(200), replace: z.boolean().optional()});
  browser('jd_browser_key', '在搜索控件中按键，或执行页内缩放。绑定最新截图。', 'key',
    {...bound, keyCode: z.enum(['Enter', 'Tab', 'Escape', 'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'SelectAll', 'ZoomIn', 'ZoomOut', 'ZoomReset'])});
  const read = (name, description, schema, endpoint, query = args => args) => register(name, description, schema, true,
    async args => textResult(await api(typeof endpoint === 'function' ? endpoint(args) : endpoint, query(args))));
  read('jd_health', '读取本地 JD 后端健康状态。', {}, 'system/health');
  read('jd_postings_search', '查询本地 JD 列表，返回现有分页响应。支持关键词、公司、方向、档位和投递阶段。',
    {...page, keyword: z.string().max(200).optional(), companyId: id.optional(), resumeVersionId: id.optional(),
      direction: z.array(z.enum(['JAVA_BACKEND', 'PLATFORM_BACKEND', 'AI_APPLICATION', 'FULL_STACK', 'AI_TOOLING', 'TEST_PLATFORM'])).optional(),
      tier: z.array(z.enum(['S', 'A', 'B', 'SKIP'])).optional(),
      stage: z.array(z.enum(['COLLECTED', 'SCREENED', 'TO_CONTACT', 'MESSAGE_SENT', 'WAITING_COMMUNICATION', 'CONTACT_NOT_SUITABLE', 'READY_TO_APPLY', 'APPLIED', 'HR_SCREEN', 'WRITTEN_TEST', 'INTERVIEW', 'OFFER', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'CLOSED'])).optional()}, 'postings');
  read('jd_posting_get', '读取指定 JD 的完整详情、JD正文、来源、评分与进度。', {id}, args => 'postings/' + args.id, () => ({}));
  read('jd_posting_find_source', '按已知岗位来源 URL 查重。只访问本地 API。', {url: https}, 'postings/source');
  read('jd_posting_events', '读取指定 JD 的投递阶段历史。', {id}, args => 'postings/' + args.id + '/events', () => ({}));
  read('jd_companies_search', '查询本地公司资料。', {...page, keyword: z.string().max(200).optional()}, 'companies');
  read('jd_company_get', '读取指定公司的详情和已记录招聘信息。', {id}, args => 'companies/' + args.id, () => ({}));
  read('jd_interviews', '查询已记录的面试安排。时间格式使用本地 ISO 日期时间。',
    {postingId: id.optional(), from: z.string().regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?$/).optional(), to: z.string().regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?$/).optional()}, 'interviews');
  read('jd_criteria_get', '读取当前求职门槛与确认状态。', {}, 'criteria');
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await createServer().connect(new StdioServerTransport());
}
