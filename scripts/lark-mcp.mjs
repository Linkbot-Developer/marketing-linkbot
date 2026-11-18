// Launches Lark's official MCP server with credentials read from .env,
// so the app ID and secret never appear in .mcp.json or in Git.
//   node scripts/lark-mcp.mjs         -> run the MCP server (used by .mcp.json)
//   node scripts/lark-mcp.mjs login   -> log in to Lark as yourself (opens browser)
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = {};
for (const line of readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2];
}
const { LARK_APP_ID: id, LARK_APP_SECRET: secret, LARK_DOMAIN: domain = 'https://open.larksuite.com' } = env;
if (!id || !secret) {
  console.error('LARK_APP_ID and LARK_APP_SECRET must be set in .env');
  process.exit(1);
}

const mode = process.argv[2] === 'login' ? 'login' : 'mcp';
const args = ['-y', '@larksuiteoapi/lark-mcp', mode, '-a', id, '-s', secret, '--domain', domain];
// Default tools plus Drive folders/files and Wiki spaces/pages for the Marketing workspace.
const tools = [
  'preset.default',
  'drive.v1.file.list', 'drive.v1.file.createFolder', 'drive.v1.file.move', 'drive.v1.meta.batchQuery',
  'drive.v1.importTask.create', 'drive.v1.importTask.get',
  'wiki.v2.space.list', 'wiki.v2.space.get', 'wiki.v2.space.create', 'wiki.v2.space.getNode',
  'wiki.v2.spaceNode.list', 'wiki.v2.spaceNode.create', 'wiki.v2.spaceNode.moveDocsToWiki', 'wiki.v2.spaceNode.updateTitle',
].join(',');
if (mode === 'mcp') args.push('--oauth', '--token-mode', 'user_access_token', '-t', tools);

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const child = spawn(npx, args, { stdio: 'inherit', shell: process.platform === 'win32' });
child.on('exit', (code) => process.exit(code ?? 0));
