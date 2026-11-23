// Text + vision AI with structured JSON output, schema validation, retries and model fallback.
// Provider is switchable (AI_TEXT_PROVIDER): "gemini" (free tier, default for now) or "claude" (paid, API key in .env).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import type { ZodType } from 'zod';
import { RUNNER_DIR, env } from './env.js';

export interface AiImage { data: Buffer; mime: string }
export interface AiRequest<T> {
  label: string;           // for logs, e.g. "copywriter W49-IG-03"
  system: string;
  user: string;
  schema: ZodType<T>;
  images?: AiImage[];
  temperature?: number;
}
export interface AiResult<T> { data: T; model: string; provider: string; attempts: number }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Thrown when the day's AI budget is used up. Not a content failure: the post stays `planned`. */
export class QuotaExhaustedError extends Error {}

export const callStats = { calls: 0 };

// ---------------------------------------------------------------------------
// Daily usage ledger (persists across runs, so several runs in one day share the free quota).
// Gemini's free quota resets at midnight US Pacific time (16:00 or 15:00 in Singapore).
// ---------------------------------------------------------------------------
const LEDGER = path.join(RUNNER_DIR, 'out', 'ai-usage.json');
interface Ledger { day: string; calls: Record<string, number>; exhausted: string[] }

export const quotaDay = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

/** Per-model daily request cap (free tier: 20). Set from Lark Settings `ai_quota.requests_per_model_per_day`. */
export const quota = { perModelPerDay: 20 };

function loadLedger(): Ledger {
  const fresh: Ledger = { day: quotaDay(), calls: {}, exhausted: [] };
  if (!existsSync(LEDGER)) return fresh;
  try {
    const l = JSON.parse(readFileSync(LEDGER, 'utf8')) as Ledger;
    return l.day === fresh.day ? l : fresh;
  } catch { return fresh; }
}
function saveLedger(l: Ledger) {
  mkdirSync(path.dirname(LEDGER), { recursive: true });
  writeFileSync(LEDGER, JSON.stringify(l, null, 2));
}
let ledger = loadLedger();
function ledgerNow(): Ledger {
  if (ledger.day !== quotaDay()) ledger = loadLedger(); // day rolled over mid-run
  return ledger;
}
function recordCall(model: string) {
  const l = ledgerNow();
  l.calls[model] = (l.calls[model] ?? 0) + 1;
  callStats.calls++;
  saveLedger(l);
}
function markExhausted(model: string) {
  const l = ledgerNow();
  if (!l.exhausted.includes(model)) l.exhausted.push(model);
  saveLedger(l);
}
const isSpent = (model: string) => {
  const l = ledgerNow();
  return l.exhausted.includes(model) || (l.calls[model] ?? 0) >= quota.perModelPerDay;
};

const geminiModels = () => (env.GEMINI_TEXT_MODELS ?? 'gemini-3.5-flash').split(',').map((m) => m.trim()).filter(Boolean);

/** Free requests left today across all Gemini models (Infinity for the paid Claude provider). */
export function remainingCallsToday(): number {
  if (provider() !== 'gemini') return Infinity;
  const l = ledgerNow();
  return geminiModels().reduce((sum, m) =>
    sum + (l.exhausted.includes(m) ? 0 : Math.max(0, quota.perModelPerDay - (l.calls[m] ?? 0))), 0);
}
export function usageToday() { return { ...ledgerNow(), capacity: geminiModels().length * quota.perModelPerDay }; }

// ---------------------------------------------------------------------------
const provider = () => (env.AI_TEXT_PROVIDER ?? 'gemini').toLowerCase();

export async function generateJson<T>(req: AiRequest<T>): Promise<AiResult<T>> {
  const p = provider();
  if (p === 'gemini') return gemini(req);
  if (p === 'claude') return claude(req);
  throw new Error(`Unknown AI_TEXT_PROVIDER "${p}"`);
}

function parseAndValidate<T>(text: string, schema: ZodType<T>): { ok: true; data: T } | { ok: false; error: string; feedback: string } {
  // Tolerate a ```json fence around the object.
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let json: unknown;
  try { json = JSON.parse(cleaned); } catch {
    return { ok: false, error: 'invalid JSON', feedback: '\n\nYour previous reply was not valid JSON. Reply with one valid JSON object only.' };
  }
  const parsed = schema.safeParse(json);
  if (parsed.success) return { ok: true, data: parsed.data };
  const issues = parsed.error.issues.slice(0, 8).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
  return { ok: false, error: `schema (${issues})`, feedback: `\n\nYour previous reply did not match the required JSON format. Fix these and reply with the full JSON again: ${issues}` };
}

