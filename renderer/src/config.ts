// Central configuration: paths, environment (from the repo's .env), and tool locations.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RENDERER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_DIR = path.resolve(RENDERER_DIR, '..');
export const TEMPLATES_DIR = path.join(REPO_DIR, 'templates');
export const BRAND_DIR = path.join(REPO_DIR, 'brand');

function loadDotEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*([^#]*?)\s*(#.*)?$/);
    if (m && m[2]) out[m[1]] = m[2];
  }
  return out;
}

/** Real environment variables win over .env (so Docker/env injection works on the server). */
export const env: Record<string, string | undefined> = { ...loadDotEnv(path.join(REPO_DIR, '.env')), ...process.env };

export const config = {
  port: Number(env.RENDERER_PORT ?? 8787),
  /** 127.0.0.1 on the server, so only Caddy (HTTPS) can reach it. */
  host: env.RENDERER_HOST || '0.0.0.0',
  apiKey: env.RENDERER_API_KEY ?? '',
  outputDir: path.resolve(env.RENDERER_OUTPUT_DIR ?? path.join(RENDERER_DIR, 'out', 'jobs')),
  imageProviders: (env.IMAGE_PROVIDERS ?? 'cloudflare,gemini').split(',').map((s) => s.trim()).filter(Boolean),
  cloudflare: {
    accountId: env.CLOUDFLARE_ACCOUNT_ID ?? '',
    token: env.CLOUDFLARE_API_TOKEN ?? '',
    model: env.CLOUDFLARE_IMAGE_MODEL || '@cf/black-forest-labs/flux-1-schnell',
  },
  gemini: { key: env.GEMINI_API_KEY ?? '', model: env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image' },
  tts: {
    voice: env.TTS_VOICE || 'en-GB-SoniaNeural',
    rate: env.TTS_RATE || '+10%',
  },
};

/** Find a binary: explicit env path → winget install (Windows) → PATH. */
function findBinary(name: 'ffmpeg' | 'ffprobe'): string {
  const explicit = env[`${name.toUpperCase()}_PATH`];
  if (explicit) return explicit;
  if (process.platform === 'win32' && env.LOCALAPPDATA) {
    const wg = path.join(env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages');
    if (existsSync(wg)) {
      for (const pkg of readdirSync(wg).filter((d) => d.startsWith('Gyan.FFmpeg'))) {
        for (const sub of readdirSync(path.join(wg, pkg))) {
          const candidate = path.join(wg, pkg, sub, 'bin', `${name}.exe`);
          if (existsSync(candidate)) return candidate;
        }
      }
    }
  }
  return name;
}

export const bin = {
  ffmpeg: findBinary('ffmpeg'),
  ffprobe: findBinary('ffprobe'),
  /** Edge TTS: official Python CLI. Windows uses the `py` launcher; Linux/Docker uses `edge-tts`. */
  edgeTts: process.platform === 'win32' ? { cmd: 'py', pre: ['-m', 'edge_tts'] } : { cmd: 'edge-tts', pre: [] as string[] },
  hyperframes: path.join(RENDERER_DIR, 'node_modules', 'hyperframes', 'bin', 'hyperframes.mjs'),
};

export const logos = {
  white: path.join(BRAND_DIR, '01_Logos', 'PNG', 'Linkbot_Logo_White_on_Transparent.png'),
  blue: path.join(BRAND_DIR, '01_Logos', 'PNG', 'Linkbot_Logo_Blue_on_Transparent.png'),
};
