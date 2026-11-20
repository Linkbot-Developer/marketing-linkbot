// Reel / TikTok (1080×1920 MP4): scenes timed to an Edge TTS voiceover, animated with HyperFrames (GSAP), muxed with FFmpeg.
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { bin, config, logos } from '../config.js';
import { newJob } from '../lib/files.js';
import { escapeHtml, fill, loadTemplate, textToHtml, themeCss } from '../lib/html.js';
import { extractFrame, muxVoice, run, speak } from '../lib/media.js';
import type { ReelRequest, ReelScene } from '../schemas.js';
import { resolveImage } from './common.js';

interface Timed { scene: ReelScene; start: number; dur: number; voDur: number; voFile: string; img?: string }

const PAD = 0.3;        // breathing room after each line
const CTA_MIN = 3.6;    // the end card holds long enough for button + logo to land
const VO_DELAY = 0.15;  // voice starts just after the cut

export async function renderReel(req: ReelRequest) {
  const job = newJob(req.postId);
  const comp = path.join(job.dir, 'composition');
  mkdirSync(path.join(comp, 'assets'), { recursive: true });
  copyFileSync(logos.white, path.join(comp, 'assets', 'logo.png'));
  writeFileSync(path.join(comp, 'hyperframes.json'), JSON.stringify({ paths: { assets: 'assets' }, media: { autoProxy: true } }, null, 2));
  writeFileSync(path.join(comp, 'meta.json'), JSON.stringify({ id: job.id, name: req.postId, createdAt: new Date().toISOString() }));

  // 1. Voice + images per scene (sequential to stay within free-tier rate limits)
  const timed: Timed[] = [];
  let t = 0;
  for (const [i, scene] of req.scenes.entries()) {
    const voFile = job.file(`vo_${i}.mp3`);
    const voDur = await speak(scene.vo, voFile, req.voice ?? config.tts.voice, req.rate ?? config.tts.rate);
    let img: string | undefined;
    if (scene.type === 'photo') {
      const r = await resolveImage(scene.image, '9:16', job, `scene_${i}`);
      img = `assets/scene_${i}${path.extname(r.file)}`;
      copyFileSync(r.file, path.join(comp, img));
    }
    const last = i === req.scenes.length - 1;
    const dur = +(last && scene.type === 'cta' ? Math.max(voDur + 1.0, CTA_MIN) : voDur + PAD).toFixed(2);
    timed.push({ scene, start: +t.toFixed(2), dur, voDur, voFile, img });
    t += dur;
  }
  const total = +t.toFixed(2);
  if (total > req.maxSeconds) throw new Error(`Reel would be ${total}s, over maxSeconds ${req.maxSeconds}. Shorten the voiceover.`);

  // 2. Composition
  const scenes = timed.map((x, i) => sceneHtml(x, i)).join('\n');
  const html = fill(loadTemplate('video/reel.html'), {
    theme: themeCss(),
    total,
    scenes,
    timeline: timed.map((x, i) => sceneTimeline(x, i)).join('\n'),
  });
  writeFileSync(path.join(comp, 'index.html'), html);

  // 3. Render silent video (relative paths: the repo path may contain spaces), then add the voice
  const ffDir = path.dirname(bin.ffmpeg);
  const env = { ...process.env, PATH: `${ffDir}${path.delimiter}${process.env.PATH}` };
  await run(process.execPath, [bin.hyperframes, 'render', '.', '-q', 'looks', '-o', '../silent.mp4'], { cwd: comp, env });
  await muxVoice(job.file('silent.mp4'), timed.map((x) => ({ file: x.voFile, start: x.start + VO_DELAY })), total, job.file('reel.mp4'));

  // 4. One review frame per scene (used by the visual QC step and the approval card)
  const frames = [];
  for (const [i, x] of timed.entries()) {
    const name = `frame-${String(i + 1).padStart(2, '0')}.png`;
    await extractFrame(job.file('reel.mp4'), x.start + x.dur * 0.75, job.file(name));
    frames.push(job.describe(name, { width: 1080, height: 1920 }));
  }

  return {
    jobId: job.id,
    files: [job.describe('reel.mp4', { width: 1080, height: 1920, durationSec: total }), ...frames],
    meta: { durationSec: total, scenes: timed.map((x) => ({ type: x.scene.type, start: x.start, dur: x.dur })) },
  };
}

