// Trial: can Gemini's FREE text tier run the Copywriter agent (agents/copywriter.md + CLAUDE.md)?
// Writes the draft to content/trials/. Never prints keys.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = {};
for (const line of readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*([^#]*?)\s*(#.*)?$/);
  if (m && m[2]) env[m[1]] = m[2];
}
const model = process.argv[2] || 'gemini-2.5-flash';
const system = `${readFileSync(path.join(root, 'CLAUDE.md'), 'utf8')}\n\n---\n\n${readFileSync(path.join(root, 'agents/copywriter.md'), 'utf8')}`;
const plan = {
  id: 'W50-LI-01', platform: 'linkedin', publish_at: '2026-12-08T08:30:00+08:00', pillar: 'educate', segment: 'B', format: 'text',
  topic: 'Why month-end reporting takes so long, and what to automate first',
  angle: 'Finance and ops managers lose the first days of each month compiling the same reports by hand.',
  cta: 'Book a free consultation',
};
const input = { ...plan, approved_proof: [], reviewer_feedback: '', utm_campaign: '2026-w50' };

const t = Date.now();
const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
  body: JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: `Write this post. Reply with the JSON output only.\n\n${JSON.stringify(input, null, 2)}` }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.7 },
  }),
  signal: AbortSignal.timeout(120000),
});
const body = await res.json();
if (!res.ok) { console.log(`❌ ${model}: HTTP ${res.status} ${body.error?.message?.slice(0, 200)}`); process.exit(1); }
const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
mkdirSync(path.join(root, 'content/trials'), { recursive: true });
const out = path.join(root, 'content/trials', `${plan.id}_${model}.json`);
writeFileSync(out, text);
let parsed;
try { parsed = JSON.parse(text); } catch { console.log('⚠️ not valid JSON'); }
console.log(`✅ ${model} ${((Date.now() - t) / 1000).toFixed(1)}s, tokens in/out ${body.usageMetadata?.promptTokenCount}/${body.usageMetadata?.candidatesTokenCount}, valid JSON: ${!!parsed}`);
if (parsed) console.log(`\nHOOK: ${parsed.hook}\n\n${parsed.caption}\n\nHASHTAGS: ${(parsed.hashtags || []).join(' ')}`);
