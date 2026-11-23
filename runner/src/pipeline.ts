// One post through the generation loop (spec W2 + W3):
//   Copywriter → Brand Checker → Renderer → Visual QC → (retry with feedback, up to max attempts) → write back to Lark Base.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CopywriterOut, BrandCheckOut, VisualQcOut, prompts, promptVersion, type RenderSpec } from './agents.js';
import { generateJson, type AiImage } from './ai.js';
import { env, required, RUNNER_DIR } from './env.js';
import { updateRecord, uploadAttachment, type BaseRecord } from './lark.js';

const RENDERER = (env.RENDERER_URL ?? 'http://localhost:8787').replace(/\/$/, '');
const rHeaders: Record<string, string> = { 'Content-Type': 'application/json', ...(env.RENDERER_API_KEY ? { Authorization: `Bearer ${env.RENDERER_API_KEY}` } : {}) };

export interface RunOptions { dry: boolean; maxAttempts: number; log: (msg: string) => void }
interface RenderedFile { name: string; mime: string; data: Buffer }

const iso = (ms?: number) => (ms ? new Date(ms).toISOString() : undefined);

/**
 * Deterministic guard for CLAUDE.md §6 "words to avoid" and §4 rules. Runs before the AI brand check,
 * because AI checkers occasionally miss these, and they must never reach the approver.
 */
const BANNED: [RegExp, string][] = [
  [/\binstant(ly)?\b/i, 'avoid "instant/instantly" (use "automatically")'],
  [/\bguarantee(d|s)?\b/i, 'no guarantees'],
  [/\bzero[- ]effort\b|\beffortless(ly)?\b/i, 'no "zero effort/effortless"'],
  [/100%\s*error[- ]free/i, 'no "100% error-free"'],
  [/\brevolutionar(y|ise)\b/i, 'no "revolutionary"'],
  [/\bbest in (the )?industry\b/i, 'no "best in the industry"'],
  [/\breplace(s|d)?\s+(your\s+)?(staff|employees|team|people|workers)\b|\bfully replaces\b/i, 'never say AI/automation replaces people'],
  [/\$\s?\d|\bS\$\s?\d|\bSGD\s?\d|\bper month\b/i, 'no prices'],
  [/\b(optimiz|organiz|customiz|analyz|prioritiz|centraliz|utiliz)(e|es|ed|ing|ation)\b|\bcolor\b|\bcenter\b/i, 'use British spelling'],
];
export function bannedPhrases(texts: string[]): string[] {
  const all = texts.join('\n');
  return BANNED.filter(([re]) => re.test(all)).map(([re, why]) => `"${all.match(re)![0]}": ${why}`);
}

function textsOf(copy: { hook: string; caption: string; render: RenderSpec }): string[] {
  const r = copy.render as any;
  const parts = [copy.hook, copy.caption, r.headline, r.sub, r.button];
  for (const s of r.slides ?? []) parts.push(s.heading, s.body, s.button);
  for (const s of r.scenes ?? []) parts.push(s.text, s.vo, s.title, s.button, ...(s.steps ?? []), s.notification?.text);
  return parts.filter(Boolean);
}
const RENDER_TRIES = 3;

/** Add the visual QC's fixes to every AI image brief in the spec (layout-only issues need a rewrite instead). */
function withImageFixes(spec: RenderSpec, fixes: string): RenderSpec {
  const add = (p?: string) => (p ? `${p} Important: ${fixes}`.slice(0, 1800) : p);
  switch (spec.kind) {
    case 'image': case 'story': return { ...spec, image_prompt: add(spec.image_prompt) };
    case 'reel': return { ...spec, scenes: spec.scenes.map((s) => (s.type === 'photo' ? { ...s, image_prompt: add(s.image_prompt)! } : s)) };
    default: return spec;
  }
}

function planFromRecord(f: Record<string, any>) {
  const when = f.scheduled_at ? new Date(f.scheduled_at) : new Date();
  const week = String(f.post_id ?? '').match(/^W(\d{1,2})/)?.[1];
  return {
    id: f.post_id,
    platform: f.platform,
    publish_at: iso(f.scheduled_at),
    pillar: f.pillar,
    segment: f.segment,
    format: f.format,
    topic: f.topic,
    angle: f.hook ? `Planned hook idea: ${f.hook}` : undefined,
    cta: 'Choose the approved CTA from CLAUDE.md §4 that best fits this pillar (Engage posts: engagement prompt plus a soft CTA).',
    utm_campaign: week ? `${when.getFullYear()}-w${week.padStart(2, '0')}` : `${when.getFullYear()}-posts`,
    approved_proof: [] as string[],
  };
}

