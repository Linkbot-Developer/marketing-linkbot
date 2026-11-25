// Today's content generation, started by n8n (W2 - Daily generation) instead of a server cron.
//   POST /jobs/daily   → 202 { jobId }   (409 if one is already running in this process)
//   GET  /jobs/<id>    → { status, exitCode, startedAt, finishedAt, logTail }
// On the droplet it runs deploy/run-daily.sh with FORCE=1, which holds data/run-daily.lock, so a run started
// by hand (FORCE=1 deploy/run-daily.sh) and one started by n8n can never overlap. Output goes to logs/runner.log.
// On Windows (local development) it runs the runner directly.
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { REPO_DIR } from './config.js';

interface Job { id: string; status: 'running' | 'done' | 'failed'; exitCode: number | null; startedAt: string; finishedAt?: string; log: string[] }
const jobs = new Map<string, Job>();
let current: Job | null = null;

export function startDaily(): { started: boolean; job: Job } {
  if (current?.status === 'running') return { started: false, job: current };
  const job: Job = { id: randomUUID(), status: 'running', exitCode: null, startedAt: new Date().toISOString(), log: [] };
  jobs.set(job.id, job);
  current = job;

  const logDir = path.join(REPO_DIR, 'logs');
  mkdirSync(logDir, { recursive: true });
  const file = createWriteStream(path.join(logDir, 'runner.log'), { flags: 'a' });
  file.write(`=== ${job.startedAt} started by n8n (job ${job.id})\n`);

  const child = process.platform === 'win32'
    ? spawn(process.execPath, [path.join(REPO_DIR, 'runner', 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'src/cli.ts', '--daily'], { cwd: path.join(REPO_DIR, 'runner'), env: process.env })
    : spawn('bash', [path.join(REPO_DIR, 'deploy', 'run-daily.sh')], { cwd: REPO_DIR, env: { ...process.env, FORCE: '1' } });
  const capture = (chunk: Buffer) => {
    file.write(chunk);
    job.log.push(...chunk.toString('utf8').split(/\r?\n/).filter(Boolean));
    if (job.log.length > 200) job.log.splice(0, job.log.length - 200);
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.on('error', (e) => capture(Buffer.from(`could not start: ${e.message}\n`)));
  child.on('close', (code) => {
    job.exitCode = code;
    job.status = code === 0 ? 'done' : 'failed';
    job.finishedAt = new Date().toISOString();
    file.end(`=== ${job.finishedAt} exit ${code}\n`);
  });
  for (const id of [...jobs.keys()].slice(0, Math.max(0, jobs.size - 20))) jobs.delete(id);
  return { started: true, job };
}

export function jobView(id: string) {
  const j = jobs.get(id);
  if (!j) return null;
  return { id: j.id, status: j.status, exitCode: j.exitCode, startedAt: j.startedAt, finishedAt: j.finishedAt, logTail: j.log.slice(-40) };
}
