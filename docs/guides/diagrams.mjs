// Generates the guide diagrams (SVG + PNG) in docs/guides/img/.   node docs/guides/diagrams.mjs
// PNGs are rendered with the renderer's Playwright Chromium at 2x for crisp images in Lark Docs.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'img');
mkdirSync(out, { recursive: true });

const C = {
  teal: { fill: '#E1F5EE', stroke: '#0F6E56', title: '#085041', sub: '#0F6E56' },
  purple: { fill: '#EEEDFE', stroke: '#534AB7', title: '#3C3489', sub: '#534AB7' },
  gray: { fill: '#F1EFE8', stroke: '#5F5E5A', title: '#444441', sub: '#5F5E5A' },
  navy: { fill: '#E8EDF5', stroke: '#12488B', title: '#172B4D', sub: '#12488B' },
};
const ARROW = '#73726C';
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const box = (x, y, w, ramp, title, sub, h = 56) => {
  const c = C[ramp];
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1"/>
<text x="${x + w / 2}" y="${y + (sub ? 19 : h / 2)}" text-anchor="middle" dominant-baseline="central" font-size="14" font-weight="600" fill="${c.title}">${esc(title)}</text>
${sub ? `<text x="${x + w / 2}" y="${y + 38}" text-anchor="middle" dominant-baseline="central" font-size="12" fill="${c.sub}">${esc(sub)}</text>` : ''}`;
};
const line = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${ARROW}" stroke-width="1.2" marker-end="url(#a)"/>`;
const pathA = (d) => `<path d="${d}" fill="none" stroke="${ARROW}" stroke-width="1.2" marker-end="url(#a)"/>`;
const note = (x, y, t, anchor = 'start') => `<text x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="central" font-size="12" fill="#5F5E5A">${esc(t)}</text>`;
const legend = (y, items) => {
  let x = 40;
  return items.map(([ramp, label]) => {
    const s = `<rect x="${x}" y="${y}" width="14" height="14" rx="3" fill="${C[ramp].fill}" stroke="${C[ramp].stroke}"/>${note(x + 22, y + 7, label)}`;
    x += 40 + label.length * 7;
    return s;
  }).join('');
};
const svg = (h, title, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="680" height="${h}" viewBox="0 0 680 ${h}" font-family="Inter, Arial, Helvetica, sans-serif">
<title>${esc(title)}</title>
<defs><marker id="a" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke="${ARROW}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>
<rect width="680" height="${h}" fill="#FFFFFF"/>
${body}
</svg>`;

const diagrams = {
  // Who does what (both guides)
  '1-overview': svg(410, 'Linkbot marketing system: who does what', [
    box(40, 40, 180, 'teal', 'GitHub', 'Code and its history'),
    box(250, 40, 180, 'purple', 'Server (DigitalOcean)', 'Writes and renders posts'),
    box(460, 40, 180, 'teal', 'AI services', 'Gemini, Cloudflare, TTS'),
    line(222, 68, 248, 68), line(432, 68, 458, 68),
    box(250, 170, 180, 'purple', 'n8n Cloud', 'The manager: timing, glue'),
    line(340, 168, 340, 98),
    pathA('M 290 226 L 290 260 L 130 260 L 130 298'),
    pathA('M 390 226 L 390 260 L 550 260 L 550 298'),
    line(340, 298, 340, 228),
    box(40, 300, 180, 'teal', 'Lark', 'Base, cards, alerts'),
    box(250, 300, 180, 'gray', 'Approver', 'marketing@ clicks a card'),
    box(460, 300, 180, 'teal', 'Social platforms', 'FB, IG, LinkedIn, TikTok'),
    legend(380, [['purple', 'Our system'], ['teal', 'Outside service we use'], ['gray', 'Person']]),
  ].join('\n')),

  // Life of one post (both guides)
  '2-lifecycle': svg(300, 'Life of one post', [
    box(40, 40, 180, 'gray', '1. Plan', 'W1 · weekly AI planner'),
    box(250, 40, 180, 'teal', '2. Generate', 'Daily: write, check, render'),
    box(460, 40, 180, 'teal', '3. Approve', 'W4, W5 · Lark card'),
    line(222, 68, 248, 68), line(432, 68, 458, 68), line(550, 98, 550, 168),
    box(460, 170, 180, 'gray', '4. Publish', 'W6, W8 · platform APIs'),
    box(250, 170, 180, 'gray', '5. Measure', 'W9 · after 24 h and 7 days'),
    box(40, 170, 180, 'gray', '6. Report', 'W10 · weekly, monthly'),
    line(458, 198, 432, 198), line(248, 198, 222, 198), line(130, 168, 130, 98),
    note(140, 133, 'Feeds next week'),
    legend(258, [['teal', 'Built and working'], ['gray', 'Still to build']]),
  ].join('\n')),

  // Deployment (developer guide): native install, CI/CD by GitHub Actions
  '3-deployment': svg(300, 'How code gets to the server', [
    box(40, 40, 130, 'gray', 'Developer PC', 'git push'),
    box(195, 40, 130, 'teal', 'GitHub', 'Private repo'),
    box(350, 40, 130, 'teal', 'GitHub Actions', 'Test and bundle'),
    box(505, 40, 135, 'purple', 'Server', 'PM2 + Caddy'),
    line(172, 68, 193, 68), line(327, 68, 348, 68), line(482, 68, 503, 68),
    box(350, 170, 130, 'navy', '.env secrets', 'Server only'),
    box(505, 170, 135, 'purple', 'n8n W2', 'Starts it at 17:00 SGT'),
    pathA('M 415 168 L 415 125 L 540 125 L 540 98'),
    line(572, 168, 572, 98),
    note(40, 125, 'Every push to main deploys automatically.'),
    note(40, 145, 'The server never builds; no Docker.'),
    legend(258, [['purple', 'On the server'], ['teal', 'GitHub'], ['navy', 'Secrets (never in Git)'], ['gray', 'Your PC']]),
  ].join('\n')),

  // Generation pipeline (developer guide)
  '4-pipeline': svg(320, 'Generation pipeline for one post', [
    box(40, 40, 180, 'teal', 'Planned post', 'Lark Base row'),
    box(250, 40, 180, 'purple', 'Copywriter', 'Gemini, JSON + render spec'),
    box(460, 40, 180, 'purple', 'Checks', 'Banned words, brand rules'),
    line(222, 68, 248, 68), line(432, 68, 458, 68), line(550, 98, 550, 168),
    box(460, 170, 180, 'purple', 'Render', 'Image, carousel, video'),
    box(250, 170, 180, 'purple', 'Visual QC', 'AI looks at the images'),
    box(40, 170, 180, 'teal', 'Back to Lark', 'pending_approval + W4 card'),
    line(458, 198, 432, 198), line(248, 198, 222, 198),
    note(340, 262, 'Any failed check is retried with feedback (up to 3 attempts); an AI outage leaves the post untouched.', 'middle'),
    legend(286, [['purple', 'Runner + renderer (server)'], ['teal', 'Lark']]),
  ].join('\n')),
};

const { chromium } = await import(pathToFileURL(path.join(here, '..', '..', 'renderer', 'node_modules', 'playwright', 'index.mjs')).href);
const browser = await chromium.launch();
for (const [name, s] of Object.entries(diagrams)) {
  writeFileSync(path.join(out, `${name}.svg`), s);
  const h = Number(s.match(/height="(\d+)"/)[1]);
  const page = await browser.newPage({ viewport: { width: 680, height: h }, deviceScaleFactor: 2 });
  await page.setContent(`<html><head><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=block" rel="stylesheet"></head><body style="margin:0">${s}</body></html>`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.locator('svg').screenshot({ path: path.join(out, `${name}.png`) });
  await page.close();
  console.log('rendered', name);
}
await browser.close();
