import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const [platform, action = 'tabs', ...args] = process.argv.slice(2);
if (!['BOSS', 'LIEPIN', 'JOB51', 'ZHAOPIN'].includes(platform) || !['open', 'tabs', 'focus', 'inspect', 'read', 'navigate', 'diagnose', 'capture', 'scroll', 'click', 'type', 'key'].includes(action)) {
  console.error('Usage: workflow.mjs PLATFORM open|tabs|focus|navigate [url] [key] OR capture|scroll|click|type|key --key KEY [--capture ID --x N --y N --delta-x N --delta-y N --intent openJob|searchControl|pagination --text TEXT --replace true|false --key-code Enter|SelectAll --batch ID --rect x,y,w,h]');
  process.exit(1);
}
try {
  let payload = {};
  if (['capture', 'scroll', 'click', 'type', 'key'].includes(action)) {
    const names = {key: 'key', capture: 'captureId', batch: 'batchId', rect: 'rect', x: 'x', y: 'y', 'delta-x': 'deltaX', 'delta-y': 'deltaY', text: 'text', replace: 'replace', 'key-code': 'keyCode', intent: 'intent'};
    for (let i = 0; i < args.length; i += 2) {
      const name = names[args[i].slice(2)];
      if (!args[i].startsWith('--') || !name || args[i + 1] === undefined || name in payload) throw new Error('Invalid or duplicate option');
      const value = args[i + 1];
      if (name === 'replace') {
        if (!['true', 'false'].includes(value)) throw new Error('Invalid replace');
        payload.replace = value === 'true';
      } else if (name === 'rect') {
        const dimensions = value.split(',').map(Number);
        if (dimensions.length !== 4 || !dimensions.every(Number.isInteger)) throw new Error('Invalid rect');
        payload.rect = Object.fromEntries(['x', 'y', 'width', 'height'].map((key, n) => [key, dimensions[n]]));
      } else payload[name] = ['x', 'y', 'deltaX', 'deltaY'].includes(name) ? Number(value) : value;
    }
    if (!payload.key) throw new Error('Explicit --key required');
  } else {
    if (args.length > (action === 'navigate' ? 2 : 1)) throw new Error('Too many arguments');
    payload = action === 'navigate' ? {url: args[0], key: args[1]} : {key: args[0]};
  }
  const userData = process.env.JD_DESKTOP_USER_DATA || path.join(process.env.APPDATA || '', 'JD Collector');
  const connection = JSON.parse(fs.readFileSync(path.join(userData, 'workflow-connection.json'), 'utf8'));
  const result = await new Promise((resolve, reject) => {
    const socket = net.connect(connection.pipe);
    let buffer = '';
    socket.setEncoding('utf8');
    socket.setTimeout(20000, () => { socket.destroy(); reject(new Error('Workflow timed out; no automatic retry')); });
    socket.on('error', () => reject(new Error('Desktop workflow unavailable; open or restart JD Collector')));
    socket.on('connect', () => socket.write(JSON.stringify({
      token: connection.token, platform, action,
      ...payload,
    }) + '\n'));
    socket.on('data', chunk => {
      buffer += chunk;
      if (buffer.length > 2_000_000) { socket.destroy(); reject(new Error('Response too large')); }
    });
    socket.on('end', () => {
      try { resolve(JSON.parse(buffer)); } catch { reject(new Error('Invalid workflow response')); }
    });
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
} catch (error) {
  console.error(error.code === 'ENOENT' ? 'Desktop workflow unavailable; open or restart JD Collector' : error.message);
  process.exitCode = 1;
}
