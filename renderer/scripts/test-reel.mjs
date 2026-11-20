// Test render of a 15–20 s Reel (W49-IG-02, "no-shows" → WhatsApp reminder example workflow).
// Pipeline: script → AI images (Cloudflare Workers AI) → per-scene voiceover (Edge TTS, en-GB)
//           → HyperFrames composition timed to the voice → MP4 → FFmpeg adds the voice track.
// Output: renderer/out/W49-IG-02_reel.mp4 (+ review frames). Never prints keys.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const renderer = path.resolve(here, '..');
const repo = path.resolve(renderer, '..');
const out = path.join(renderer, 'out');
const proj = path.join(renderer, 'sandbox', 'reel');
const assets = path.join(proj, 'assets');
mkdirSync(assets, { recursive: true });

const env = {};
for (const line of readFileSync(path.join(repo, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*([^#]*?)\s*(#.*)?$/);
  if (m && m[2]) env[m[1]] = m[2];
}

// FFmpeg from winget (works even if this shell's PATH predates the install).
const wg = path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages');
const ffDir = readdirSync(wg).filter((d) => d.startsWith('Gyan.FFmpeg')).map((d) => path.join(wg, d))
  .flatMap((d) => readdirSync(d).map((s) => path.join(d, s, 'bin'))).find((p) => existsSync(p));
const ffmpeg = path.join(ffDir, 'ffmpeg.exe');
const ffprobe = path.join(ffDir, 'ffprobe.exe');
const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (r.status !== 0) throw new Error(`${path.basename(cmd)} failed: ${(r.stderr || r.stdout).slice(-400)}`);
  return r.stdout;
};

// ── The Reel "prompt": script, voice and visual brief (follows agents/copywriter.md) ──
const VOICE = 'en-GB-SoniaNeural';
const IMG_RULES = 'No readable text, no logos or brand marks (unbranded phones and laptops), no watermarks. No robots, no sci-fi. Vertical framing, subject centred.';
const scenes = [
  { id: 'hook', vo: 'You blocked out the hour.', img: 'empty',
    text: 'You blocked out<br>the hour.' },
  { id: 'turn', vo: "They didn't show up.", img: 'empty',
    text: "They didn't<br>show up." },
  { id: 'why', vo: 'Often, they just forgot.', img: 'phone',
    text: 'Often, they<br>just forgot.' },
  { id: 'flow', vo: 'Example workflow: booking in, WhatsApp reminder the day before, one tap to confirm, calendar updated.', img: null,
    text: null },
  { id: 'cta', vo: 'Fewer missed appointments. Less chasing. Link in bio.', img: null,
    text: 'Fewer missed appointments.<br>Less chasing.' },
];
const images = {
  empty: 'Photorealistic photo of an empty modern consultation room in Singapore: a neat desk with an untouched glass of water and a notepad, an empty client chair across it, soft late-morning daylight, calm muted colours with subtle navy and blue accents, shallow depth of field, feeling of waiting. ' + IMG_RULES,
  phone: 'Photorealistic close-up of a smartphone lying face up on a wooden desk next to a coffee cup, screen softly glowing but completely blank, a person\'s hand reaching towards it, warm natural light, navy and blue accents, shallow depth of field. ' + IMG_RULES,
};

// 1. AI images (Cloudflare Workers AI, free tier)
for (const [key, prompt] of Object.entries(images)) {
  const file = path.join(assets, `${key}.jpg`);
  if (existsSync(file)) continue;
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
    body: JSON.stringify({ prompt, steps: 8 }), signal: AbortSignal.timeout(120000),
  });
  const body = await res.json();
  if (!body.result?.image) throw new Error(`Cloudflare image failed (${res.status})`);
  writeFileSync(file, Buffer.from(body.result.image, 'base64'));
  console.log(`image ${key} ✓`);
}

// 2. Voiceover per scene; scene length = voice length + breathing room
let t = 0;
for (const [i, s] of scenes.entries()) {
  const mp3 = path.join(assets, `vo_${i}.mp3`);
  run('py', ['-m', 'edge_tts', '--voice', VOICE, '--rate=+10%', '--text', s.vo, '--write-media', mp3]);
  const dur = parseFloat(run(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3]));
  s.start = +t.toFixed(2);
  s.voDur = dur;
  // The CTA scene holds long enough for the button and logo to land (≥ 3.6 s).
  s.dur = +(i === scenes.length - 1 ? Math.max(dur + 1.0, 3.6) : dur + 0.3).toFixed(2);
  t += s.dur;
}
const total = +t.toFixed(2);
console.log(`voice ✓  total ${total}s  (${scenes.map((s) => `${s.id} ${s.dur}s`).join(', ')})`);

