import {desktop} from '../../common/desktop/client';
import type {BrowserState, DesktopCommand, DesktopCommands} from '../../common/desktop/contract';

const tabs = document.querySelector<HTMLDivElement>('#tabs')!;
const address = document.querySelector<HTMLInputElement>('#address')!;
const status = document.querySelector<HTMLSpanElement>('#status')!;
const empty = document.querySelector<HTMLElement>('#empty')!;
let rows: BrowserState[] = [];
let adding = false;
const active = () => rows.find(row => row.active);
function showStatus(message: string, warning = false) {
  address.title = message;
  status.hidden = !warning;
  status.textContent = warning ? '⚠' : '';
  status.title = message;
  status.setAttribute('aria-label', message);
}
async function request<K extends DesktopCommand>(command: K, input: DesktopCommands[K]['input']) {
  try { return await desktop.request(command, input); }
  catch (error) { showStatus(error instanceof Error ? error.message : '操作失败', true); }
}
function render() {
  tabs.replaceChildren();
  for (const row of rows) {
    const tab = document.createElement('div'); tab.className = 'tab' + (row.active ? ' active' : ''); tab.dataset.key = row.key;
    const choose = document.createElement('button'); choose.className = 'choose'; choose.textContent = row.title; choose.title = row.title;
    choose.setAttribute('role', 'tab'); choose.setAttribute('aria-selected', String(Boolean(row.active)));
    choose.onclick = () => { adding = false; void request('browser.focus', {key: row.key}); };
    const close = document.createElement('button'); close.className = 'close'; close.textContent = '×'; close.title = '关闭标签'; close.setAttribute('aria-label', '关闭 ' + row.title);
    close.onclick = () => { void request('browser.close', {key: row.key}); };
    tab.append(choose); if (!row.pinned) tab.append(close); tabs.append(tab);
  }
  const current = active();
  if (document.activeElement !== address && !adding) address.value = current?.pinned ? 'JD Collector · 本地求职工作台' : current?.url || '';
  address.disabled = Boolean(current?.pinned && !adding);
  showStatus(adding ? '输入网址并按回车，在新标签中打开' : current?.pinned ? '' : current?.message || '',
    !adding && (current?.status === 'failed' || current?.status === 'blank'));
  document.querySelector<HTMLButtonElement>('#back')!.disabled = !current?.canGoBack;
  document.querySelector<HTMLButtonElement>('#forward')!.disabled = !current?.canGoForward;
  document.querySelector<HTMLButtonElement>('#reload')!.disabled = !current || Boolean(current.pinned);
  document.querySelector<HTMLButtonElement>('#zoom-reset')!.textContent = Math.round((current?.zoomFactor || 1) * 100) + '%';
  empty.hidden = rows.length > 0;
}
async function open(value: string) {
  let url: URL;
  try { url = new URL(value.includes('://') ? value : 'https://' + value); }
  catch { showStatus('请输入正确网址', true); return; }
  const current = active();
  if (!adding && current && !current.pinned) await request('browser.navigate', {key: current.key, url: url.href});
  else {
    const sessionKey = url.hostname.replace(/[^a-zA-Z0-9_-]/g, '_');
    await request('browser.open', {key: 'tab-' + crypto.randomUUID(), sessionKey, url: url.href});
  }
  adding = false;
  await refresh();
}
async function refresh() { const result = await request('browser.list', {}); if (result) { rows = result; render(); } }
const unsubscribe = desktop.on('browser.changed', row => {
  const index = rows.findIndex(item => item.key === row.key);
  if (row.status === 'closed') rows = rows.filter(item => item.key !== row.key);
  else if (index < 0) rows.push(row); else rows[index] = row;
  render();
});
window.addEventListener('beforeunload', unsubscribe, {once: true});
document.querySelector('#new-tab')!.addEventListener('click', () => { adding = true; address.disabled = false; address.value = ''; address.focus(); render(); });
document.querySelector('#address-form')!.addEventListener('submit', event => { event.preventDefault(); if (address.value.trim()) void open(address.value.trim()); });
for (const action of ['back', 'forward', 'reload'] as const) document.querySelector('#' + action)!.addEventListener('click', () => {
  const current = active(); if (current) void request(`browser.${action}`, {key: current.key});
});
document.querySelector('#workbench')!.addEventListener('click', () => { void request('window.focus', {}); });
for (const action of ['in', 'out', 'reset'] as const) document.querySelector('#zoom-' + action)!.addEventListener('click', () => {
  const current = active(); if (current) void request('browser.zoom', {key: current.key, action});
});
document.querySelectorAll<HTMLButtonElement>('[data-url]').forEach(button => button.addEventListener('click', () => { adding = true; void open(button.dataset.url!); }));
void refresh();
