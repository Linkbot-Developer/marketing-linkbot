// npm run run -- [--post W49-IG-03 ...] [--limit 3] [--dry]
// npm run daily            → generate as many planned posts as today's free AI quota allows (earliest first)
// Picks `planned` posts from Lark Base and runs each through the generation loop.
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { processPost } from './pipeline.js';
import { callStats, quota, QuotaExhaustedError, remainingCallsToday, usageToday } from './ai.js';
import { readSettings, searchRecords } from './lark.js';
import { REPO_DIR, env, required } from './env.js';

const args = process.argv.slice(2);
const posts = args.flatMap((a, i) => (a === '--post' ? [args[i + 1]] : []));
const daily = args.includes('--daily');
const dry = args.includes('--dry');
const askedLimit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : undefined;
const log = (m: string) => console.log(m);
const DAY = 86_400_000;

// --- Settings (dashboard in Lark Base) -------------------------------------
const settings = await readSettings();
if (settings.agent_switches?.generator === false) {
  console.log('Generator is switched off in Lark Base Settings (agent_switches.generator). Nothing to do.');
  process.exit(0);
}
const maxAttempts = Number(settings.max_generation_attempts ?? 3);
const q = settings.ai_quota ?? {};
quota.perModelPerDay = Number(q.requests_per_model_per_day ?? 20);
const perPost = Number(q.calls_per_post_estimate ?? 5);
const reserve = Number(q.reserve_calls ?? 4);
const daysAhead = Number(q.generate_days_ahead ?? 14);
const planDaysAhead = Number(settings.plan_days_ahead ?? 7);

// --- Which posts? -----------------------------------------------------------
// `planned` posts, plus `rejected` ones (rewritten with the approver's feedback) while attempts remain.
// When posts are named explicitly, `failed` ones can be retried too.
let records = await searchRecords(required('LARK_TABLE_CONTENT_ID'));
records = records.filter((r) => r.fields.status === 'planned'
  || (r.fields.status === 'rejected' && Number(r.fields.attempts ?? 0) < maxAttempts * 2)
  || (posts.length && r.fields.status === 'failed'));
if (posts.length) records = records.filter((r) => posts.includes(String(r.fields.post_id)));
if (daily) records = records.filter((r) => !r.fields.scheduled_at || Number(r.fields.scheduled_at) <= Date.now() + daysAhead * DAY);
records.sort((a, b) => Number(a.fields.scheduled_at ?? 0) - Number(b.fields.scheduled_at ?? 0));

// --- Fit the batch to today's AI quota --------------------------------------
const remaining = remainingCallsToday();
const affordable = Number.isFinite(remaining) ? Math.max(0, Math.floor((remaining - reserve) / perPost)) : Infinity;
const wanted = askedLimit ?? (daily ? records.length : posts.length || 1);
const limit = Math.min(wanted, affordable);
const backlog = records.length;
records = records.slice(0, limit);

if (Number.isFinite(remaining)) {
  const u = usageToday();
  console.log(`AI quota today (${u.day}, US Pacific): ${u.capacity - remaining}/${u.capacity} requests used · room for about ${affordable} post(s) at ~${perPost} each`);
  // Does the weekly plan fit the free tier?
  const weekly = Object.values(settings.posts_per_week ?? {}).reduce((s: number, n) => s + Number(n), 0) as number;
  const weeklyNeed = weekly * perPost;
  const weeklyCap = 7 * (u.capacity - reserve);
  console.log(`Weekly plan: ${weekly} posts ≈ ${weeklyNeed} requests vs ${weeklyCap} free a week → ${weeklyNeed <= weeklyCap ? 'fits' : 'does NOT fit, lower posts_per_week or enable billing'}`);
}
if (wanted > affordable) console.log(`Capped at ${affordable} post(s) by today's quota; ${backlog - limit} will wait for the next run.`);

// Warn about posts that should already be waiting for approval (proposed ≥ plan_days_ahead before posting).
const late = records.concat().filter((r) => r.fields.scheduled_at && Number(r.fields.scheduled_at) - Date.now() < planDaysAhead * DAY);
if (late.length) console.log(`⚠ Behind the ${planDaysAhead}-day approval window: ${late.map((r) => r.fields.post_id).join(', ')}`);

if (!records.length) {
  console.log(posts.length ? `No planned posts match ${posts.join(', ')} (or no quota left).` : backlog ? 'No AI quota left today; run again after the reset.' : 'No planned posts due.');
  process.exit(0);
}

// --- Renderer (start it for this run if it isn't up) ------------------------
const renderer = (env.RENDERER_URL ?? 'http://localhost:8787').replace(/\/$/, '');
const healthy = () => fetch(`${renderer}/health`).then((r) => r.json()).then((j: any) => !!j?.ok).catch(() => false);
let started: ChildProcess | null = null;
if (!(await healthy())) {
  if (!daily) {
    console.error(`Renderer not reachable at ${renderer}. Start it first: cd renderer && npm start (or use --daily, which starts it).`);
    process.exit(1);
  }
  console.log('Starting the renderer for this run…');
  started = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], { cwd: path.join(REPO_DIR, 'renderer'), stdio: 'ignore' });
  for (let i = 0; i < 60 && !(await healthy()); i++) await new Promise((r) => setTimeout(r, 1000));
  if (!(await healthy())) { started.kill(); console.error('Renderer did not start.'); process.exit(1); }
}

// --- Run --------------------------------------------------------------------
console.log(`${dry ? '[DRY RUN, no Base writes] ' : ''}Generating ${records.length} post(s) · max ${maxAttempts} attempts · AI: ${env.AI_TEXT_PROVIDER ?? 'gemini'}`);
const summary: string[] = [];
try {
  for (const rec of records) {
    const id = String(rec.fields.post_id);
    log(`\n▶ ${id} (${rec.fields.platform} · ${rec.fields.format} · ${rec.fields.pillar})`);
    const t = Date.now();
    try {
      const status = await processPost(rec, { dry, maxAttempts, log });
      summary.push(`${status === 'pending_approval' ? '✅' : '❌'} ${id}: ${status} (${((Date.now() - t) / 1000).toFixed(0)}s)`);
    } catch (e) {
      if (e instanceof QuotaExhaustedError) {
        summary.push(`⏸ ${id}: back to planned (AI quota used up)`, `⏸ Stopped: ${e.message}`);
        break;
      }
      throw e;
    }
  }
} finally {
  started?.kill();
}
const left = remainingCallsToday();
console.log(`\n${summary.join('\n')}\nAI calls this run: ${callStats.calls}${Number.isFinite(left) ? ` · left today: ${left}` : ''}`);