// 3. HyperFrames composition
const logo = 'assets/logo.png';
copyFileSync(path.join(repo, 'brand/01_Logos/PNG/Linkbot_Logo_White_on_Transparent.png'), path.join(proj, logo));
const S = Object.fromEntries(scenes.map((s) => [s.id, s]));
const clip = (s, inner, cls = '') =>
  `<div class="scene clip ${cls}" id="${s.id}" data-start="${s.start}" data-duration="${s.dur}" data-track-index="0">${inner}</div>`;
const photo = (s) => clip(s, `<img class="bg" src="assets/${s.img}.jpg"><div class="shade"></div>
  <h1 class="big">${s.text}</h1>`);
const f = S.flow;
const steps = ['📅 Booking comes in', '💬 WhatsApp reminder, day before', '✅ Customer taps “Confirm”', '🗓️ Calendar updates itself'];
const flowHtml = clip(f, `<div class="label solid">Example workflow</div>
  <h2>How it works</h2>
  <div class="steps">${steps.map((x, i) => `<div class="step" id="st${i}">${x}</div>${i < 3 ? `<div class="arrow" id="ar${i}">↓</div>` : ''}`).join('')}</div>
  <div class="phone" id="notif"><b>Your business</b><br>Reminder: your appointment is tomorrow at 3pm. Reply 1 to confirm ✅</div>`, 'navy');
const c = S.cta;
const ctaHtml = clip(c, `<h1 class="big center" id="ctaT">${c.text}</h1>
  <div class="cta" id="ctaB">Discover how automation can improve your business</div>
  <div class="bio" id="ctaL">Link in bio · linkbot.sg</div>
  <img class="endlogo" id="endlogo" src="${logo}">`, 'navy');

const stepAt = (i) => (f.start + 1.2 + i * ((f.voDur - 1.4) / 4)).toFixed(2);
const html = `<!doctype html>
<html lang="en" data-resolution="portrait"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=1080, height=1920" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700;800&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
<style>
 *{margin:0;padding:0;box-sizing:border-box}
 html,body{width:1080px;height:1920px;overflow:hidden;background:#172B4D;font-family:Inter,Arial,sans-serif}
 #root{position:relative;width:100%;height:100%}
 .scene{position:absolute;inset:0;overflow:hidden}
 .navy{background:#172B4D}
 .bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform-origin:50% 45%}
 .shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(23,43,77,.15) 30%,rgba(23,43,77,.92) 72%,#172B4D 100%)}
 .label{position:absolute;top:120px;left:80px;font-size:30px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#fff;
        background:rgba(18,72,139,.85);padding:12px 22px;border-radius:12px}
 .label.solid{background:#12488B}
 .big{position:absolute;left:80px;right:80px;bottom:330px;color:#fff;font-size:104px;line-height:1.04;font-weight:800;letter-spacing:-.02em}
 .big.center{top:470px;bottom:auto;text-align:center}
 h2{position:absolute;top:240px;left:80px;color:#fff;font-size:84px;font-weight:800}
 .steps{position:absolute;top:400px;left:80px;right:80px;display:flex;flex-direction:column;align-items:stretch;gap:18px}
 .step{background:#fff;color:#172B4D;font-size:44px;font-weight:700;padding:34px 36px;border-radius:24px;opacity:0}
 .arrow{color:#9DB8E0;font-size:44px;text-align:center;opacity:0}
 .phone{position:absolute;left:110px;right:110px;bottom:200px;background:#EAF0F8;color:#172B4D;font-size:34px;line-height:1.35;
        font-weight:500;padding:30px 34px;border-radius:28px;border-left:14px solid #12488B;opacity:0}
 .cta{position:absolute;top:1010px;left:110px;right:110px;text-align:center;background:#12488B;color:#fff;font-size:46px;font-weight:700;
      padding:38px 30px;border-radius:999px}
 .bio{position:absolute;top:1230px;left:0;right:0;text-align:center;color:#C9D6EA;font-size:40px;font-weight:600}
 .endlogo{position:absolute;bottom:150px;left:50%;height:150px;transform:translateX(-50%)}
 .cornerlogo{position:absolute;right:60px;bottom:70px;height:80px}
</style></head>
<body><div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-width="1080" data-height="1920">
 ${photo(S.hook)}
 ${photo(S.turn)}
 ${photo(S.why)}
 ${flowHtml}
 ${ctaHtml}
 <img class="cornerlogo clip" id="corner" src="${logo}" data-start="0" data-duration="${c.start}" data-track-index="1">
</div>
<script>
 const tl = gsap.timeline({ paused: true });
 // Hook: punch-in zoom + text slam
 tl.fromTo("#hook .bg", { scale: 1.25 }, { scale: 1.05, duration: ${S.hook.dur}, ease: "power2.out" }, ${S.hook.start});
 tl.fromTo("#hook .big", { y: 80, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: "power4.out" }, ${S.hook.start + 0.1});
 // Turn: same room, slow push, hard text cut
 tl.fromTo("#turn .bg", { scale: 1.05 }, { scale: 1.18, duration: ${S.turn.dur}, ease: "none" }, ${S.turn.start});
 tl.fromTo("#turn .big", { scale: 1.3, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.25, ease: "back.out(2)" }, ${S.turn.start + 0.05});
 // Why: phone close-up drift
 tl.fromTo("#why .bg", { scale: 1.15, x: 40 }, { scale: 1.05, x: 0, duration: ${S.why.dur}, ease: "sine.out" }, ${S.why.start});
 tl.fromTo("#why .big", { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: "power3.out" }, ${S.why.start + 0.1});
 // Flow: title, then each step lands with the voice, then the WhatsApp reminder pops up
 tl.fromTo("#flow h2", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3 }, ${f.start + 0.1});
 ${steps.map((_, i) => `tl.fromTo("#st${i}", { x: -120, opacity: 0 }, { x: 0, opacity: 1, duration: 0.35, ease: "power3.out" }, ${stepAt(i)});` +
   (i < 3 ? ` tl.to("#ar${i}", { opacity: 1, duration: 0.2 }, ${(+stepAt(i) + 0.3).toFixed(2)});` : '')).join('\n ')}
 tl.fromTo("#notif", { y: 120, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "back.out(1.6)" }, ${stepAt(1)});
 // CTA
 tl.fromTo("#ctaT", { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35 }, ${c.start + 0.05});
 tl.fromTo("#ctaB", { scale: 0.85, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: "back.out(1.8)" }, ${c.start + 0.9});
 tl.fromTo("#ctaL", { opacity: 0 }, { opacity: 1, duration: 0.3 }, ${c.start + 1.5});
 tl.fromTo("#endlogo", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.4 }, ${c.start + 1.7});
 window.__timelines["main"] = tl;
 tl.seek(0);
</script></body></html>`;

