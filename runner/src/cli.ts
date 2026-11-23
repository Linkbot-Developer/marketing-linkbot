// npm run run -- [--post W49-IG-03 ...] [--limit 3] [--dry]
// Picks `planned` posts from Lark Base and runs each through the generation loop.
import { processPost } from './pipeline.js';
import { readSettings, searchRecords } from './lark.js';
import { env, required } from './env.js';

const args = process.argv.slice(2);
const posts = args.flatMap((a, i) => (a === '--post' ? [args[i + 1]] : []));
const limit = Number(args[args.indexOf('--limit') + 1]) || (posts.length || 1);
const dry = args.includes('--dry');
const log = (m: string) => console.log(m);

const renderer = (env.RENDERER_URL ?? 'http://localhost:8787').replace(/\/$/, '');
const health = await fetch(`${renderer}/health`).then((r) => r.json()).catch(() => null);
if (!health?.ok) {
  console.error(`Renderer not reachable at ${renderer}. Start it first: cd renderer && npm start`);
  process.exit(1);
}

const settings = await readSettings();
if (settings.agent_switches?.generator === false) {
  console.log('Generator is switched off in Lark Base Settings (agent_switches.generator). Nothing to do.');
  process.exit(0);
}
const maxAttempts = Number(settings.max_generation_attempts ?? 3);

// Normally only `planned` posts; when posts are named explicitly, `failed` ones can be retried too.
let records = await searchRecords(required('LARK_TABLE_CONTENT_ID'));
records = records.filter((r) => r.fields.status === 'planned' || (posts.length && r.fields.status === 'failed'));
if (posts.length) records = records.filter((r) => posts.includes(String(r.fields.post_id)));
records.sort((a, b) => Number(a.fields.scheduled_at ?? 0) - Number(b.fields.scheduled_at ?? 0));
records = records.slice(0, limit);

if (!records.length) {
  console.log(posts.length ? `No planned posts match ${posts.join(', ')}.` : 'No planned posts.');
  process.exit(0);
}

console.log(`${dry ? '[DRY RUN, no Base writes] ' : ''}Generating ${records.length} post(s) · max ${maxAttempts} attempts · AI: ${env.AI_TEXT_PROVIDER ?? 'gemini'}`);
const summary: string[] = [];
for (const rec of records) {
  const id = String(rec.fields.post_id);
  log(`\n▶ ${id} (${rec.fields.platform} · ${rec.fields.format} · ${rec.fields.pillar})`);
  const t = Date.now();
  const status = await processPost(rec, { dry, maxAttempts, log });
  summary.push(`${status === 'pending_approval' ? '✅' : '❌'} ${id}: ${status} (${((Date.now() - t) / 1000).toFixed(0)}s)`);
}
console.log(`\n${summary.join('\n')}`);
