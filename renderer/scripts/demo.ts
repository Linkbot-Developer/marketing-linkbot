// Sends real posts from content/2026-W49/test-batch.md through the HTTP API (as n8n will)
// and downloads the results to out/demo/. Start the server first: npm start
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { config, RENDERER_DIR } from '../src/config.js';

const BASE = process.env.RENDERER_URL ?? `http://localhost:${config.port}`;
const headers = { 'Content-Type': 'application/json', ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}) };
const outDir = path.join(RENDERER_DIR, 'out', 'demo');
mkdirSync(outDir, { recursive: true });

const only = process.argv.slice(2); // e.g. npm run demo -- reel image
const all: Record<string, { endpoint: string; body: unknown }> = {
  'W49-IG-01 carousel': {
    endpoint: '/render/carousel',
    body: {
      postId: 'W49-IG-01',
      slides: [
        { kind: 'title', heading: '5 signs your business is ready for automation', body: 'Nodding at 2 or more? Keep swiping.' },
        { kind: 'point', number: 1, heading: 'You copy the same data into 2+ apps.', body: 'Every copy is time lost, and a chance for a typo.' },
        { kind: 'point', number: 2, heading: 'Follow-ups depend on someone remembering.', body: 'If they forget, the customer waits.' },
        { kind: 'point', number: 3, heading: 'Reports take hours to put together.', body: 'Your numbers already exist; they just need collecting.' },
        { kind: 'point', number: 4, heading: 'Customers ask the same questions every day.', body: 'The answers rarely change. The typing does.' },
        { kind: 'point', number: 5, heading: "Information lives in people's heads.", body: 'When they are away, work stops.' },
        { kind: 'cta', heading: 'Nodding at 2 or more?', body: "Let's map what to automate first.", button: 'Book a free consultation' },
      ],
    },
  },
  'W49-IG-03 image': {
    endpoint: '/render/image',
    body: {
      postId: 'W49-IG-03',
      headline: 'Friday 5pm.\nReport still not done.',
      image: { prompt: 'Photorealistic, candid photo of a tired office worker in a modern Singapore office on a Friday evening, at a desk covered in printed reports and sticky notes, laptop open, office emptying out behind them, warm golden end-of-day light, natural colours with subtle navy and blue accents, subject in the upper two-thirds, lower third calm.' },
    },
  },
  'W49-FB-02 solid card': {
    endpoint: '/render/image',
    body: { postId: 'W49-FB-02', tag: 'Free consultation', headline: "Find out what's worth automating first.", sub: 'One conversation. No jargon, no obligation.' },
  },
  'W49-IG-02 story': {
    endpoint: '/render/story',
    body: {
      postId: 'W49-IG-02-ST', tag: 'Example workflow', headline: 'Fewer no-shows.\nLess chasing.', sub: 'Automatic WhatsApp reminders, the day before.', button: 'Link in bio',
      image: { prompt: 'Photorealistic close-up of a smartphone lying face up on a wooden desk next to a coffee cup, screen softly glowing but blank, a hand reaching towards it, warm natural light, navy and blue accents.' },
    },
  },
  'W49-IG-02 reel': {
    endpoint: '/render/reel',
    body: {
      postId: 'W49-IG-02',
      maxSeconds: 22,
      scenes: [
        { type: 'photo', text: 'You blocked out\nthe hour.', vo: 'You blocked out the hour.', motion: 'push-in',
          image: { prompt: 'Photorealistic photo of an empty modern consultation room in Singapore: a neat desk with an untouched glass of water and a notepad, an empty client chair, soft late-morning daylight, calm muted colours with navy and blue accents, shallow depth of field.' } },
        { type: 'statement', text: "They didn't\nshow up.", vo: "They didn't show up." },
        { type: 'photo', text: 'Often, they\njust forgot.', vo: 'Often, they just forgot.', motion: 'drift',
          image: { prompt: 'Photorealistic close-up of a smartphone face up on a wooden desk next to a coffee cup, screen blank, a hand reaching for it, warm natural light, navy and blue accents.' } },
        { type: 'steps', label: 'Example workflow', title: 'How it works', vo: 'Example workflow: booking in, WhatsApp reminder the day before, one tap to confirm, calendar updated.',
          steps: ['📅 Booking comes in', '💬 WhatsApp reminder, day before', '✅ Customer taps “Confirm”', '🗓️ Calendar updates itself'],
          notification: { from: 'Your business', text: 'Reminder: your appointment is tomorrow at 3pm. Reply 1 to confirm ✅' } },
        { type: 'cta', text: 'Fewer missed appointments.\nLess chasing.', vo: 'Fewer missed appointments. Less chasing. Link in bio.',
          button: 'Discover how automation can improve your business', footer: 'Link in bio · linkbot.sg' },
      ],
    },
  },
};

const requests = Object.fromEntries(Object.entries(all).filter(([label]) => !only.length || only.some((o) => label.includes(o))));

const health = await fetch(`${BASE}/health`).then((r) => r.json()).catch(() => null);
if (!health?.ok) throw new Error(`Renderer not reachable at ${BASE}. Start it with: npm start`);

for (const [label, { endpoint, body }] of Object.entries(requests)) {
  const t = Date.now();
  const res = await fetch(`${BASE}${endpoint}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const json = (await res.json()) as any;
  if (!res.ok) { console.log(`❌ ${label}: ${res.status} ${json.error}`); continue; }
  for (const f of json.files) {
    const buf = Buffer.from(await (await fetch(`${BASE}${f.url}`, { headers })).arrayBuffer());
    writeFileSync(path.join(outDir, `${(body as any).postId}_${f.name}`), buf);
  }
  console.log(`✅ ${label}: ${json.files.length} file(s) in ${((Date.now() - t) / 1000).toFixed(1)}s ${JSON.stringify(json.meta)}`);
}
