// Text + vision AI with structured JSON output, schema validation, retries and model fallback.
// Provider is switchable (AI_TEXT_PROVIDER): "gemini" (free tier, default for now) or "claude" (paid, API key in .env).
// Backup: when every Gemini model is used up or overloaded, Cloudflare Workers AI (free, same account as the images)
// takes over, within a daily "neurons" budget that leaves room for image generation (Settings ai_text.fallback).
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
/** Thrown when every model was busy or timing out (provider outage). Handled like the quota: stop, try again later. */
export class AiUnavailableError extends QuotaExhaustedError {}

export const callStats = { calls: 0 };

// ---------------------------------------------------------------------------
// Daily usage ledger (persists across runs, so several runs in one day share the free quota).
// Gemini's free quota resets at midnight US Pacific time (16:00 or 15:00 in Singapore).
// ---------------------------------------------------------------------------
const LEDGER = path.join(RUNNER_DIR, 'out', 'ai-usage.json');
interface Ledger { day: string; calls: Record<string, number>; exhausted: string[] }

export const quotaDay = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

/** Per-model daily request cap (free tier: 20). Set from Lark Settings `ai_quota.requests_per_model_per_day`. */
export const quota = { perModelPerDay: 20, perModel: {} as Record<string, number> };
/** A model's daily cap: Settings `ai_quota.per_model[model]`, else `requests_per_model_per_day`. */
const cap = (model: string) => quota.perModel[model] ?? quota.perModelPerDay;

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
  return l.exhausted.includes(model) || (l.calls[model] ?? 0) >= cap(model);
};

const geminiModels = () => (env.GEMINI_TEXT_MODELS ?? 'gemini-3.5-flash').split(',').map((m) => m.trim()).filter(Boolean);

/** Free requests left today across all Gemini models (Infinity for the paid Claude provider). */
export function remainingCallsToday(): number {
  if (provider() !== 'gemini') return Infinity;
  const l = ledgerNow();
  const gem = geminiModels().reduce((sum, m) =>
    sum + (l.exhausted.includes(m) ? 0 : Math.max(0, cap(m) - (l.calls[m] ?? 0))), 0);
  return gem + fallbackCallsLeft();
}
export function usageToday() { return { ...ledgerNow(), capacity: geminiModels().reduce((sum, m) => sum + cap(m), 0) }; }

// ---------------------------------------------------------------------------
const provider = () => (env.AI_TEXT_PROVIDER ?? 'gemini').toLowerCase();

