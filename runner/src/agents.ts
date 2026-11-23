// The agents: system prompts from /agents + CLAUDE.md, and the JSON shapes they must return.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { repoFile } from './env.js';

const shared = () => `${repoFile('CLAUDE.md')}\n\n---\n\n${repoFile('agents/README.md')}`;
const system = (agentFile: string) => `${shared()}\n\n---\n\n${repoFile(agentFile)}\n\nReply with a single JSON object only.`;

export const prompts = {
  copywriter: () => system('agents/copywriter.md'),
  brandChecker: () => system('agents/brand-checker.md'),
  visualQc: () => system('agents/visual-qc.md'),
};

/** Short fingerprint of the prompt files, stored on each post so results can be traced to a prompt version. */
export function promptVersion(): string {
  const h = createHash('sha256');
  for (const f of ['CLAUDE.md', 'agents/README.md', 'agents/copywriter.md', 'agents/brand-checker.md', 'agents/visual-qc.md']) h.update(repoFile(f));
  return `p-${h.digest('hex').slice(0, 8)}`;
}

const str = z.string().trim().min(1);
const photo = z.object({ type: z.literal('photo'), text: str, vo: str, image_prompt: str, motion: z.enum(['push-in', 'pull-out', 'drift']).optional() });
const scene = z.discriminatedUnion('type', [
  photo,
  z.object({ type: z.literal('statement'), text: str, vo: str }),
  z.object({ type: z.literal('steps'), title: str, vo: str, label: z.string().optional(), steps: z.array(str).min(2).max(5),
    notification: z.object({ from: str, text: str }).optional() }),
  z.object({ type: z.literal('cta'), text: str, vo: str, button: str, footer: z.string().optional() }),
]);

export const RenderSpec = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('image'), headline: str, sub: z.string().optional(), tag: z.string().optional(), image_prompt: z.string().optional() }),
  z.object({ kind: z.literal('carousel'), slides: z.array(z.object({
    kind: z.enum(['title', 'point', 'cta']), heading: str, body: z.string().optional(), number: z.number().int().optional(), button: z.string().optional(),
  })).min(2).max(10) }),
  z.object({ kind: z.literal('story'), headline: str, sub: z.string().optional(), tag: z.string().optional(), button: z.string().optional(), image_prompt: z.string().optional() }),
  z.object({ kind: z.literal('reel'), scenes: z.array(scene).min(3).max(8) }),
]);
export type RenderSpec = z.infer<typeof RenderSpec>;

export const CopywriterOut = z.object({
  hook: str,
  caption: str,
  hashtags: z.array(z.string()).default([]),
  cta_link: z.string().default(''),
  alt_text: z.string().default(''),
  labels: z.array(z.string()).default([]),
  ai_generated: z.boolean().default(true),
  visual_brief: z.unknown().optional(),
  poll: z.object({ question: str, options: z.array(z.string().max(30)).min(2).max(4) }).optional(),
  render: RenderSpec,
  change_notes: z.string().optional(),
  needs_human: z.boolean().default(false),
  needs_human_reason: z.string().optional(),
});
export type CopywriterOut = z.infer<typeof CopywriterOut>;

export const BrandCheckOut = z.object({
  result: z.enum(['pass', 'fail']),
  checks: z.array(z.object({ n: z.number(), status: z.enum(['pass', 'warn', 'fail']), evidence: z.string().optional(), fix: z.string().optional() })).default([]),
  summary: z.string().default(''),
  needs_human: z.boolean().default(false),
  needs_human_reason: z.string().optional(),
});
export type BrandCheckOut = z.infer<typeof BrandCheckOut>;

export const VisualQcOut = z.object({
  result: z.enum(['pass', 'fail']),
  issues: z.array(z.object({ image: z.number().optional(), check: z.number().optional(), problem: str, fix: z.string().optional() })).default([]),
  summary: z.string().default(''),
});
export type VisualQcOut = z.infer<typeof VisualQcOut>;
