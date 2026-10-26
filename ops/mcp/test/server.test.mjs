import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../server.mjs';
import {jdRequest, desktopRequest, captureImage} from '../desktop.mjs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {createServer as httpServer} from 'node:http';
import net from 'node:net';
import {once} from 'node:events';
import {mkdtemp, writeFile, mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

async function connected(deps) {
  const server = createServer(deps);
  const client = new Client({name: 'test', version: '1'});
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a); await client.connect(b);
  return {server, client};
}

test('MCP exposes documented queries and native browser tools; rejects invalid URLs before dispatch', async () => {
  const requests = [];
  const {server, client} = await connected({desktop: async (action, args) => {requests.push({action, args}); return {key: 'page'};}});
  try {
    const {tools} = await client.listTools();
    assert.ok(tools.some(t => t.name === 'jd_posting_events'));
    assert.ok(tools.some(t => t.name === 'jd_browser_capture'));
    assert.ok(!tools.some(t => /eval|cookie|password|delete_posting/.test(t.name)));
    for (const url of ['http://example.com/', 'https://name:secret@example.com/', 'file:///C:/secret']) {
      const result = await client.callTool({name: 'jd_browser_open', arguments: {url}});
      assert.equal(result.isError, true);
    }
    assert.equal(requests.length, 0);
    await client.callTool({name: 'jd_browser_open', arguments: {url: 'https://www.linkedin.com/in/example'}});
    assert.deepEqual(requests, [{action: 'open', args: {url: 'https://www.linkedin.com/in/example'}}]);
  } finally { await client.close(); await server.close(); }
});

test('capture MCP result contains both native image content and immutable provenance', async () => {
  const ref = {captureId: 'fixture', sha256: 'hash', filePath: 'fixture.png'};
  const {server, client} = await connected({desktop: async () => ref, image: async () => ({type: 'image', mimeType: 'image/png', data: 'aGVsbG8='})});
  try {
    const result = await client.callTool({name: 'jd_browser_capture', arguments: {key: 'person'}});
    assert.deepEqual(result.structuredContent.data, ref);
    assert.equal(result.content[1].type, 'image');
  } finally { await client.close(); await server.close(); }
});

test('stdio SDK handshake, tool discovery, query filters and details work against an isolated HTTP backend', async () => {
  const requests = [];
  const backend = httpServer((req, res) => {
    requests.push({method: req.method, url: req.url});
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({code: 200, result: {id: 105, title: '分析软件工程师'}}));
  });
  backend.listen(0, '127.0.0.1'); await once(backend, 'listening');
  const client = new Client({name: 'stdio-test', version: '1'});
  try {
    const transport = new StdioClientTransport({command: process.execPath, args: [fileURLToPath(new URL('../server.mjs', import.meta.url))],
      env: {...process.env, JD_MCP_API_URL: `http://127.0.0.1:${backend.address().port}/jd-collector/api/`}, stderr: 'pipe'});
    await client.connect(transport);
    assert.ok((await client.listTools()).tools.length >= 20);
    const result = await client.callTool({name: 'jd_posting_get', arguments: {id: 105}});
    assert.equal(result.structuredContent.data.result.id, 105);
    await client.callTool({name: 'jd_postings_search', arguments: {keyword: '新鸿基', stage: ['APPLIED', 'HR_SCREEN'], size: 5}});
    assert.ok(requests.every(r => r.method === 'GET'));
    assert.equal(requests[0].url, '/jd-collector/api/postings/105');
    const query = new URL(requests[1].url, 'http://localhost').searchParams;
    assert.equal(query.get('keyword'), '新鸿基');
    assert.deepEqual(query.getAll('stage'), ['APPLIED', 'HR_SCREEN']);
  } finally { await client.close(); await new Promise(resolve => backend.close(resolve)); }
  await assert.rejects(jdRequest('postings', {}, {JD_MCP_API_URL: 'https://example.com/jd-collector/api/'}), /CONFIG_INVALID/);
});

test('old Electron gives an explicit upgrade message without exposing its transport token', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'jd-mcp-transport-'));
  const pipe = process.platform === 'win32' ? '\\\\.\\pipe\\jd-mcp-test-' + process.pid : path.join(dir, 'socket');
  const transport = net.createServer(socket => socket.once('data', () => socket.end(JSON.stringify({ok: false, error: {code: 'PLATFORM_DISABLED', message: '未注册的平台'}}))));
  transport.listen(pipe); await once(transport, 'listening');
  await writeFile(path.join(dir, 'workflow-connection.json'), JSON.stringify({pipe, token: 'fixture-token'}));
  try { await assert.rejects(desktopRequest('info', {}, {JD_DESKTOP_USER_DATA: dir}), /DESKTOP_UPDATE_REQUIRED/); }
  finally { await new Promise(resolve => transport.close(resolve)); }
});

test('image output verifies native capture root and file hash', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'jd-mcp-image-'));
  await mkdir(path.join(dir, 'captures'));
  const filePath = path.join(dir, 'captures', 'fixture.png');
  const bytes = Buffer.from('fixture-png'); await writeFile(filePath, bytes);
  const ref = {filePath, sha256: createHash('sha256').update(bytes).digest('hex')};
  assert.equal((await captureImage(ref, {JD_DESKTOP_USER_DATA: dir})).data, bytes.toString('base64'));
  await assert.rejects(captureImage({...ref, sha256: 'wrong'}, {JD_DESKTOP_USER_DATA: dir}), /HASH_MISMATCH/);
  await assert.rejects(captureImage({...ref, filePath: path.join(dir, 'outside.png')}, {JD_DESKTOP_USER_DATA: dir}), /PATH_INVALID/);
});