if (!existsSync(path.join(proj, 'hyperframes.json'))) {
  for (const fname of ['hyperframes.json', 'meta.json', 'package.json']) {
    copyFileSync(path.join(renderer, 'sandbox', 'smoke', fname), path.join(proj, fname));
  }
}
writeFileSync(path.join(proj, 'index.html'), html);

// 4. Render silent video, then 5. lay the voice clips at their scene starts and mux
const env2 = { ...process.env, PATH: `${ffDir};${process.env.PATH}` };
const silent = path.join(out, 'W49-IG-02_silent.mp4');
// Relative paths: the repo folder contains a space, which breaks argument passing through the Windows shell.
run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['hyperframes', 'render', 'sandbox/reel', '-q', 'looks', '-o', 'out/W49-IG-02_silent.mp4'],
  { cwd: renderer, env: env2, shell: process.platform === 'win32' });
const inputs = scenes.flatMap((_, i) => ['-i', path.join(assets, `vo_${i}.mp3`)]);
const delays = scenes.map((s, i) => `[${i + 1}:a]adelay=${Math.round((s.start + 0.15) * 1000)}|${Math.round((s.start + 0.15) * 1000)}[a${i}]`).join(';');
const mix = `${delays};${scenes.map((_, i) => `[a${i}]`).join('')}amix=inputs=${scenes.length}:normalize=0[vo]`;
const final = path.join(out, 'W49-IG-02_reel.mp4');
run(ffmpeg, ['-v', 'error', '-y', '-i', silent, ...inputs, '-filter_complex', mix, '-map', '0:v', '-map', '[vo]',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-t', String(total), final]);
// 6. Review frames: one per scene
for (const s of scenes) {
  run(ffmpeg, ['-v', 'error', '-y', '-ss', String(s.start + s.dur * 0.75), '-i', final, '-frames:v', '1', '-vf', 'scale=540:-1',
    path.join(out, `W49-IG-02_frame_${s.id}.png`)]);
}
console.log(`✅ Reel rendered: renderer/out/W49-IG-02_reel.mp4 (${total}s)`);
