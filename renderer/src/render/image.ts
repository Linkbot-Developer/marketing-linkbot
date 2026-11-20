// Single image post: AI (or supplied) photo + navy band + headline + logo. No image → solid navy card.
import { htmlToPng } from '../lib/browser.js';
import { newJob, type OutputFile } from '../lib/files.js';
import { fill, loadTemplate } from '../lib/html.js';
import type { ImageRequest } from '../schemas.js';
import { common, parseSize, resolveImage } from './common.js';

export async function renderImage(req: ImageRequest) {
  const job = newJob(req.postId);
  const { width, height, aspect } = parseSize(req.size);
  const img = req.image ? await resolveImage(req.image, aspect, job, 'source') : undefined;
  const html = fill(loadTemplate('image/overlay.html'), {
    theme: common.theme(),
    fit: common.fit(),
    width,
    height,
    variant: img ? 'photo' : 'solid',
    background: common.bgImage(img),
    tag: common.tag(req.tag),
    headline: common.text(req.headline),
    headlineSize: img ? 76 : 96,
    headlineMax: img ? Math.round(height * 0.26) : Math.round(height * 0.5),
    sub: req.sub ? `<p class="sub">${common.text(req.sub)}</p>` : '',
    logo: common.logo('white'),
  });
  await htmlToPng(html, width, height, job.file('post.png'));
  const files: OutputFile[] = [job.describe('post.png', { width, height })];
  return { jobId: job.id, files, meta: { imageProvider: img?.provider ?? 'none' } };
}