export async function generateJson<T>(req: AiRequest<T>): Promise<AiResult<T>> {
  const p = provider();
  if (p === 'gemini') {
    // Testing only: AI_FORCE_BACKUP=1 skips Gemini so the Cloudflare backup can be checked end to end.
    if (env.AI_FORCE_BACKUP === '1') return cloudflare(req, new QuotaExhaustedError('forced for testing'));
    try {
      return await gemini(req);
    } catch (e) {
      // Gemini used up or overloaded: hand over to the free Cloudflare backup, if it's on and has budget left.
      if (e instanceof QuotaExhaustedError && fallbackCallsLeft() > 0) return cloudflare(req, e);
      throw e;
    }
  }
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
      throw new QuotaExhaustedError(`Today's free AI quota is used up (${models.length} models). It resets at midnight US Pacific time.`);
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
  // Nothing but busy / timeout / rate-limit answers: the provider is down, not the post's fault.
  if (errors.length && errors.every((e) => /busy|timeout|aborted|rate limited|daily quota|fetch failed/i.test(e))) {
    throw new AiUnavailableError(`Gemini is overloaded right now (busy or timing out on every model). The post was left as it was; try again later.`);
  }
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

// ---------------------------------------------------------------------------
// Cloudflare Workers AI backup (free daily allowance of 10,000 "neurons", shared with FLUX images).
// Settings ai_text.fallback: { enabled, models, max_neurons_per_day, neurons_per_call_estimate }.
// Its allowance resets at 00:00 UTC, so it has its own small ledger.
export const fallback = {
  enabled: true,
  /** Text calls (writing, brand check): the strongest reasoner first. */
  models: ['@cf/openai/gpt-oss-120b', '@cf/meta/llama-4-scout-17b-16e-instruct'],
  /** Writing (Copywriter): the model that writes cleaner, less salesy copy. GPT-OSS then checks it strictly. */
  writers: ['@cf/meta/llama-4-scout-17b-16e-instruct', '@cf/openai/gpt-oss-120b'],
  /** Calls with images (visual check): only models that can see. */
  vision: ['@cf/mistralai/mistral-small-3.1-24b-instruct', '@cf/meta/llama-4-scout-17b-16e-instruct'],
  maxNeuronsPerDay: 6000,   // keeps about 4,000 of the 10,000 free neurons for FLUX images
  neuronsPerCall: 300,      // rough cost of one agent call with our prompts (used for planning only)
};
const CF_LEDGER = path.join(RUNNER_DIR, 'out', 'cf-usage.json');
interface CfLedger { day: string; neurons: number; calls: number; exhausted: boolean }
const utcDay = () => new Date().toISOString().slice(0, 10);
function cfLedger(): CfLedger {
  const fresh: CfLedger = { day: utcDay(), neurons: 0, calls: 0, exhausted: false };
  try {
    const l = JSON.parse(readFileSync(CF_LEDGER, 'utf8')) as CfLedger;
    return l.day === fresh.day ? l : fresh;
  } catch { return fresh; }
}
function saveCf(l: CfLedger) {
  mkdirSync(path.dirname(CF_LEDGER), { recursive: true });
  writeFileSync(CF_LEDGER, JSON.stringify(l, null, 2));
}
export function fallbackCallsLeft(): number {
  if (!fallback.enabled || !env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) return 0;
  const l = cfLedger();
  if (l.exhausted) return 0;
  return Math.max(0, Math.floor((fallback.maxNeuronsPerDay - l.neurons) / fallback.neuronsPerCall));
}
export const fallbackUsage = () => cfLedger();

async function cloudflare<T>(req: AiRequest<T>, cause: Error): Promise<AiResult<T>> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/v1/chat/completions`;
  const models = req.images?.length ? fallback.vision : req.label.startsWith('copywriter') ? fallback.writers : fallback.models;
  if (!models.length) throw cause;
  const errors: string[] = [];
  let feedback = '';
  let attempts = 0;
  for (let round = 0; round < 2; round++) {
    for (const model of models) {
      const l = cfLedger();
      if (l.exhausted || l.neurons >= fallback.maxNeuronsPerDay) {
        throw new QuotaExhaustedError(`Gemini stopped (${cause.message.split('.')[0]}) and today's Cloudflare backup budget is used up too. The next run continues.`);
      }
      attempts++;
      callStats.calls++;
      const content: unknown = req.images?.length
        ? [{ type: 'text', text: req.user + feedback }, ...req.images.map((img) => ({ type: 'image_url', image_url: { url: `data:${img.mime};base64,${img.data.toString('base64')}` } }))]
        : req.user + feedback;
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [{ role: 'system', content: req.system }, { role: 'user', content }],
            response_format: { type: 'json_object' },
            temperature: req.temperature ?? 0.4,
            max_tokens: 8000,
          }),
          signal: AbortSignal.timeout(180_000),
        });
      } catch (e) {
        errors.push(`${model}: ${(e as Error).message}`);
        continue;
      }
      const body = (await res.json().catch(() => ({}))) as any;
      const used = Number(body.usage?.neurons ?? fallback.neuronsPerCall);
      const after = cfLedger();
      after.neurons += res.ok ? used : 0;
      after.calls += 1;
      const errText = JSON.stringify(body.errors ?? body.error ?? '');
      if (res.status === 429 || /neuron|daily|limit/i.test(errText) && !res.ok) {
        after.exhausted = true;
        saveCf(after);
        throw new QuotaExhaustedError(`Gemini stopped and Cloudflare's free daily AI allowance is used up. The next run continues.`);
      }
      saveCf(after);
      if (!res.ok) {
        errors.push(`${model}: HTTP ${res.status} ${errText.slice(0, 120)}`);
        continue;
      }
      const text: string = body.choices?.[0]?.message?.content ?? '';
      const r = parseAndValidate(typeof text === 'string' ? text : JSON.stringify(text), req.schema);
      if (r.ok) return { data: r.data, model, provider: 'cloudflare', attempts };
      errors.push(`${model}: ${r.error}`);
      feedback = r.feedback;
    }
  }
  if (errors.every((e) => /HTTP 5\d\d|timeout|aborted|fetch failed/i.test(e))) {
    throw new AiUnavailableError(`Gemini stopped and the Cloudflare backup is unavailable right now. The next run continues.`);
  }
  throw new Error(`[${req.label}] AI failed after ${attempts} backup attempts: ${errors.slice(-4).join(' | ')}`);
}