/** Map the Copywriter's render spec onto the renderer's API. */
function toRenderRequest(postId: string, spec: RenderSpec): { endpoint: string; body: Record<string, unknown> } | null {
  const image = (p?: string) => (p ? { image: { prompt: p } } : {});
  switch (spec.kind) {
    case 'none': return null;
    case 'image': return { endpoint: '/render/image', body: { postId, headline: spec.headline, sub: spec.sub, tag: spec.tag, ...image(spec.image_prompt) } };
    case 'carousel': return { endpoint: '/render/carousel', body: { postId, slides: spec.slides } };
    case 'story': return { endpoint: '/render/story', body: { postId, headline: spec.headline, sub: spec.sub, tag: spec.tag, button: spec.button, ...image(spec.image_prompt) } };
    case 'reel': return {
      endpoint: '/render/reel',
      body: {
        postId, maxSeconds: 40,
        scenes: spec.scenes.map((s) => (s.type === 'photo'
          ? { type: 'photo', text: s.text, vo: s.vo, motion: s.motion ?? 'push-in', image: { prompt: s.image_prompt } }
          : s)),
      },
    };
  }
}

async function render(postId: string, spec: RenderSpec): Promise<RenderedFile[]> {
  const req = toRenderRequest(postId, spec);
  if (!req) return [];
  const res = await fetch(`${RENDERER}${req.endpoint}`, { method: 'POST', headers: rHeaders, body: JSON.stringify(req.body), signal: AbortSignal.timeout(600_000) });
  const json = (await res.json()) as any;
  if (!res.ok) throw new Error(`Renderer ${res.status}: ${json.error}${json.issues ? ' ' + JSON.stringify(json.issues).slice(0, 300) : ''}`);
  const files: RenderedFile[] = [];
  for (const f of json.files) {
    const r = await fetch(`${RENDERER}${f.url}`, { headers: rHeaders });
    files.push({ name: f.name, mime: f.mime, data: Buffer.from(await r.arrayBuffer()) });
  }
  return files;
}

