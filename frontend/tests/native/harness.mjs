import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdtemp, mkdir, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';

const require = createRequire(import.meta.url);
const baseURL = process.env.JD_TEST_BASE_URL || 'http://127.0.0.1:7890/jd-collector/';
if (process.env.JD_TEST_ALLOW_WRITES === '1' && (!process.env.JD_TEST_BASE_URL || new URL(baseURL).port === '7890'))
  throw new Error('Writable tests require an explicitly configured isolated backend, not the personal server on 7890');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const cases = [];
const applications = new Set();
export function test(name, body) { cases.push({name, body}); }
export async function until(body, timeout = 10000) {
  const end = Date.now() + timeout;
  let error;
  do { try { return await body(); } catch (e) { error = e; await pause(60); } } while (Date.now() < end);
  throw error;
}

function literal(value) {
  if (value instanceof RegExp) return {regex: value.source, flags: value.flags};
  return value;
}
function matches(value, expected) { return expected instanceof RegExp ? expected.test(String(value)) : value === expected; }
function subset(actual, expected) {
  return expected && typeof expected === 'object' && !(expected instanceof RegExp)
    ? Object.entries(expected).every(([key, value]) => subset(actual?.[key], value)) : matches(actual, expected);
}
function assertions(actual, negate = false) {
  return new Proxy({}, {get(_target, name) {
    if (name === 'not') return assertions(actual, !negate);
    return (...args) => {
      const [expected] = args;
      let ok;
      switch (name) {
        case 'toBe': ok = Object.is(actual, expected); break;
        case 'toEqual': try { assert.deepEqual(actual, expected); ok = true; } catch { ok = false; } break;
        case 'toMatchObject': ok = subset(actual, expected); break;
        case 'toBeTruthy': ok = Boolean(actual); break;
        case 'toBeUndefined': ok = actual === undefined; break;
        case 'toBeNull': ok = actual === null; break;
        case 'toHaveLength': ok = actual?.length === expected; break;
        case 'toContain': ok = actual?.includes(expected); break;
        case 'toMatch': ok = expected.test(actual); break;
        case 'toBeGreaterThan': ok = actual > expected; break;
        case 'toBeGreaterThanOrEqual': ok = actual >= expected; break;
        case 'toBeLessThan': ok = actual < expected; break;
        case 'toBeCloseTo': ok = Math.abs(actual - expected) < 10 ** -(args[1] ?? 2) / 2; break;
        case 'toHaveProperty': ok = expected in actual && (args.length < 2 || subset(actual[expected], args[1])); break;
        default: throw new Error('Unsupported assertion: ' + String(name));
      }
      assert.ok(negate ? !ok : ok, `${String(name)}${negate ? ' (not)' : ''}: actual=${JSON.stringify(actual)} expected=${String(expected)}`);
    };
  }});
}
function asyncAssertions(getValue, negate = false) {
  return new Proxy({}, {get(_target, name) {
    if (name === 'not') return asyncAssertions(getValue, !negate);
    return (...args) => until(async () => assertions(await getValue(), negate)[name](...args));
  }});
}
export function expect(actual) {
  if (actual instanceof Locator || actual instanceof Page) return new Proxy({}, {get(_target, name) {
    if (name === 'not') return locatorAssertions(actual, true);
    return locatorAssertions(actual)[name];
  }});
  return assertions(actual);
}
expect.poll = body => asyncAssertions(body);
function locatorAssertions(target, negate = false) {
  return new Proxy({}, {get(_target, name) {
    if (name === 'not') return locatorAssertions(target, !negate);
    return (...args) => until(async () => {
      let value; let expected = args[0];
      if (name === 'toHaveURL') value = target.url();
      else {
        const state = await target.state();
        switch (name) {
          case 'toHaveCount': value = state.length; break;
          case 'toBeHidden': value = !state.some(item => item.visible); expected = true; break;
          case 'toBeVisible': value = state.length > 0 && state.every(item => item.visible); expected = true; break;
          case 'toBeInViewport': value = state.length > 0 && state.every(item => item.inViewport); expected = true; break;
          case 'toBeEnabled': value = state.length === 1 && !state[0].disabled; expected = true; break;
          case 'toBeChecked': value = state.length === 1 && state[0].checked; expected = true; break;
          case 'toHaveValue': value = state[0]?.value; break;
          case 'toHaveText': value = state[0]?.text; break;
          case 'toContainText': value = state.map(item => item.text).join(' '); break;
          case 'toHaveClass': value = state[0]?.className; break;
          case 'toHaveAttribute': value = state[0]?.attributes[args[0]]; expected = args[1]; break;
          case 'toHaveCSS': value = await target.evaluate((el, property) => getComputedStyle(el).getPropertyValue(property), args[0]); expected = args[1]; break;
          default: throw new Error('Unsupported UI assertion: ' + name);
        }
      }
      const ok = name === 'toContainText' && !(expected instanceof RegExp) ? value.includes(expected) : matches(value, expected);
      assert.ok(negate ? !ok : ok, `${name}: actual=${JSON.stringify(value)} expected=${String(expected)} selector=${JSON.stringify(target.steps)}`);
    }, args.at(-1)?.timeout || 10000);
  }});
}

