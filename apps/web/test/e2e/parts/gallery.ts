/**
 * The gallery of the board's parts (`main.tsx`), built and opened: `buildParts` builds it with the board's own Vite config into a
 * folder the caller gives, and `openParts` opens it in a page of a browser, served from that folder with no server. The parts are the
 * compiled ones, and a press is a real one.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Browser, Page } from 'playwright';
import { build } from 'vite';
import { WEB } from '../world.ts';

/** Where the gallery's page is, from the board's root: where the build writes it under its folder too. */
const ENTRY = 'test/e2e/parts/index.html';

/** The address the gallery is opened at: no server answers there, the page's requests are answered from the built folder. */
export const PARTS_URL = 'http://e2e.test/';

const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
};

/** Builds the gallery into `outDir`, emptied first, with the board's own plugins, and says nothing but an error. */
export async function buildParts(outDir: string): Promise<void> {
  await build({
    root: WEB,
    configFile: path.join(WEB, 'vite.config.ts'),
    logLevel: 'error',
    build: { outDir, emptyOutDir: true, rollupOptions: { input: path.join(WEB, ENTRY) } },
  });
  if (!fs.existsSync(path.join(outDir, ENTRY))) throw new Error(`the gallery's build wrote no ${ENTRY} under ${outDir}`);
}

/**
 * A 1280 × 800 page in `theme`, open on the gallery built in `dir` at `search`: a file the folder has is answered as it is, and every
 * other address with the gallery's page, as a server of a one-page app does. Waits for the first part to be drawn.
 */
export async function openParts(browser: Browser, dir: string, theme: 'light' | 'dark', search = ''): Promise<Page> {
  const context = await browser.newContext({ colorScheme: theme, viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.route(`${PARTS_URL}**`, (route) => {
    const asked = path.join(dir, decodeURIComponent(new URL(route.request().url()).pathname));
    const file = asked.startsWith(dir) && fs.existsSync(asked) && fs.statSync(asked).isFile() ? asked : path.join(dir, ENTRY);
    return route.fulfill({ contentType: TYPES[path.extname(file)] ?? 'application/octet-stream', body: fs.readFileSync(file) });
  });
  await page.goto(`${PARTS_URL}${search}`);
  await page.locator('[data-part="pager"] [data-pager]').waitFor();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  return page;
}