const CORNER = '<img class="cornerlogo" src="assets/logo.png" alt="">';

function clip(id: string, x: Timed, inner: string, cls = '') {
  return `<div class="scene clip ${cls}" id="${id}" data-start="${x.start}" data-duration="${x.dur}" data-track-index="0">${inner}</div>`;
}

function sceneHtml(x: Timed, i: number): string {
  const id = `s${i}`;
  const s = x.scene;
  switch (s.type) {
    // The small corner logo appears on photo/statement scenes only; the steps scene is busy
    // (and carries the tag), and the CTA scene has the large end-card logo.
    case 'photo':
      return clip(id, x, `<img class="bg" src="${x.img}" alt=""><div class="shade"></div><h1 class="big">${textToHtml(s.text)}</h1>${CORNER}`);
    case 'statement':
      return clip(id, x, `<h1 class="big">${textToHtml(s.text)}</h1>${CORNER}`, 'statement');
    case 'steps':
      return clip(id, x, `${s.label ? `<div class="label"><span class="tag">${escapeHtml(s.label)}</span></div>` : ''}
        <div class="steps-title">${escapeHtml(s.title)}</div>
        <div class="steps">${s.steps.map((st, k) => `<div class="step" id="${id}st${k}">${escapeHtml(st)}</div>${k < s.steps.length - 1 ? `<div class="arrow" id="${id}ar${k}">↓</div>` : ''}`).join('')}</div>
        ${s.notification ? `<div class="notif" id="${id}n"><b>${escapeHtml(s.notification.from)}</b><br>${escapeHtml(s.notification.text)}</div>` : ''}`);
    case 'cta':
      return clip(id, x, `<h1 class="cta-text" id="${id}t">${textToHtml(s.text)}</h1>
        <div class="cta-btn" id="${id}b">${escapeHtml(s.button)}</div>
        ${s.footer ? `<div class="cta-foot" id="${id}f">${escapeHtml(s.footer)}</div>` : ''}
        <img class="endlogo" id="${id}l" src="assets/logo.png" alt="">`);
  }
}

function sceneTimeline(x: Timed, i: number): string {
  const id = `#s${i}`;
  const s = x.scene;
  const at = (offset: number) => (x.start + offset).toFixed(2);
  switch (s.type) {
    case 'photo': {
      const from = s.motion === 'pull-out' ? '{ scale: 1.05 }' : s.motion === 'drift' ? '{ scale: 1.15, x: 40 }' : '{ scale: 1.25 }';
      const to = s.motion === 'pull-out' ? '{ scale: 1.2' : s.motion === 'drift' ? '{ scale: 1.05, x: 0' : '{ scale: 1.05';
      return ` tl.fromTo("${id} .bg", ${from}, ${to}, duration: ${x.dur}, ease: "power2.out" }, ${at(0)});
 tl.fromTo("${id} .big", { y: 80, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: "power4.out" }, ${at(0.08)});`;
    }
    case 'statement':
      return ` tl.fromTo("${id} .big", { scale: 1.25, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(2)" }, ${at(0.05)});`;
    case 'steps': {
      const n = s.steps.length;
      const gap = Math.max(0.35, (x.voDur - 1.2) / n);
      const lines = [` tl.fromTo("${id} .steps-title", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3 }, ${at(0.1)});`];
      s.steps.forEach((_, k) => {
        lines.push(` tl.fromTo("${id}st${k}", { x: -120, opacity: 0 }, { x: 0, opacity: 1, duration: 0.35, ease: "power3.out" }, ${at(0.9 + k * gap)});`);
        if (k < n - 1) lines.push(` tl.to("${id}ar${k}", { opacity: 1, duration: 0.2 }, ${at(1.2 + k * gap)});`);
      });
      if (s.notification) lines.push(` tl.fromTo("${id}n", { y: 120, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "back.out(1.6)" }, ${at(0.9 + gap)});`);
      return lines.join('\n');
    }
    case 'cta':
      return ` tl.fromTo("${id}t", { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35 }, ${at(0.05)});
 tl.fromTo("${id}b", { scale: 0.85, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: "back.out(1.8)" }, ${at(0.9)});
 ${s.footer ? `tl.fromTo("${id}f", { opacity: 0 }, { opacity: 1, duration: 0.3 }, ${at(1.5)});` : ''}
 tl.fromTo("${id}l", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.4 }, ${at(1.7)});`;
  }
}