// ---------------------------------------------------------------------------
async function gemini<T>(req: AiRequest<T>): Promise<AiResult<T>> {
  const key = env.GEMINI_API_KEY;
  if (!key) throw new Error('Missing GEMINI_API_KEY');
  const models = geminiModels();
  const errors: string[] = [];
  let attempts = 0;
  let feedback = '';

  // Up to 3 rounds through the model list; a schema failure is fed back to the model on the next try.
  for (let round = 0; round < 3; round++) {
    if (models.every(isSpent)) {
      throw new QuotaExhaustedError(`Today's free AI quota is used up (${models.length} models × ${quota.perModelPerDay}). It resets at midnight US Pacific time.`);
    }
    for (const model of models) {
      if (isSpent(model)) continue;
      attempts++;
      recordCall(model);
      const parts: unknown[] = [{ text: req.user + feedback }];
      for (const img of req.images ?? []) parts.push({ inlineData: { mimeType: img.mime, data: img.data.toString('base64') } });
      let res: Response;
      try {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: req.system }] },
            contents: [{ role: 'user', parts }],
            generationConfig: { responseMimeType: 'application/json', temperature: req.temperature ?? 0.4 },
          }),
          signal: AbortSignal.timeout(180_000),
        });
      } catch (e) {
        errors.push(`${model}: ${(e as Error).message}`);
        continue;
      }
      const body = (await res.json().catch(() => ({}))) as any;
      if (res.status === 429) {
        const details: any[] = body.error?.details ?? [];
        const perDay = details.some((d) => (d.violations ?? []).some((v: any) => /PerDay/i.test(v.quotaId ?? '')));
        if (perDay) {
          markExhausted(model); // don't waste more calls on it today, in this run or the next
          errors.push(`${model}: daily quota used up`);
          continue;
        }
        const delay = parseFloat(String(details.find((d) => d.retryDelay)?.retryDelay ?? '10'));
        errors.push(`${model}: rate limited, waiting ${Math.min(delay, 60)}s`);
        await sleep(Math.min(delay, 60) * 1000);
        continue;
      }
      if (res.status === 503 || res.status === 500) {
        errors.push(`${model}: HTTP ${res.status} (busy)`);
        continue; // try the next model
      }
      if (!res.ok) {
        errors.push(`${model}: HTTP ${res.status} ${body.error?.message?.slice(0, 120) ?? ''}`);
        continue;
      }
      const text: string = body.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? '';
      const r = parseAndValidate(text, req.schema);
      if (r.ok) return { data: r.data, model, provider: 'gemini', attempts };
      errors.push(`${model}: ${r.error}`);
      feedback = r.feedback;
    }
    await sleep(4000 * (round + 1)); // free tier is often busy; back off before the next round
  }
  if (models.every(isSpent)) throw new QuotaExhaustedError(`Today's free AI quota is used up.`);
  throw new Error(`[${req.label}] AI failed after ${attempts} attempts: ${errors.slice(-6).join(' | ')}`);
}

// ---------------------------------------------------------------------------
// Claude (paid). Switch on with AI_TEXT_PROVIDER=claude once billing is approved.
// Server-side refusal fallback is on, so a rare safety decline is retried on another model automatically.
let anthropic: Anthropic | null = null;

async function claude<T>(req: AiRequest<T>): Promise<AiResult<T>> {
  if (!env.ANTHROPIC_API_KEY) throw new Error('Missing ANTHROPIC_API_KEY');
  anthropic ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 3 });
  const model = env.CLAUDE_MODEL || 'claude-opus-5-5';
  let feedback = '';
  const errors: string[] = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    callStats.calls++;
    const content: Anthropic.Beta.BetaContentBlockParam[] = (req.images ?? []).map((img) => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: img.mime as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif', data: img.data.toString('base64') },
    }));
    content.push({ type: 'text', text: `${req.user}${feedback}\n\nReply with one JSON object only, no other text.` });
    const msg = await anthropic.beta.messages.create({
      model,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      system: req.system,
      messages: [{ role: 'user', content }],
    } as any) as Anthropic.Beta.BetaMessage;
    if (msg.stop_reason === 'refusal') throw new Error(`[${req.label}] Claude declined the request`);
    const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    const r = parseAndValidate(text, req.schema);
    if (r.ok) return { data: r.data, model: msg.model, provider: 'claude', attempts: attempt };
    errors.push(r.error);
    feedback = r.feedback;
  }
  throw new Error(`[${req.label}] Claude failed after 3 attempts: ${errors.join(' | ')}`);
}
