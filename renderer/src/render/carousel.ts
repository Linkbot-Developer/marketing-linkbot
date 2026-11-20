// Carousel: one PNG per slide (title / point / cta), numbered, with a swipe hint on the first slide.
import { htmlToPng } from '../lib/browser.js';
import { newJob, type OutputFile } from '../lib/files.js';
import { escapeHtml, fill, loadTemplate } from '../lib/html.js';
import type { CarouselRequest } from '../schemas.js';
import { common, parseSize } from './common.js';

export async function renderCarousel(req: CarouselRequest) {
  const job = newJob(req.postId);
  const { width, height } = parseSize(req.size);
  const total = req.slides.length;
  const files: OutputFile[] = [];

  for (const [i, s] of req.slides.entries()) {
    const lead = s.number ? `<div class="num">${s.number}</div>` : s.icon ? `<div class="icon">${escapeHtml(s.icon)}</div>` : '';
    const html = fill(loadTemplate('carousel/slide.html'), {
      theme: common.theme(),
      fit: common.fit(),
      width,
      height,
      kind: s.kind,
      swipe: i === 0 && total > 1 ? '<div class="swipe">SWIPE →</div>' : '',
      lead,
      heading: common.text(s.heading),
      headingMax: Math.round(height * 0.4),
      body: s.body ? `<p>${common.text(s.body)}</p>` : '',
      button: s.button ? `<div class="pill">${escapeHtml(s.button)}</div>` : '',
      counter: `${i + 1} / ${total}`,
      logo: common.logo(s.kind === 'point' ? 'blue' : 'white'),
    });
    const name = `slide-${String(i + 1).padStart(2, '0')}.png`;
    await htmlToPng(html, width, height, job.file(name));
    files.push(job.describe(name, { width, height }));
  }
  return { jobId: job.id, files, meta: { slides: total } };
}
