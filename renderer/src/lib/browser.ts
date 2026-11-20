// One shared headless Chromium for all PNG renders.
import { chromium, type Browser } from 'playwright';

let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  browserPromise ??= chromium.launch({ args: ['--font-render-hinting=none'] });
  return browserPromise;
}

/** Render full-page HTML to a PNG of exactly width × height. */
export async function htmlToPng(html: string, width: number, height: number, outFile: string): Promise<void> {
  const browser = await getBrowser();
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  try {
    await page.setContent(html, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: outFile, clip: { x: 0, y: 0, width, height } });
  } finally {
    await page.close();
  }
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) await (await browserPromise).close();
  browserPromise = null;
}
