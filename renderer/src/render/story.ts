// Story (1080×1920 image) with platform safe zones respected.
import { htmlToPng } from '../lib/browser.js';
import { newJob } from '../lib/files.js';
import { escapeHtml, fill, loadTemplate } from '../lib/html.js';
import type { StoryRequest } from '../schemas.js';
import { common, resolveImage } from './common.js';

export async function renderStory(req: StoryRequest) {
  const job = newJob(req.postId);
  const img = req.image ? await resolveImage(req.image, '9:16', job, 'source') : undefined;
  const html = fill(loadTemplate('story/story.html'), {
    theme: common.theme(),
    fit: common.fit(),
    background: common.bgImage(img),
    tag: common.tag(req.tag),
    headline: common.text(req.headline),
    sub: req.sub ? `<p>${common.text(req.sub)}</p>` : '',
    button: req.button ? `<div class="pill">${escapeHtml(req.button)}</div>` : '',
    logo: common.logo('white'),
  });
  await htmlToPng(html, 1080, 1920, job.file('story.png'));
  return { jobId: job.id, files: [job.describe('story.png', { width: 1080, height: 1920 })], meta: { imageProvider: img?.provider ?? 'none' } };
}
