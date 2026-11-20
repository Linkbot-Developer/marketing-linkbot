// Shared pieces for the render modules.
import { writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { generateImage } from '../lib/ai-images.js';
import { dataUri, type Job } from '../lib/files.js';
import { escapeHtml, loadTemplate, textToHtml, themeCss } from '../lib/html.js';
import { logos } from '../config.js';
import type { ImageSource } from '../schemas.js';

export interface ResolvedImage {
  file: string;
  mime: string;
  provider: string;
}

/** Turn an ImageSource into a local file in the job folder (generating with AI if needed). */
export async function resolveImage(src: ImageSource, aspect: '1:1' | '4:5' | '9:16', job: Job, name: string): Promise<ResolvedImage> {
  if ('prompt' in src) {
    const img = await generateImage(src.prompt, aspect);
    const file = job.file(`${name}${img.mime.includes('png') ? '.png' : '.jpg'}`);
    writeFileSync(file, img.buf);
    return { file, mime: img.mime, provider: `${img.provider}:${img.model}` };
  }
  if ('base64' in src) {
    const file = job.file(`${name}${src.mime === 'image/png' ? '.png' : '.jpg'}`);
    writeFileSync(file, Buffer.from(src.base64, 'base64'));
    return { file, mime: src.mime, provider: 'supplied' };
  }
  const res = await fetch(src.url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Could not download image (${res.status})`);
  const mime = res.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg';
  if (!mime.startsWith('image/')) throw new Error(`URL is not an image (${mime})`);
  const file = job.file(`${name}${mime.includes('png') ? '.png' : '.jpg'}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return { file, mime, provider: 'url' };
}

export const common = {
  theme: () => themeCss(),
  fit: () => loadTemplate('brand/fit.js'),
  logo: (version: 'white' | 'blue' = 'white') => dataUri(logos[version]),
  tag: (t?: string) => (t ? `<span class="tag">${escapeHtml(t)}</span>` : ''),
  bgImage: (img?: ResolvedImage) => (img ? `<img class="bg" src="${dataUri(img.file, img.mime)}" alt="">` : ''),
  text: textToHtml,
};

export function parseSize(size: string): { width: number; height: number; aspect: '1:1' | '4:5' } {
  const [w, h] = size.split('x').map(Number);
  return { width: w, height: h, aspect: w === h ? '1:1' : '4:5' };
}

export function writeJson(job: Job, name: string, data: unknown) {
  writeFileSync(path.join(job.dir, name), JSON.stringify(data, null, 2));
}

export const read = (file: string) => readFileSync(file);
