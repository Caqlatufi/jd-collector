import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {recognitionSettings} from './recognition/settings.mjs';
import {resolveCodex, codexArguments, runProcess} from './recognition/worker.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function databaseTarget(env) {
  if (!env.JD_COLLECTOR_DB_URL || !env.JD_COLLECTOR_DB_USERNAME ||
      env.JD_COLLECTOR_DB_USERNAME === 'your_database_user' ||
      env.JD_COLLECTOR_DB_PASSWORD === 'replace_with_your_password') throw new Error('DB_CONFIG_REQUIRED');
  try {
    const url = new URL(env.JD_COLLECTOR_DB_URL.replace(/^jdbc:/, ''));
    if (url.protocol !== 'mysql:' || !url.hostname || url.pathname.length < 2) throw new Error();
    return {host: url.hostname.replace(/^\[|\]$/g, ''), port: Number(url.port || 3306)};
  } catch { throw new Error('INVALID_DB_URL'); }
}

function tcpAvailable(target) {
  return new Promise(resolve => {
    const socket = net.connect(target);
    const done = value => { socket.destroy(); resolve(value); };
    socket.setTimeout(2000, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

async function api(resource) {
  const response = await fetch('http://127.0.0.1:7890/jd-collector/api/' + resource,
    {signal: AbortSignal.timeout(3000)});
  const payload = await response.json();
  if (!response.ok || payload.code !== 200) throw new Error('API_UNAVAILABLE');
  return payload.result;
}

async function desktopAvailable(env) {
  const userData = env.JD_DESKTOP_USER_DATA || path.join(env.APPDATA || '', 'JD Collector');
  const connection = JSON.parse(await fs.readFile(path.join(userData, 'workflow-connection.json'), 'utf8'));
  // Only contact the local named pipe. Never print the connection token or tab URLs.
  if (typeof connection.pipe !== 'string' || !connection.pipe.startsWith('\\\\.\\pipe\\jd-collector-') ||
      typeof connection.token !== 'string') return false;
  return new Promise(resolve => {
    const socket = net.connect(connection.pipe);
    let buffer = '';
    const fail = () => { socket.destroy(); resolve(false); };
    socket.setEncoding('utf8');
    socket.setTimeout(3000, fail);
    socket.on('error', fail);
    socket.on('connect', () => socket.write(JSON.stringify({token: connection.token, platform: 'BOSS', action: 'tabs'}) + '\n'));
    socket.on('data', chunk => { buffer += chunk; if (buffer.length > 2_000_000) fail(); });
    socket.on('end', () => { try { resolve(JSON.parse(buffer).ok === true); } catch { resolve(false); } });
  });
}

export async function probeModel(executable, settings, root = projectRoot) {
  const probeRoot = path.join(root, 'runtime/doctor');
  await fs.mkdir(probeRoot, {recursive: true});
  const directory = await fs.mkdtemp(path.join(probeRoot, 'probe-'));
  const output = path.join(directory, 'response.txt');
  const imageFile = path.join(directory, 'probe.png');
  await fs.writeFile(imageFile, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jAfcAAAAASUVORK5CYII=', 'base64'));
  const args = codexArguments({captures: [{filePath: imageFile}]}, directory, output, settings);
  await runProcess(executable, args, 'This is a synthetic image capability check. Return exactly READY. Do not use tools.', directory, 120000);
  return (await fs.readFile(output, 'utf8')).replace(/^\uFEFF/, '').trim() === 'READY';
}

export async function doctor({running = false, probe = false, env = process.env, root = projectRoot,
  request = api, checkDesktop = desktopAvailable} = {}) {
  const checks = [];
  const report = (status, name, message) => checks.push({status, name, message});
  const [major, minor] = process.versions.node.split('.').map(Number);
  report(major > 22 || major === 22 && minor >= 12 ? 'PASS' : 'FAIL', 'Node', '要求 Node.js 22.12+；当前 ' + process.versions.node);
  const java = env.JAVA_HOME ? path.join(env.JAVA_HOME, 'bin/java.exe') : 'java.exe';
  const javaResult = spawnSync(java, ['-version'], {encoding: 'utf8', windowsHide: true, timeout: 5000});
  const javaVersion = (javaResult.stderr || javaResult.stdout || '').match(/version "(\d+)/)?.[1];
  report(javaResult.status === 0 && Number(javaVersion) === 17 ? 'PASS' : 'FAIL', 'Java', '要求 Java 17，使用 JAVA_HOME 或 PATH 配置。');
  try {
    const target = databaseTarget(env);
    report(await tcpAvailable(target) ? 'PASS' : 'FAIL', '数据库端口', '仅验证 TCP 可达；账号权限在启动后由健康检查验证。');
  } catch { report('FAIL', '数据库配置', '请在 local/env.json 填写 JD_COLLECTOR_DB_URL / USERNAME / PASSWORD，不保留示例占位值。'); }
  for (const [file, override] of [['local/JD门槛.json', env.JD_COLLECTOR_CRITERIA_FILE], ['local/resume-starter.md', env.JD_RESUME_STARTER_FILE]]) {
    try { await fs.access(path.resolve(root, override || file)); report('PASS', file, '配置文件可访问。'); }
    catch { report('FAIL', file, '运行 ops/init-local.ps1；核对对应 JD_* 路径配置。'); }
  }
  const artifacts = ['backend/app/build/libs/app-0.1.0.jar', 'frontend/node_modules/electron/dist/electron.exe',
    'frontend/dist-electron/main.cjs', 'frontend/dist-electron/preload.cjs', 'frontend/dist-electron/browser.js',
    'frontend/dist-electron/browser.html', 'frontend/dist-electron/vision.cjs'];
  let built = true;
  for (const file of artifacts) { try { await fs.access(path.join(root, file)); } catch { built = false; } }
  report(built ? 'PASS' : running ? 'FAIL' : 'WARN', '构建产物', built ? 'JAR、Electron 和识别校验器齐全。' : '安装前端依赖和 Electron 后运行 ops/build.ps1。');
  let settings;
  let executable;
  try { settings = recognitionSettings(env); report('PASS', '识别参数', settings.model + ' / ' + settings.reasoningEffort); }
  catch { report('FAIL', '识别参数', '模型名无效或推理强度不属于 low / medium / high / xhigh。'); }
  const enabled = (env.JD_RECOGNITION_ENABLED || 'true') === 'true';
  if (!['true', 'false'].includes(env.JD_RECOGNITION_ENABLED || 'true')) report('FAIL', '识别开关', 'JD_RECOGNITION_ENABLED 只能为 true 或 false。');
  report(enabled ? 'PASS' : 'WARN', '识别开关', enabled ? '新启动的后端将启用截图识别。' : '采集前在 local/env.json 设置 JD_RECOGNITION_ENABLED=true，并重启后端。');
  try {
    executable = await resolveCodex(env.JD_RECOGNITION_CODEX || '');
    if (/\.(cmd|bat)$/i.test(executable)) throw new Error('CLI_SHIM');
    const version = spawnSync(executable, ['--version'], {encoding: 'utf8', windowsHide: true, timeout: 5000});
    if (version.status !== 0) throw new Error('CLI_UNAVAILABLE');
    report('PASS', 'Codex CLI', '可执行文件可运行；不输出安装路径或认证信息。');
    const login = spawnSync(executable, ['login', 'status'], {encoding: 'utf8', windowsHide: true, timeout: 5000});
    report(login.status === 0 ? 'PASS' : enabled || probe ? 'FAIL' : 'WARN', 'Codex 登录', login.status === 0 ? 'CLI 报告已登录；模型权限需另行探测。' : '使用相同的 Codex 可执行文件执行 login。');
  } catch {
    executable = undefined;
    report(enabled || probe ? 'FAIL' : 'WARN', 'Codex CLI', '安装 Codex，并将 JD_RECOGNITION_CODEX 指向原生 codex.exe；不接受 codex.cmd / .bat 启动器。');
  }
  if (running) {
    try {
      const health = await request('system/health');
      report(health.service === 'jd-collector' && health.status === 'UP' ? 'PASS' : 'FAIL', '后端健康', '验证已启动的 JD Collector。');
      const actual = await request('recognition/config');
      const directory = path.resolve(root, env.JD_RECOGNITION_WORK_DIRECTORY || 'runtime/jd-screenshots');
      report(settings && actual.enabled === enabled && actual.model === settings.model && actual.reasoningEffort === settings.reasoningEffort &&
        path.resolve(actual.workDirectory) === directory ? 'PASS' : 'FAIL', '运行配置', '配置与当前进程不一致时，停止并重启后端。');
    } catch { report('FAIL', '后端健康', '运行 ops/start.ps1；检查 runtime 日志，勿回显连接密码。'); }
    try {
      const masters = await request('resume-versions?active=true&type=MASTER');
      report(Array.isArray(masters) && masters.length === 1 && masters[0].contentReady ? 'PASS' : 'WARN', '简历母版', '采集前保存一个含正文的启用 Master；模板文件不会自动入库。');
      const {document: criteria} = await request('criteria');
      const confirmed = criteria.sections?.flatMap(section => section.fields || []).some(field =>
        field.status === 'CONFIRMED' && field.value !== null && field.value !== undefined && String(field.value).trim() !== '');
      report(confirmed || criteria.baselineRules?.length ? 'PASS' : 'WARN', '采集门槛', '只使用已确认答案；未填写示例不作为筛选条件。');
    } catch { report('FAIL', '简历与门槛', '检查 resume-versions 与 criteria 接口。'); }
    try { report(await checkDesktop(env) ? 'PASS' : 'FAIL', '桌面连接', '只读验证 workflow；不代表招聘平台已登录。'); }
    catch { report('FAIL', '桌面连接', '运行 ops/start-desktop.ps1；检查 JD_DESKTOP_USER_DATA 是否与桌面一致。'); }
  }
  if (probe && executable && settings) {
    try { report(await probeModel(executable, settings, root) ? 'PASS' : 'FAIL', '模型探测', '使用实际识别参数和合成图片探测；不涉及简历或招聘平台。'); }
    catch { report('FAIL', '模型探测', '检查模型权限、网络和 CLI 版本；诊断保存在 runtime/doctor/，不自动更换模型。'); }
  } else if (!probe) report('WARN', '模型探测', '未请求模型调用；用 ops/doctor.ps1 -ProbeModel 验证，会消耗额度。');
  return checks;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--running', '--probe-model'].includes(arg))) {
    console.error('Usage: powershell -File ops/doctor.ps1 [-Running] [-ProbeModel]');
    process.exitCode = 1;
  } else {
    try {
      const checks = await doctor({running: args.includes('--running'), probe: args.includes('--probe-model')});
      for (const check of checks) console.log(`[${check.status}] ${check.name}: ${check.message}`);
      process.exitCode = checks.some(check => check.status === 'FAIL') ? 1 : 0;
    } catch { console.error('[FAIL] 环境检查未完成；检查配置格式与依赖，不输出配置值。'); process.exitCode = 1; }
  }
}
