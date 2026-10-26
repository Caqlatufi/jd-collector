import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';

const [name, json = '{}', filename] = process.argv.slice(2);
const client = new Client({name: 'jd-collector-cli', version: '0.1.0'});
try {
  await client.connect(new StdioClientTransport({command: process.execPath, args: [fileURLToPath(new URL('./server.mjs', import.meta.url))], stderr: 'inherit'}));
  const source = json === '-' ? fs.readFileSync(0, 'utf8') : json === '--file' ? fs.readFileSync(filename, 'utf8') : json;
  const result = name === 'list' ? await client.listTools() : await client.callTool({name, arguments: JSON.parse(source.replace(/^\uFEFF/, ''))});
  // Keep image bytes in the MCP response, but do not dump base64 into terminal logs.
  console.log(JSON.stringify({...result, content: result.content?.map(item => item.type === 'image' ? {type: 'image', mimeType: item.mimeType, note: 'PNG stored at structuredContent.data.filePath'} : item)}, null, 2));
  if (result.isError) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof SyntaxError ? '工具参数必须是有效 JSON；PowerShell 建议使用 --file 参数文件。' : error.message);
  process.exitCode = 1;
} finally { await client.close(); }
