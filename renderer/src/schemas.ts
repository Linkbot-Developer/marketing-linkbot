// Request schemas for every endpoint. These match the Copywriter's output (agents/copywriter.md)
// after n8n maps it, and reject anything malformed before we spend time rendering.
import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);

export const ImageSource = z.union([
  z.object({ prompt: z.string().trim().min(10).max(2000) }),
  z.object({ base64: z.string().min(100), mime: z.enum(['image/png', 'image/jpeg', 'image/webp']).default('image/jpeg') }),
  z.object({ url: z.url() }),
]);
export type ImageSource = z.infer<typeof ImageSource>;

const postId = z.string().trim().regex(/^[A-Za-z0-9_-]{1,40}$/, 'postId: letters, numbers, - and _ only');

export const ImageRequest = z.object({
  postId,
  size: z.enum(['1080x1350', '1080x1080', '1200x1500']).default('1080x1350'),
  image: ImageSource.optional(),
  headline: text(160),
  sub: text(220).optional(),
  tag: text(40).optional(),
});

export const CarouselSlide = z.object({
  kind: z.enum(['title', 'point', 'cta']),
  heading: text(140),
  body: text(260).optional(),
  number: z.number().int().min(1).max(20).optional(),
  icon: z.string().max(8).optional(),
  button: text(60).optional(),
});
export const CarouselRequest = z.object({
  postId,
  size: z.enum(['1080x1350', '1080x1080', '1200x1500']).default('1080x1350'),
  slides: z.array(CarouselSlide).min(2).max(10),
});

export const StoryRequest = z.object({
  postId,
  image: ImageSource.optional(),
  headline: text(120),
  sub: text(180).optional(),
  tag: text(40).optional(),
  button: text(50).optional(),
});

const vo = text(400);
export const ReelScene = z.discriminatedUnion('type', [
  z.object({ type: z.literal('photo'), text: text(90), vo, image: ImageSource, motion: z.enum(['push-in', 'pull-out', 'drift']).default('push-in') }),
  z.object({ type: z.literal('statement'), text: text(110), vo }),
  z.object({
    type: z.literal('steps'), title: text(50), vo, label: text(40).optional(),
    steps: z.array(text(60)).min(2).max(5),
    notification: z.object({ from: text(40), text: text(160) }).optional(),
  }),
  z.object({ type: z.literal('cta'), text: text(110), vo, button: text(70), footer: text(60).optional() }),
]);
export type ReelScene = z.infer<typeof ReelScene>;

export const ReelRequest = z.object({
  postId,
  voice: z.string().regex(/^[a-z]{2}-[A-Z]{2}-\w+Neural$/).optional(),
  rate: z.string().regex(/^[+-]\d{1,2}%$/).optional(),
  scenes: z.array(ReelScene).min(2).max(8),
  /** Hard limit so a wordy script can't produce a 60 s Reel by accident. */
  maxSeconds: z.number().min(5).max(90).default(45),
});

export type ImageRequest = z.infer<typeof ImageRequest>;
export type CarouselRequest = z.infer<typeof CarouselRequest>;
export type StoryRequest = z.infer<typeof StoryRequest>;
export type ReelRequest = z.infer<typeof ReelRequest>;
