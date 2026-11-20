// Smoke test: renders one branded 1080x1350 card to out/smoke-card.png with Playwright.
// Proves the HTML template -> PNG path works on this machine.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const out = path.resolve(here, '..', 'out');
mkdirSync(out, { recursive: true });

const logo = readFileSync(path.join(repo, 'brand/01_Logos/PNG/Linkbot_Logo_White_on_Transparent.png')).toString('base64');

const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  html,body{margin:0}
  .card{width:1080px;height:1350px;background:#172B4D;color:#fff;font-family:Inter,Arial,Helvetica,sans-serif;
        box-sizing:border-box;padding:110px 96px;position:relative;display:flex;flex-direction:column;justify-content:center}
  .tag{color:#9DB8E0;font-weight:600;font-size:30px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:36px}
  h1{font-size:84px;line-height:1.08;font-weight:700;margin:0 0 40px}
  p{font-size:38px;line-height:1.4;font-weight:400;margin:0;color:#E6ECF5}
  .bar{width:120px;height:10px;background:#12488B;border-radius:5px;margin-bottom:48px}
  .logo{position:absolute;right:72px;bottom:64px;height:84px}
</style></head><body>
<div class="card">
  <div class="tag">Example workflow</div>
  <div class="bar"></div>
  <h1>The 3-question automation test</h1>
  <p>Does it happen often? Same steps every time? Does it move information between tools?</p>
  <img class="logo" src="data:image/png;base64,${logo}">
</div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.locator('.card').screenshot({ path: path.join(out, 'smoke-card.png') });
await browser.close();
console.log('Playwright OK -> out/smoke-card.png');