export async function processPost(rec: BaseRecord, opts: RunOptions): Promise<'pending_approval' | 'failed'> {
  const table = required('LARK_TABLE_CONTENT_ID');
  const f = rec.fields;
  const postId = String(f.post_id);
  const outDir = path.join(RUNNER_DIR, 'out', postId);
  mkdirSync(outDir, { recursive: true });
  const plan = planFromRecord(f);
  const version = promptVersion();
  const attemptsBefore = Number(f.attempts ?? 0);
  if (!opts.dry) await updateRecord(table, rec.id, { status: 'generating', error: '' });

  let feedback = '';
  let lastError = '';
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    opts.log(`  attempt ${attempt}/${opts.maxAttempts}: writing…`);
    try {
      // 1. Copywriter
      const copy = await generateJson({
        label: `copywriter ${postId}`, system: prompts.copywriter(), schema: CopywriterOut, temperature: 0.7,
        user: `Write this post. Include the "render" spec for its format.\n\n${JSON.stringify({ ...plan, reviewer_feedback: feedback }, null, 2)}`,
      });

      writeFileSync(path.join(outDir, `a${attempt}_copy.json`), JSON.stringify(copy.data, null, 2));

      // 2a. Fixed banned-phrase check (cheap, never misses)
      const banned = bannedPhrases(textsOf(copy.data));
      if (banned.length) {
        feedback = `Banned wording found, rewrite without it: ${banned.join('; ')}`;
        lastError = feedback;
        opts.log(`  ✗ ${feedback.slice(0, 220)}`);
        continue;
      }

      // 2b. Brand Checker (text)
      opts.log(`  attempt ${attempt}: brand check…`);
      const check = await generateJson({
        label: `brand-check ${postId}`, system: prompts.brandChecker(), schema: BrandCheckOut, temperature: 0,
        user: `Check this draft (approved_proof is empty).\n\n${JSON.stringify({ id: postId, platform: plan.platform, format: plan.format, pillar: plan.pillar, ...copy.data }, null, 2)}`,
      });
      const fails = check.data.checks.filter((c) => c.status === 'fail');
      if (check.data.result === 'fail' || fails.length) {
        feedback = `Brand check failed: ${fails.map((c) => `#${c.n} "${c.evidence ?? ''}" → ${c.fix ?? ''}`).join('; ') || check.data.summary}`;
        lastError = feedback;
        opts.log(`  ✗ ${feedback.slice(0, 220)}`);
        continue;
      }

      // 3–4. Render + Visual QC. AI images are random, so an image-only failure is retried by
      // re-rendering (with the QC fixes added to the image brief) before rewriting the whole post.
      let spec = copy.data.render;
      let files: RenderedFile[] = [];
      let qcSummary = 'no media';
      let qcPassed = false;
      for (let r = 1; r <= RENDER_TRIES; r++) {
        opts.log(`  attempt ${attempt}.${r}: rendering ${spec.kind}…`);
        files = await render(postId, spec);
        for (const file of files) writeFileSync(path.join(outDir, `a${attempt}.${r}_${file.name}`), file.data);
        const images: AiImage[] = files.filter((x) => x.mime.startsWith('image/')).slice(0, 8).map((x) => ({ data: x.data, mime: x.mime }));
        if (!images.length) { qcPassed = true; break; }
        opts.log(`  attempt ${attempt}.${r}: visual QC on ${images.length} image(s)…`);
        const qc = await generateJson({
          label: `visual-qc ${postId}`, system: prompts.visualQc(), schema: VisualQcOut, images, temperature: 0,
          user: `Images 1–${images.length} are the ${spec.kind === 'reel' ? 'review frames of a Reel' : 'post media'} for this post.\nHeadline/caption context: ${copy.data.hook}\n\nReturn your JSON verdict.`,
        });
        qcSummary = qc.data.summary;
        if (qc.data.result === 'pass') { qcPassed = true; break; }
        const fixes = qc.data.issues.map((i) => i.fix || i.problem).join(' ');
        feedback = `Visual QC failed: ${qc.data.issues.map((i) => `${i.problem} → ${i.fix ?? ''}`).join('; ')}. Adjust the image_prompt(s) or layout text accordingly.`;
        lastError = feedback;
        opts.log(`  ✗ ${feedback.slice(0, 220)}`);
        spec = withImageFixes(spec, fixes);
      }
      if (!qcPassed) continue; // rewrite the post with the QC feedback

      // 5. Passed: save locally and write back for approval
      const result = { copy: copy.data, brandCheck: check.data, visualQc: qcSummary, models: { copy: copy.model, check: check.model }, promptVersion: version };
      writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(result, null, 2));
      const warns = check.data.checks.filter((c) => c.status === 'warn').map((c) => `#${c.n} ${c.evidence ?? ''}`);
      const caption = copy.data.poll
        ? `${copy.data.caption}\n\n[POLL] ${copy.data.poll.question}\n${copy.data.poll.options.map((o) => `• ${o}`).join('\n')}`
        : copy.data.caption;
      const qcNotes = [
        `Brand check: PASS. ${check.data.summary}`,
        warns.length ? `Warnings: ${warns.join('; ')}` : '',
        `Visual QC: ${qcSummary}`,
        copy.data.needs_human || check.data.needs_human ? `⚠ Needs human: ${copy.data.needs_human_reason ?? check.data.needs_human_reason ?? ''}` : '',
        `Attempt ${attempt} · models: ${copy.model} / ${check.model} · ${version}`,
      ].filter(Boolean).join('\n');

      if (!opts.dry) {
        // Preview: images first (slides, post, frames), plus the video itself for Reels. Max 10 files.
        const preview: { file_token: string }[] = [];
        for (const file of [...files.filter((x) => x.mime === 'video/mp4'), ...files.filter((x) => x.mime.startsWith('image/'))].slice(0, 10)) {
          preview.push({ file_token: await uploadAttachment(`${postId}_${file.name}`, file.data, file.mime) });
        }
        await updateRecord(table, rec.id, {
          hook: copy.data.hook,
          caption,
          hashtags: copy.data.hashtags.join(' '),
          cta_link: copy.data.cta_link,
          slides_json: JSON.stringify(spec, null, 2),
          visual_brief: JSON.stringify(copy.data.visual_brief ?? {}, null, 2),
          alt_text: copy.data.alt_text,
          ai_generated: copy.data.ai_generated && spec.kind !== 'none',
          ...(preview.length ? { preview } : {}),
          qc_notes: qcNotes,
          prompt_version: version,
          attempts: attemptsBefore + attempt,
          status: 'pending_approval',
          error: '',
        });
      }
      opts.log(`  ✓ ready for approval (attempt ${attempt})`);
      return 'pending_approval';
    } catch (e) {
      lastError = (e as Error).message;
      opts.log(`  ✗ error: ${lastError.slice(0, 300)}`);
    }
  }

  if (!opts.dry) {
    await updateRecord(table, rec.id, { status: 'failed', attempts: attemptsBefore + opts.maxAttempts, error: lastError.slice(0, 2000) });
  }
  return 'failed';
}
