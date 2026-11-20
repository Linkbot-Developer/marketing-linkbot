// Tiny, safe template filling for the HTML templates in /templates.
//   {{name}}   → HTML-escaped value (default; use for anything that came from an AI or a person)
//   {{{name}}} → raw value (only for markup we generate ourselves)
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { TEMPLATES_DIR } from '../config.js';

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Escape, then turn line breaks into <br> so copywriters can use "\n" in headlines. */
export function textToHtml(value: unknown): string {
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

export function fill(template: string, vars: Record<string, unknown>): string {
  return template
    .replace(/\{\{\{\s*(\w+)\s*\}\}\}/g, (_, k: string) => (k in vars ? String(vars[k] ?? '') : missing(k)))
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => (k in vars ? escapeHtml(vars[k]) : missing(k)));
}

function missing(key: string): never {
  throw new Error(`Template variable "${key}" was not provided`);
}

const cache = new Map<string, string>();
export function loadTemplate(relPath: string): string {
  // Cache only in production, so template edits show up immediately while developing.
  if (!cache.has(relPath) || process.env.NODE_ENV !== 'production') {
    cache.set(relPath, readFileSync(path.join(TEMPLATES_DIR, relPath), 'utf8'));
  }
  return cache.get(relPath)!;
}

/** Brand theme CSS shared by every template. */
export const themeCss = () => loadTemplate('brand/theme.css');
