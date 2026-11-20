// FFmpeg / FFprobe / Edge TTS helpers.
import { spawn } from 'node:child_process';
import { bin, config } from '../config.js';

export function run(cmd: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env ?? process.env, windowsHide: true });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${cmd.split(/[\\/]/).pop()} exited ${code}: ${(err || out).slice(-500)}`)),
    );
  });
}

export async function durationOf(file: string): Promise<number> {
  const out = await run(bin.ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return parseFloat(out.trim());
}

/** Synthesise speech to an MP3 with Edge TTS. Returns its duration in seconds. */
export async function speak(text: string, outFile: string, voice = config.tts.voice, rate = config.tts.rate): Promise<number> {
  await run(bin.edgeTts.cmd, [...bin.edgeTts.pre, '--voice', voice, `--rate=${rate}`, '--text', text, '--write-media', outFile]);
  return durationOf(outFile);
}

/** Lay voice clips at given start times over a silent video and mux to AAC. */
export async function muxVoice(video: string, clips: { file: string; start: number }[], total: number, outFile: string) {
  const inputs = clips.flatMap((c) => ['-i', c.file]);
  const delays = clips.map((c, i) => {
    const ms = Math.round(c.start * 1000);
    return `[${i + 1}:a]adelay=${ms}|${ms}[a${i}]`;
  });
  const filter = `${delays.join(';')};${clips.map((_, i) => `[a${i}]`).join('')}amix=inputs=${clips.length}:normalize=0[vo]`;
  await run(bin.ffmpeg, ['-v', 'error', '-y', '-i', video, ...inputs, '-filter_complex', filter,
    '-map', '0:v', '-map', '[vo]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-t', total.toFixed(2), '-movflags', '+faststart', outFile]);
}

export async function extractFrame(video: string, atSec: number, outFile: string) {
  await run(bin.ffmpeg, ['-v', 'error', '-y', '-ss', atSec.toFixed(2), '-i', video, '-frames:v', '1', outFile]);
}
