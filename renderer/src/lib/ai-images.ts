// AI image generation with provider fallback (order from IMAGE_PROVIDERS, default cloudflare → gemini).
// Brand rules from agents/copywriter.md are appended to every prompt, so they can't be forgotten.
import { config } from '../config.js';

// FLUX-style models largely ignore negative instructions, so the rules are stated positively first
// ("plain unbranded lid", "bare walls"), then negatively for models that do follow them.
// Anything that still slips through is caught by the visual QC step (W3) and regenerated.
export const IMAGE_RULES =
  'Devices are plain and unbranded: matte laptop lids with no emblem; any visible screen shows only a soft plain blue gradient, or faces away from the camera. ' +
  // FLUX ignores negatives and tends to draw whatever is named, so the background is described positively only.
  'Close, shallow-depth-of-field framing; the background is a softly blurred plain painted wall, a large window with daylight, or green plants. ' +
  'No readable text, no letters or numbers, no logos or brand marks, no watermarks. ' +
  'No robots, no sci-fi, no futuristic AI imagery.';

export interface GeneratedImage {
  buf: Buffer;
  mime: string;
  provider: string;
  model: string;
}

type Aspect = '1:1' | '4:5' | '9:16';

async function cloudflare(prompt: string): Promise<GeneratedImage> {
  const { accountId, token, model } = config.cloudflare;
  if (!accountId || !token) throw new Error('Cloudflare not configured');
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ prompt, steps: 8 }),
    signal: AbortSignal.timeout(120_000),
  });
  const body = (await res.json()) as { result?: { image?: string } };
  if (!res.ok || !body.result?.image) throw new Error(`Cloudflare HTTP ${res.status}`);
  return { buf: Buffer.from(body.result.image, 'base64'), mime: 'image/jpeg', provider: 'cloudflare', model };
}

async function gemini(prompt: string, aspect: Aspect): Promise<GeneratedImage> {
  const { key, model } = config.gemini;
  if (!key) throw new Error('Gemini not configured');
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: aspect } },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const body = (await res.json()) as any;
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const part = body.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
  if (!part) throw new Error('Gemini returned no image');
  return { buf: Buffer.from(part.inlineData.data, 'base64'), mime: part.inlineData.mimeType, provider: 'gemini', model };
}

/**
 * Image models draw whatever is named, even after "no" (e.g. "5pm" → a clock). Remove time-of-day and
 * clock references from the brief; the overlay text carries the time instead.
 */
export function sanitiseBrief(brief: string): string {
  return brief
    .replace(/\b\d{1,2}(:\d{2})?\s*(a\.?m\.?|p\.?m\.?|o'?clock)\b/gi, '')
    .replace(/\b(wall[- ]?)?clocks?\b|\bwatch(es)?\b|\btime on the\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Try each configured provider in order; throws with every provider's error if all fail. */
export async function generateImage(brief: string, aspect: Aspect = '4:5'): Promise<GeneratedImage> {
  const framing = aspect === '9:16' ? 'Vertical framing.' : aspect === '1:1' ? 'Square framing.' : 'Portrait 4:5 framing.';
  const prompt = `${sanitiseBrief(brief)} ${framing} ${IMAGE_RULES}`;
  const errors: string[] = [];
  for (const provider of config.imageProviders) {
    try {
      if (provider === 'cloudflare') return await cloudflare(prompt);
      if (provider === 'gemini') return await gemini(prompt, aspect);
      errors.push(`${provider}: unknown provider`);
    } catch (e) {
      errors.push(`${provider}: ${(e as Error).message}`);
    }
  }
  throw new Error(`All image providers failed: ${errors.join('; ')}`);
}