// DOM queries exist ONLY in this isolated local UI acceptance harness, never in production platform tools.
function resolveElements(steps) {
  const norm = value => (value || '').replace(/\s+/g, ' ').trim();
  const match = (value, expected, exact = false) => expected?.regex ? new RegExp(expected.regex, expected.flags).test(value)
    : exact ? value === expected : value.includes(expected);
  const accessible = el => {
    for (let current = el; current; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (current.getAttribute('aria-hidden') === 'true' || style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  };
  const name = el => norm(el.getAttribute('aria-label') || (el.getAttribute('aria-labelledby') || '').split(' ').map(id => document.getElementById(id)?.textContent || '').join(' ') ||
    (el.labels ? [...el.labels].map(label => label.textContent).join(' ') : '') || el.textContent || el.getAttribute('title'));
  const roles = {button: 'button,input[type=button],input[type=submit]', textbox: 'input:not([type]),input[type=text],input[type=url],textarea',
    heading: 'h1,h2,h3,h4,h5,h6', radio: 'input[type=radio]', checkbox: 'input[type=checkbox]', navigation: 'nav', combobox: 'select'};
  let nodes = [document];
  for (const step of steps) {
    if (step.kind === 'nth') { nodes = nodes.slice(step.index, step.index + 1); continue; }
    if (step.kind === 'filter') { nodes = nodes.filter(el => match(norm(el.textContent), step.hasText)); continue; }
    if (step.kind === 'css' && step.selector === '..') { nodes = [...new Set(nodes.map(el => el.parentElement).filter(Boolean))]; continue; }
    const selector = step.kind === 'css' ? step.selector : step.kind === 'role'
      ? `[role="${step.role}"]${roles[step.role] ? ',' + roles[step.role] : ''}` : '*';
    nodes = [...new Set(nodes.flatMap(el => [...el.querySelectorAll(selector)]))];
    if (step.kind === 'role') nodes = nodes.filter(el => accessible(el) && (step.name === undefined || match(name(el), step.name, step.exact)));
    if (step.kind === 'title') nodes = nodes.filter(el => match(el.getAttribute('title') || '', step.name, step.exact));
    if (step.kind === 'text') nodes = nodes.filter(el => !['SCRIPT', 'STYLE'].includes(el.tagName) && match(norm(el.textContent), step.name, step.exact) &&
      ![...el.children].some(child => match(norm(child.textContent), step.name, step.exact)));
  }
  return nodes;
}
export class Locator {
  constructor(page, steps = []) { this.page = page; this.steps = steps; }
  add(step) { return new Locator(this.page, [...this.steps, step]); }
  locator(selector) { return this.add({kind: 'css', selector}); }
  getByRole(role, options = {}) { return this.add({kind: 'role', role, ...options, name: literal(options.name)}); }
  getByText(name, options = {}) { return this.add({kind: 'text', ...options, name: literal(name)}); }
  getByTitle(name, options = {}) { return this.add({kind: 'title', ...options, name: literal(name)}); }
  filter({hasText}) { return this.add({kind: 'filter', hasText: literal(hasText)}); }
  first() { return this.nth(0); }
  nth(index) { return this.add({kind: 'nth', index}); }
  async query(source, arg) {
    return this.page.evalSource(`arg => {const elements=(${resolveElements.toString()})(arg.steps);return (${source})(elements,arg.value);}`, {steps: this.steps, value: arg});
  }
  evaluate(fn, arg) { return this.query(`(elements,arg) => {if(elements.length!==1)throw Error('Expected one element, got '+elements.length);return (${fn.toString()})(elements[0],arg);}`, arg); }
  count() { return this.query('elements=>elements.length'); }
  allTextContents() { return this.query('elements=>elements.map(el=>el.textContent)'); }
  getAttribute(name) { return this.evaluate((el, name) => el.getAttribute(name), name); }
  boundingBox() { return this.evaluate(el => { const r = el.getBoundingClientRect(); return {x: r.x, y: r.y, width: r.width, height: r.height}; }); }
  async click() {
    const point = await until(() => this.evaluate(el => {
      el.scrollIntoView({block: 'center', inline: 'nearest', behavior: 'instant'});
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || el.disabled) throw Error('Element not actionable');
      const x = r.x + r.width / 2, y = r.y + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      if (!hit || (!el.contains(hit) && !hit.contains(el))) throw Error('Element covered');
      return {x: Math.round(x), y: Math.round(y)};
    }));
    await this.page.app.rpc('input', {pageId: this.page.id, ...point});
  }
  async fill(text) {
    await this.click();
    await this.page.app.rpc('input', {pageId: this.page.id, text});
    await until(async () => assert.equal(await this.evaluate(el => el.value), text));
  }
  async check() { if (!(await this.state())[0]?.checked) await this.click(); }
  state() { return this.query(`elements=>elements.map(el=>{const r=el.getBoundingClientRect(); const visible=!!(r.width&&r.height)&&getComputedStyle(el).visibility!=='hidden'; return {
    text:(el.textContent||'').replace(/\\s+/g,' ').trim(),value:el.value,className:el.className,attributes:Object.fromEntries([...el.attributes].map(a=>[a.name,a.value])),
    visible,inViewport:visible&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth,disabled:!!el.disabled,checked:!!el.checked||el.getAttribute('aria-checked')==='true'};})`); }
}
export class Page extends Locator {
  constructor(app, id, url) { super(null); this.page = this; this.app = app; this.id = id; this.currentURL = url; this.events = new EventEmitter();
    this.keyboard = {press: keyCode => app.rpc('input', {pageId: id, keyCode})};
    this.request = {get: async url => {const response = await fetch(new URL(url, baseURL)); return {json: () => response.json(), text: () => response.text(), status: () => response.status};}};
  }
  url() { return this.currentURL; }
  evalSource(source, arg) { return this.app.rpc('page', {pageId: this.id, source, arg}); }
  evaluate(fn, arg) { return this.evalSource(fn.toString(), arg); }
  async goto(url) { await this.app.rpc('goto', {pageId: this.id, url: new URL(url, baseURL).href}); }
  async reload() { await Promise.all([this.waitForEvent('domcontentloaded'), this.app.rpc('reload', {pageId: this.id})]); }
  async route(pattern, handler) { this.app.routes.push({pattern, handler, pageId: this.id}); await this.app.rpc('route', {pageId: this.id}); }
  async unroute(pattern) { this.app.routes = this.app.routes.filter(route => String(route.pattern) !== String(pattern)); }
  addInitScript(fn) { return this.app.rpc('init', {pageId: this.id, source: fn.toString()}); }
  setDefaultTimeout() {}
  async setViewportSize(size) {
    await this.app.evaluate(({BrowserWindow}, size) => BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height), size);
    await until(async () => assert.deepEqual(await this.evaluate(() => ({width: innerWidth, height: innerHeight})), size));
    await this.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    // Native Windows scrollbars occupy space. The requested width is the usable layout viewport.
    const scrollbar = await this.evaluate(() => innerWidth - document.documentElement.clientWidth);
    if (scrollbar) {
      await this.app.evaluate(({BrowserWindow}, size) => BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height), {...size, width: size.width + scrollbar});
      await until(async () => assert.equal(await this.evaluate(() => document.documentElement.clientWidth), size.width));
    }
  }
  screenshot(options) { return this.app.rpc('screenshot', {pageId: this.id, path: options.path, fullPage: Boolean(options.fullPage)}); }
  on(event, listener) { this.events.on(event, listener); }
  waitForEvent(event) { return new Promise((resolve, reject) => {
    const done = value => {clearTimeout(timer); resolve(value);};
    const timer = setTimeout(() => {this.events.off(event, done); reject(Error('Event timeout: ' + event));}, 15000);
    this.events.once(event, done);
  }); }
}
function routeMatches(url, pattern) {
  if (pattern instanceof RegExp) return pattern.test(url);
  const expression = pattern.split('**').map(part => part.split('*').map(value => value.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*');
  return new RegExp('^' + expression + '$').test(url);
}
export class ElectronApplication {
  constructor(child) {
    this.child = child; this.pages = new Map(); this.pending = new Map(); this.routes = []; this.sequence = 0;
    applications.add(this);
    child.on('message', message => {
      if (message.page) { const {id, url} = message.page; if (!this.pages.has(id)) this.pages.set(id, new Page(this, id, url)); else this.pages.get(id).currentURL = url; }
      if (message.destroyed) this.pages.delete(message.destroyed);
      if (message.event) this.pages.get(message.pageId)?.events.emit(message.event, message.event === 'download'
        ? {suggestedFilename: () => message.filename} : {message: message.message});
      if (message.id) { const pending = this.pending.get(message.id); if (pending) {clearTimeout(pending.timer); this.pending.delete(message.id); message.error ? pending.reject(Error(message.error)) : pending.resolve(message.result);} }
      if (message.route) void this.handleRoute(message);
    });
    child.on('exit', () => { for (const pending of this.pending.values()) {clearTimeout(pending.timer); pending.reject(Error('Test Electron exited'));} this.pending.clear(); applications.delete(this); });
  }
  async handleRoute(message) {
    const route = [...this.routes].reverse().find(route => routeMatches(message.url, route.pattern));
    const reply = decision => {if (this.child.connected) this.child.send({routeReply: message.route, ...decision});};
    const continueRequest = () => {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(message.method) && process.env.JD_TEST_ALLOW_WRITES !== '1') return reply({kind: 'abort'});
      reply({kind: 'continue', body: message.body});
    };
    if (!route) return continueRequest();
    try { await route.handler({request: () => ({url: () => message.url, method: () => message.method, postDataJSON: () => JSON.parse(message.body)}),
      abort: () => reply({kind: 'abort'}), continue: continueRequest,
      fulfill: options => reply({kind: 'fulfill', status: options.status || 200, body: options.json !== undefined ? JSON.stringify(options.json) : options.body || '',
        headers: {'content-type': options.json !== undefined ? 'application/json' : options.contentType || 'text/plain', ...options.headers}})});
    } catch (error) { this.routeError = error; reply({kind: 'abort'}); }
  }
  rpc(op, data = {}) { return new Promise((resolve, reject) => {
    const id = ++this.sequence;
    const timer = setTimeout(() => {this.pending.delete(id); reject(Error('Native test timeout: ' + op));}, 20000);
    this.pending.set(id, {resolve, reject, timer}); this.child.send({id, op, ...data});
  }); }
  evaluate(fn, arg) { return this.rpc('evaluate', {source: fn.toString(), arg}); }
  context() { return {pages: () => [...this.pages.values()]}; }
  firstWindow() { return until(async () => {
    const id = await this.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0]?.webContents.id);
    const page = this.pages.get(id); assert.ok(page); return page;
  }); }
  async close() {
    if (this.child.exitCode !== null) return;
    const exited = new Promise(resolve => this.child.once('exit', resolve));
    await this.rpc('close').catch(() => {});
    await Promise.race([exited, pause(3000).then(() => {if (this.child.exitCode === null) this.child.kill();})]);
  }
}
export const electron = {async launch({args = [], env = process.env} = {}) {
  const launchEnv = {...env}; delete launchEnv.ELECTRON_RUN_AS_NODE;
  launchEnv.JD_DESKTOP_USER_DATA ||= await mkdtemp(path.join(tmpdir(), 'jd-native-test-'));
  if (args[0]) launchEnv.JD_TEST_DESKTOP_ENTRY = args[0];
  const child = spawn(require('electron'), [path.resolve('tests/native/host.cjs')], {env: launchEnv, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc']});
  const app = new ElectronApplication(child);
  child.stderr.on('data', () => {});
  await app.firstWindow(); return app;
}};
export async function run(suite = 'ui') {
  const results = [];
  for (const item of cases) {
    if (item.name === '本地单用户求职主链路可从页面完成' && process.env.JD_TEST_ALLOW_WRITES !== '1') {
      console.log('SKIP (requires isolated writable backend): ' + item.name); results.push({name: item.name, status: 'skipped'}); continue;
    }
    const start = Date.now(); let app;
    try {
      const needsPage = /\{\s*page\s*\}/.test(item.body.toString());
      if (needsPage) app = await electron.launch();
      await item.body(needsPage ? {page: await app.firstWindow()} : {});
      if (app?.routeError) throw app.routeError;
      console.log('PASS ' + item.name); results.push({name: item.name, status: 'passed', durationMs: Date.now() - start});
    } catch (error) {
      console.error('FAIL ' + item.name + '\n' + error.stack); process.exitCode = 1;
      for (const active of applications) {
        await (await active.firstWindow()).screenshot({path: 'test-results/native-failure-' + results.length + '.png'}).catch(() => {});
        console.error('Isolated pages: ' + JSON.stringify(active.context().pages().map(page => page.url())));
      }
      results.push({name: item.name, status: 'failed', error: error.message});
    } finally { for (const active of [...applications]) await active.close(); }
  }
  await mkdir('test-results', {recursive: true});
  await writeFile('test-results/native-' + suite + '-results.json', JSON.stringify(results, null, 2));
  console.log(JSON.stringify({passed: results.filter(r => r.status === 'passed').length, failed: results.filter(r => r.status === 'failed').length, skipped: results.filter(r => r.status === 'skipped').length}));
}
