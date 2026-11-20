// Test render of a real planned post (W49-IG-03) through the image pipeline:
//   visual brief -> AI image (Gemini, and Cloudflare Workers AI as fallback) -> brand overlay + logo (Playwright)
// Writes out/W49-IG-03_<provider>_raw.png and out/W49-IG-03_<provider>_final.png. Never prints keys.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const out = path.resolve(here, '..', 'out');
mkdirSync(out, { recursive: true });

const env = {};
for (const line of readFileSync(path.join(repo, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*([^#]*?)\s*(#.*)?$/);
  if (m && m[2]) env[m[1]] = m[2];
}

// From content/2026-W49/test-batch.md -> W49-IG-03 visual brief, expanded per agents/copywriter.md rules.
const post = {
  id: 'W49-IG-03',
  overlay: 'Friday 5pm.<br>Report still not done.',
  prompt:
    'Photorealistic, candid photo of a tired office worker in a modern Singapore office on a Friday evening, ' +
    'sitting at a desk covered in printed reports and sticky notes, laptop open, office emptying out behind them. ' +
    'Warm golden end-of-day light through the windows, natural colours with subtle navy and blue accents in the decor. ' +
    'No clocks or watches visible. ' +
    'Real-looking person, relatable and slightly humorous mood, not cartoonish. ' +
    'Vertical 4:5 composition, subject in the upper two-thirds, lower third calm and uncluttered. ' +
    'No readable text, no logos or brand marks (unbranded laptops and phones), no words on screens or papers, no watermarks. No robots, no sci-fi.',
};

async function gemini() {
  const model = env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ text: post.prompt }] }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '4:5' } },
    }),
    signal: AbortSignal.timeout(120000),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${body.error?.message?.slice(0, 200)}`);
  const part = body.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) throw new Error('Gemini returned no image');
  return { buf: Buffer.from(part.inlineData.data, 'base64'), mime: part.inlineData.mimeType, model };
}

async function cloudflare() {
  const model = env.CLOUDFLARE_IMAGE_MODEL || '@cf/black-forest-labs/flux-1-schnell';
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
    body: JSON.stringify({ prompt: post.prompt, steps: 8 }),
    signal: AbortSignal.timeout(120000),
  });
  const body = await res.json();
  if (!res.ok || !body.result?.image) throw new Error(`Cloudflare HTTP ${res.status}: ${JSON.stringify(body.errors ?? '').slice(0, 200)}`);
  return { buf: Buffer.from(body.result.image, 'base64'), mime: 'image/jpeg', model };
}

async function compose(img, provider) {
  const logo = readFileSync(path.join(repo, 'brand/01_Logos/PNG/Linkbot_Logo_White_on_Transparent.png')).toString('base64');
  const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@600;700&display=swap" rel="stylesheet">
<style>
 html,body{margin:0}
 .c{width:1080px;height:1350px;position:relative;overflow:hidden;font-family:Inter,Arial,sans-serif}
 .bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
 .band{position:absolute;left:0;right:0;bottom:0;height:400px;
       background:linear-gradient(180deg,rgba(23,43,77,0) 0%,rgba(23,43,77,.88) 38%,#172B4D 100%)}
 .text{position:absolute;left:80px;right:300px;bottom:110px;display:flex;flex-direction:column;gap:28px}
 h1{margin:0;color:#fff;font-size:72px;line-height:1.08;font-weight:700}
 .accent{width:110px;height:10px;border-radius:5px;background:#12488B}
 .logo{position:absolute;right:64px;bottom:60px;height:76px}
</style></head><body><div class="c">
 <img class="bg" src="data:${img.mime};base64,${img.buf.toString('base64')}">
 <div class="band"></div>
 <div class="text"><div class="accent"></div><h1>${post.overlay}</h1></div>
 <img class="logo" src="data:image/png;base64,${logo}">
</div></body></html>`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
  await page.setContent(html, { waitUntil: 'networkidle' });
  const file = path.join(out, `${post.id}_${provider}_final.png`);
  await page.locator('.c').screenshot({ path: file });
  await browser.close();
  return file;
}

for (const [provider, fn] of [['gemini', gemini], ['cloudflare', cloudflare]]) {
  const t = Date.now();
  try {
    const img = await fn();
    writeFileSync(path.join(out, `${post.id}_${provider}_raw.${img.mime.includes('png') ? 'png' : 'jpg'}`), img.buf);
    const file = await compose(img, provider);
    console.log(`✅ ${provider} (${img.model}) ${((Date.now() - t) / 1000).toFixed(1)}s -> ${path.relative(path.resolve(here, '..'), file)}`);
  } catch (e) {
    console.log(`❌ ${provider}: ${e.message}`);
  }
}
