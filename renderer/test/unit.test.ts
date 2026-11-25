import { describe, expect, it } from 'vitest';
import { escapeHtml, fill, textToHtml } from '../src/lib/html.js';
import { IMAGE_RULES, sanitiseBrief } from '../src/lib/ai-images.js';
import { CarouselRequest, ImageRequest, ReelRequest } from '../src/schemas.js';

describe('templates', () => {
  it('escapes AI/person-written text by default', () => {
    expect(fill('<h1>{{t}}</h1>', { t: '<script>alert(1)</script>' })).toBe('<h1>&lt;script&gt;alert(1)&lt;/script&gt;</h1>');
  });
  it('allows raw markup only through triple braces', () => {
    expect(fill('{{{m}}}', { m: '<b>ok</b>' })).toBe('<b>ok</b>');
  });
  it('turns line breaks into <br> after escaping', () => {
    expect(textToHtml('A & B\nC')).toBe('A &amp; B<br>C');
  });
  it('fails loudly on a missing variable', () => {
    expect(() => fill('{{nope}}', {})).toThrow(/nope/);
  });
  it('escapes quotes', () => {
    expect(escapeHtml(`"it's"`)).toBe('&quot;it&#39;s&quot;');
  });
});

describe('brand rules in image prompts', () => {
  it('always forbids text, logos and sci-fi, and never names clocks (FLUX draws what is named)', () => {
    for (const rule of ['No readable text', 'no logos', 'No robots', 'plain painted wall']) expect(IMAGE_RULES).toContain(rule);
    expect(IMAGE_RULES).not.toMatch(/clock/i);
  });
  it('strips times and clocks from briefs so the model cannot draw them', () => {
    const out = sanitiseBrief('A tired worker at 5pm on Friday, a wall clock showing 5:00 PM behind, 6 o\'clock light');
    expect(out).not.toMatch(/5pm|5:00|o'clock|clock/i);
    expect(out).toContain('tired worker');
  });
});

describe('request validation', () => {
  it('accepts a minimal image request and applies the default size', () => {
    const r = ImageRequest.parse({ postId: 'W49-IG-03', headline: 'Hello' });
    expect(r.size).toBe('1080x1350');
  });
  it('rejects unsafe post IDs', () => {
    expect(ImageRequest.safeParse({ postId: '../etc', headline: 'x' }).success).toBe(false);
  });
  it('requires at least two carousel slides', () => {
    expect(CarouselRequest.safeParse({ postId: 'a', slides: [{ kind: 'title', heading: 'x' }] }).success).toBe(false);
  });
  it('validates reel scene types and caps length', () => {
    const ok = ReelRequest.safeParse({
      postId: 'r1',
      scenes: [{ type: 'statement', text: 'a', vo: 'a' }, { type: 'cta', text: 'b', vo: 'b', button: 'Book a free consultation' }],
    });
    expect(ok.success && ok.data.maxSeconds).toBe(45);
    expect(ReelRequest.safeParse({ postId: 'r1', scenes: [{ type: 'dance', text: 'a', vo: 'a' }, { type: 'statement', text: 'b', vo: 'b' }] }).success).toBe(false);
  });
  it('rejects an invalid voice name', () => {
    expect(ReelRequest.safeParse({ postId: 'r', voice: 'robot', scenes: [{ type: 'statement', text: 'a', vo: 'a' }, { type: 'statement', text: 'b', vo: 'b' }] }).success).toBe(false);
  });
});
