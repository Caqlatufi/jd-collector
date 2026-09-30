import net from 'node:net';
import {readFile} from 'node:fs/promises';
import path from 'node:path';

export async function agentRequest(platform, action, payload = {}) {
  const userData = process.env.JD_DESKTOP_USER_DATA || path.join(process.env.APPDATA || '', 'JD Collector');
  const connection = JSON.parse(await readFile(path.join(userData, 'workflow-connection.json'), 'utf8'));
  return new Promise((resolve, reject) => {
    const socket = net.connect(connection.pipe);
    let buffer = '';
    const fail = () => { socket.destroy(); reject(new Error('DESKTOP_UNAVAILABLE')); };
    socket.setEncoding('utf8');
    socket.setTimeout(20000, fail);
    socket.on('error', fail);
    socket.on('connect', () => socket.write(JSON.stringify({token: connection.token, platform, action, ...payload}) + '\n'));
    socket.on('data', chunk => { buffer += chunk; if (buffer.length > 2_000_000) fail(); });
    socket.on('end', () => {
      try {
        const result = JSON.parse(buffer);
        if (!result.ok) reject(new Error(result.error?.code || 'WORKFLOW_REJECTED'));
        else resolve(result.data);
      } catch { reject(new Error('INVALID_WORKFLOW_RESPONSE')); }
    });
  });
}
