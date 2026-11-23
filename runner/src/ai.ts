// Text + vision AI with structured JSON output, schema validation, retries and model fallback.
// Provider is switchable (AI_TEXT_PROVIDER): "gemini" works now (free tier); "claude" is wired in when the API key exists.
import type { ZodType } from 'zod';
import { env } from './env.js';

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

export async function generateJson<T>(req: AiRequest<T>): Promise<AiResult<T>> {
  const provider = (env.AI_TEXT_PROVIDER ?? 'gemini').toLowerCase();
  if (provider === 'gemini') return gemini(req);
  if (provider === 'claude') {
    throw new Error('Claude provider not enabled yet: add ANTHROPIC_API_KEY, then implement with the official SDK (docs/marketing-system-spec.md §6).');
  }
  throw new Error(`Unknown AI_TEXT_PROVIDER "${provider}"`);
}

async function gemini<T>(req: AiRequest<T>): Promise<AiResult<T>> {
  const key = env.GEMINI_API_KEY;
  if (!key) throw new Error('Missing GEMINI_API_KEY');
  const models = (env.GEMINI_TEXT_MODELS ?? 'gemini-3.5-flash').split(',').map((m) => m.trim()).filter(Boolean);
  const errors: string[] = [];
  let attempts = 0;
  let feedback = '';

  // Up to 3 rounds through the model list; a schema failure is fed back to the model on the next try.
  for (let round = 0; round < 3; round++) {
    for (const model of models) {
      attempts++;
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
      if (res.status === 503 || res.status === 429 || res.status === 500) {
        errors.push(`${model}: HTTP ${res.status} (busy)`);
        continue; // try the next model
      }
      if (!res.ok) {
        errors.push(`${model}: HTTP ${res.status} ${body.error?.message?.slice(0, 120) ?? ''}`);
        continue;
      }
      const text: string = body.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? '';
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        errors.push(`${model}: invalid JSON`);
        feedback = '\n\nYour previous reply was not valid JSON. Reply with one valid JSON object only.';
        continue;
      }
      const parsed = req.schema.safeParse(json);
      if (parsed.success) return { data: parsed.data, model, provider: 'gemini', attempts };
      const issues = parsed.error.issues.slice(0, 8).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
      errors.push(`${model}: schema (${issues})`);
      feedback = `\n\nYour previous reply did not match the required JSON format. Fix these and reply with the full JSON again: ${issues}`;
    }
    await sleep(4000 * (round + 1)); // free tier is often busy; back off before the next round
  }
  throw new Error(`[${req.label}] AI failed after ${attempts} attempts: ${errors.slice(-6).join(' | ')}`);
}
