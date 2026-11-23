// Tiny n8n Public API helper. Reads N8N_BASE_URL / N8N_API_KEY from the repo .env. Never prints secrets.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const env = {};
for (const line of readFileSync(path.join(repo, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*([^#]*?)\s*(#.*)?$/);
  if (m && m[2]) env[m[1]] = m[2];
}
export const base = (env.N8N_BASE_URL ?? '').replace(/\/$/, '');
export async function n8n(method, p, body) {
  const res = await fetch(`${base}/api/v1${p}`, {
    method, headers: { 'X-N8N-API-KEY': env.N8N_API_KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) throw new Error(`n8n ${method} ${p}: HTTP ${res.status} ${typeof json === 'string' ? json.slice(0, 300) : JSON.stringify(json).slice(0, 300)}`);
  return json;
}
