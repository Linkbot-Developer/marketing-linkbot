# Linkbot Renderer

Turns approved post data (from the Copywriter agent, via n8n) into finished, on-brand media.
Part of the system in [`../docs/marketing-system-spec.md`](../docs/marketing-system-spec.md).

## Run it

```bash
npm install
npx playwright install chromium
npm start            # http://localhost:8787
npm run demo         # renders the week 49 test posts into out/demo/ (server must be running)
npm test             # unit tests
npm run typecheck
```

Needs FFmpeg and Edge TTS on the machine (see the repo README). Keys come from the repo's `.env`.

## API

All `POST` endpoints take JSON and need `Authorization: Bearer <RENDERER_API_KEY>` (open locally if the key is unset).
They return `{ jobId, files: [{ name, url, mime, bytes, width, height, durationSec? }], meta }`. Download each file from `GET <url>` with the same header.

| Endpoint | Makes | Key fields |
|---|---|---|
| `GET /health` | — | — |
| `POST /render/image` | 1 PNG (1080×1350 default) | `postId`, `headline`, `sub?`, `tag?`, `image?` (`{prompt}` / `{base64}` / `{url}`); no image gives a solid navy card |
| `POST /render/carousel` | 2–10 PNGs | `slides[]` of `{ kind: title\|point\|cta, heading, body?, number?, icon?, button? }` |
| `POST /render/story` | 1 PNG 1080×1920 (safe zones respected) | `headline`, `sub?`, `tag?`, `button?`, `image?` |
| `POST /render/reel` | MP4 1080×1920 + one review frame per scene | `scenes[]`: `photo` (text, vo, image, motion), `statement`, `steps` (title, steps[], label?, notification?), `cta` (text, button, footer?); `voice?`, `rate?`, `maxSeconds` (default 45) |

Scene timing comes from the voiceover: each scene lasts as long as its line plus a short pause, and the end card holds at least 3.6 s. A script that would run past `maxSeconds` is rejected, not rendered.

## Where to change things

| Change | File |
|---|---|
| Colours, fonts, shared styles | `../templates/brand/theme.css` |
| Image post layout | `../templates/image/overlay.html` |
| Carousel slide layouts | `../templates/carousel/slide.html` |
| Story layout | `../templates/story/story.html` |
| Reel look (positions, sizes) | `../templates/video/reel.html` |
| Reel animations and timing | `src/render/reel.ts` (`sceneTimeline`) |
| Rules added to every AI image prompt | `src/lib/ai-images.ts` (`IMAGE_RULES`) |
| Image provider order | `.env` `IMAGE_PROVIDERS=cloudflare,gemini` |
| Voice | `.env` `TTS_VOICE` (default `en-GB-SoniaNeural`), `TTS_RATE` |

Long headlines shrink automatically to fit (`templates/brand/fit.js`). All AI- or person-written text is HTML-escaped.

## Known limits
- **AI images can still include unwanted details** (logos, clocks): FLUX ignores most "no…" instructions. The visual QC step (W3) must check every image and regenerate.
- The Gemini free tier has no image quota, so Cloudflare FLUX is used first.
- Fonts and GSAP load from Google Fonts / jsDelivr at render time. The Docker image should bundle them for offline reliability.
- `/media/<token>` (expiring public links for Instagram) and Lark Drive upload come in phase 3.
