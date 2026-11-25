// Re-render a post from its saved, already-approved-by-checks copy (no AI calls) and refresh its Lark preview.
// Use after a renderer/template fix:  npx tsx src/rerender.ts W49-IG-01
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { RUNNER_DIR, env, required } from './env.js';
import { searchRecords, updateRecord, uploadAttachment } from './lark.js';
import { normaliseSlides } from './pipeline.js';

const postId = process.argv[2];
if (!postId) throw new Error('Usage: tsx src/rerender.ts <post_id>');
const dir = path.join(RUNNER_DIR, 'out', postId);
const result = JSON.parse(readFileSync(path.join(dir, 'result.json'), 'utf8'));
const spec = result.copy.render;
if (spec.kind !== 'carousel') throw new Error(`rerender currently supports carousels (got ${spec.kind})`);

const base = (env.RENDERER_URL ?? 'http://localhost:8787').replace(/\/$/, '');
const auth: Record<string, string> = env.RENDERER_API_KEY ? { Authorization: `Bearer ${env.RENDERER_API_KEY}` } : {};
const res = await fetch(`${base}/render/carousel`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...auth },
  body: JSON.stringify({ postId, slides: normaliseSlides(spec.slides) }),
});
const json = (await res.json()) as any;
if (!res.ok) throw new Error(json.error);

const table = required('LARK_TABLE_CONTENT_ID');
const rec = (await searchRecords(table)).find((r) => r.fields.post_id === postId);
if (!rec) throw new Error(`${postId} not found in Base`);
const preview = [];
for (const f of json.files) {
  const data = Buffer.from(await (await fetch(`${base}${f.url}`, { headers: auth })).arrayBuffer());
  writeFileSync(path.join(dir, `fix_${f.name}`), data);
  preview.push({ file_token: await uploadAttachment(`${postId}_${f.name}`, data, f.mime) });
}
await updateRecord(table, rec.id, {
  preview,
  slides_json: JSON.stringify({ ...spec, slides: normaliseSlides(spec.slides) }, null, 2),
  qc_notes: `${rec.fields.qc_notes ?? ''}\nRe-rendered after a numbering fix (no copy changes).`,
});
console.log(`✅ ${postId}: ${json.files.length} slides re-rendered and preview updated in Lark`);
