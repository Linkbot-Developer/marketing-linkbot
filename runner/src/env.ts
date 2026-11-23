// Paths and configuration (from the repo's .env; real environment variables win).
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RUNNER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_DIR = path.resolve(RUNNER_DIR, '..');

function loadDotEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*([^#]*?)\s*(#.*)?$/);
    if (m && m[2]) out[m[1]] = m[2];
  }
  return out;
}

export const env: Record<string, string | undefined> = { ...loadDotEnv(path.join(REPO_DIR, '.env')), ...process.env };

export function required(name: string): string {
  const v = env[name];
  if (!v) throw new Error(`Missing ${name} in .env`);
  return v;
}

export const repoFile = (rel: string) => readFileSync(path.join(REPO_DIR, rel), 'utf8');
