// Checks every external connection the marketing system uses, reading keys from .env.
// Prints only OK / FAIL / NOT SET with HTTP status codes. It never prints key values.
//   npm run check
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = {};
for (const line of readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*([^#]*?)\s*(#.*)?$/);
  if (m && m[2]) env[m[1]] = m[2];
}

const has = (...keys) => keys.every((k) => env[k]);
const results = [];
async function check(name, needed, fn) {
  if (!has(...needed)) return results.push([name, 'NOT SET', `needs ${needed.join(', ')}`]);
  try {
    const detail = await fn();
    results.push([name, 'OK', detail ?? '']);
  } catch (e) {
    results.push([name, 'FAIL', String(e.message ?? e).slice(0, 160)]);
  }
}
async function http(url, opts = {}) {
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json().catch(() => ({}));
}

await check('Lark app credentials', ['LARK_APP_ID', 'LARK_APP_SECRET'], async () => {
  const domain = env.LARK_DOMAIN || 'https://open.larksuite.com';
  const r = await http(`${domain}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: env.LARK_APP_ID, app_secret: env.LARK_APP_SECRET }),
  });
  if (r.code !== 0) throw new Error(`Lark code ${r.code}: ${r.msg}`);
  return 'tenant token issued';
});

await check('Claude API', ['ANTHROPIC_API_KEY'], async () => {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const model = env.CLAUDE_MODEL || 'claude-opus-5-5';
  const m = await client.models.retrieve(model);
  return `model ${m.id} available`;
});

await check('Gemini API', ['GEMINI_API_KEY'], async () => {
  const r = await http('https://generativelanguage.googleapis.com/v1beta/models', {
    headers: { 'x-goog-api-key': env.GEMINI_API_KEY },
  });
  const images = (r.models ?? []).filter((m) => /image/i.test(m.name)).map((m) => m.name.replace('models/', ''));
  return `${r.models?.length ?? 0} models; image-capable: ${images.slice(0, 4).join(', ') || 'none listed'}`;
});

await check('Cloudflare API token', ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'], async () => {
  const r = await http(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/tokens/verify`, {
    headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
  }).catch(() => http('https://api.cloudflare.com/client/v4/user/tokens/verify', {
    headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
  }));
  return `token ${r.result?.status ?? 'verified'}`;
});

await check('Cloudflare Workers AI', ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'], async () => {
  const model = env.CLOUDFLARE_IMAGE_MODEL || '@cf/black-forest-labs/flux-1-schnell';
  await http(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/models/search?search=${encodeURIComponent(model.split('/').pop())}`, {
    headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
  });
  return `can access Workers AI (${model})`;
});

await check('Renderer service', ['RENDERER_URL'], async () => {
  await http(`${env.RENDERER_URL.replace(/\/$/, '')}/health`, { headers: { Authorization: `Bearer ${env.RENDERER_API_KEY ?? ''}` } });
  return 'healthy';
});

await check('Meta (Facebook Page)', ['META_PAGE_ACCESS_TOKEN', 'META_PAGE_ID'], async () => {
  const r = await http(`https://graph.facebook.com/${env.META_PAGE_ID}?fields=name`, {
    headers: { Authorization: `Bearer ${env.META_PAGE_ACCESS_TOKEN}` },
  });
  return `page "${r.name}"`;
});

await check('Meta (Instagram)', ['META_PAGE_ACCESS_TOKEN', 'META_IG_USER_ID'], async () => {
  const r = await http(`https://graph.facebook.com/${env.META_IG_USER_ID}?fields=username`, {
    headers: { Authorization: `Bearer ${env.META_PAGE_ACCESS_TOKEN}` },
  });
  return `@${r.username}`;
});

await check('LinkedIn', ['LINKEDIN_ACCESS_TOKEN'], async () => {
  await http('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${env.LINKEDIN_ACCESS_TOKEN}` } });
  return 'token valid';
});

await check('TikTok', ['TIKTOK_ACCESS_TOKEN'], async () => {
  const r = await http('https://open.tiktokapis.com/v2/user/info/?fields=display_name', {
    headers: { Authorization: `Bearer ${env.TIKTOK_ACCESS_TOKEN}` },
  });
  return `account "${r.data?.user?.display_name ?? '?'}"`;
});

const w = Math.max(...results.map((r) => r[0].length));
for (const [name, status, detail] of results) {
  const icon = status === 'OK' ? '✅' : status === 'FAIL' ? '❌' : '⬜';
  console.log(`${icon} ${name.padEnd(w)}  ${status.padEnd(7)}  ${detail}`);
}
