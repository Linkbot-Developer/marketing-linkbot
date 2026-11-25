// Linkbot renderer: HTTP API called by n8n.
//   GET  /health                       → { ok, version }                (no auth)
//   POST /render/image|carousel|story|reel  (JSON body, Bearer auth)  → { jobId, files[], meta }
//   GET  /files/<jobId>/<name>         → the rendered file              (Bearer auth)
//   POST /jobs/daily · GET /jobs/<id>  → start / check today's generation (n8n W2; Bearer auth)
// Renders run one at a time (a queue), because video rendering is CPU-heavy.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import type { ZodType } from 'zod';
import { config } from './config.js';
import { closeBrowser } from './lib/browser.js';
import { CarouselRequest, ImageRequest, ReelRequest, StoryRequest } from './schemas.js';
import { renderCarousel } from './render/carousel.js';
import { renderImage } from './render/image.js';
import { renderReel } from './render/reel.js';
import { renderStory } from './render/story.js';
import { jobView, startDaily } from './jobs.js';

const VERSION = '0.1.0';
const MAX_BODY = 30 * 1024 * 1024; // allows a few base64 images

const routes: Record<string, { schema: ZodType<any>; handler: (req: any) => Promise<unknown> }> = {
  '/render/image': { schema: ImageRequest, handler: renderImage },
  '/render/carousel': { schema: CarouselRequest, handler: renderCarousel },
  '/render/story': { schema: StoryRequest, handler: renderStory },
  '/render/reel': { schema: ReelRequest, handler: renderReel },
};

let queue: Promise<unknown> = Promise.resolve();
const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
  const next = queue.then(task, task);
  queue = next.catch(() => undefined);
  return next;
};

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function authorised(req: IncomingMessage): boolean {
  if (!config.apiKey) return true; // local development without a key
  const given = Buffer.from((req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''));
  const expected = Buffer.from(config.apiKey);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error('Request body too large'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw Object.assign(new Error('Body must be valid JSON'), { status: 400 });
  }
}

function serveFile(res: ServerResponse, jobId: string, name: string) {
  // Only plain names: no path traversal outside the output folder.
  if (!/^[\w-]+$/.test(jobId) || !/^[\w.-]+$/.test(name) || name.includes('..')) return send(res, 400, { error: 'Bad file path' });
  const file = path.join(config.outputDir, jobId, name);
  if (!file.startsWith(config.outputDir) || !existsSync(file)) return send(res, 404, { error: 'Not found' });
  const ext = path.extname(name);
  const type = ext === '.mp4' ? 'video/mp4' : ext === '.png' ? 'image/png' : ext === '.jpg' ? 'image/jpeg' : 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': statSync(file).size });
  createReadStream(file).pipe(res);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const started = Date.now();
  try {
    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true, version: VERSION });
    if (!authorised(req)) return send(res, 401, { error: 'Unauthorised' });

    // Today's content generation, started by n8n (W2). It runs in the background; the reply comes at once.
    if (req.method === 'POST' && url.pathname === '/jobs/daily') {
      const { started, job } = startDaily();
      console.log(`/jobs/daily ${started ? 'started' : 'already running'} ${job.id}`);
      return send(res, started ? 202 : 409, { jobId: job.id, status: job.status, startedAt: job.startedAt });
    }
    const jobMatch = url.pathname.match(/^\/jobs\/([\w-]+)$/);
    if (req.method === 'GET' && jobMatch) {
      const view = jobView(jobMatch[1]);
      return view ? send(res, 200, view) : send(res, 404, { error: 'Unknown job' });
    }

    const fileMatch = url.pathname.match(/^\/files\/([^/]+)\/([^/]+)$/);
    if (req.method === 'GET' && fileMatch) return serveFile(res, fileMatch[1], fileMatch[2]);

    const route = routes[url.pathname];
    if (req.method !== 'POST' || !route) return send(res, 404, { error: 'Not found' });

    const parsed = route.schema.safeParse(await readJson(req));
    if (!parsed.success) {
      return send(res, 422, { error: 'Invalid request', issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    }
    const result = await enqueue(() => route.handler(parsed.data));
    console.log(`${url.pathname} ${(parsed.data as { postId: string }).postId} ok ${((Date.now() - started) / 1000).toFixed(1)}s`);
    return send(res, 200, result);
  } catch (e) {
    const err = e as Error & { status?: number };
    console.error(`${url.pathname} failed: ${err.message}`);
    return send(res, err.status ?? 500, { error: err.message });
  }
});

// On the server the API must never be open: refuse to start without a key (the deploy checks this too).
if (process.env.NODE_ENV === 'production' && !config.apiKey) {
  console.error('RENDERER_API_KEY is empty. Set it in .env before starting in production.');
  process.exit(1);
}

server.listen(config.port, config.host, () => console.log(`Linkbot renderer ${VERSION} listening on ${config.host}:${config.port}`));

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    server.close();
    await closeBrowser();
    process.exit(0);
  });
}
