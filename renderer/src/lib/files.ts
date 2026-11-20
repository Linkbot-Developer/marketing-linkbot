// Job folders and file metadata returned to n8n.
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { config } from '../config.js';

export interface OutputFile {
  name: string;
  /** Download path on this service: GET /files/<jobId>/<name> */
  url: string;
  mime: string;
  bytes: number;
  width?: number;
  height?: number;
  durationSec?: number;
}

export interface Job {
  id: string;
  dir: string;
  file: (name: string) => string;
  describe: (name: string, extra?: Partial<OutputFile>) => OutputFile;
}

const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg' };

/** postId is used in the folder name for traceability; a random suffix keeps attempts apart. */
export function newJob(postId: string): Job {
  const safe = postId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40) || 'post';
  const id = `${safe}_${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
  const dir = path.join(config.outputDir, id);
  mkdirSync(dir, { recursive: true });
  return {
    id,
    dir,
    file: (name) => path.join(dir, name),
    describe: (name, extra = {}) => ({
      name,
      url: `/files/${id}/${name}`,
      mime: MIME[path.extname(name)] ?? 'application/octet-stream',
      bytes: statSync(path.join(dir, name)).size,
      ...extra,
    }),
  };
}

export function dataUri(file: string, mime = 'image/png'): string {
  return `data:${mime};base64,${readFileSync(file).toString('base64')}`;
}
