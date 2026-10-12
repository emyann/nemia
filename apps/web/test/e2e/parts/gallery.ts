/**
 * The page of the look's stories (`main.tsx`), built and opened: `buildParts` builds it with the board's own Vite config into a
 * folder the caller gives, and `openParts` opens it in a page of a browser, served from that folder with no server. The parts are the
 * compiled ones, and a press is a real one.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Browser, Page } from 'playwright';
import { build } from 'vite';
import { WEB } from '../world.ts';

/** Where the stories' page is, from the board's root: where the build writes it under its folder too. */
const ENTRY = 'test/e2e/parts/index.html';

/** The address the stories' page is opened at: no server answers there, the page's requests are answered from the built folder. */
export const PARTS_URL = 'http://e2e.test/';

const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
};

/** Builds the stories' page into `outDir`, emptied first, with the board's own plugins, and says nothing but an error. */
export async function buildParts(outDir: string): Promise<void> {
  await build({
    root: WEB,
    configFile: path.join(WEB, 'vite.config.ts'),
    logLevel: 'error',
    build: { outDir, emptyOutDir: true, rollupOptions: { input: path.join(WEB, ENTRY) } },
  });
  if (!fs.existsSync(path.join(outDir, ENTRY))) throw new Error(`the stories' page's build wrote no ${ENTRY} under ${outDir}`);
}

/** The one section of the stories' page that draws the story `id`, Storybook's id for it. */
export const story = (id: string): string => `[data-story="${id}"]`;

/** Whether a page built in `dir` is asked for at `url`'s path, and by which file: one the folder has, else the stories' page. */
export function fileAt(dir: string, url: string): string {
  const asked = path.join(dir, decodeURIComponent(new URL(url).pathname));
  return asked.startsWith(dir) && fs.existsSync(asked) && fs.statSync(asked).isFile() ? asked : path.join(dir, ENTRY);
}

/** The content type of `file`, by its extension. */
export const typeOf = (file: string): string => TYPES[path.extname(file)] ?? 'application/octet-stream';

/**
 * A 1280 × 800 page in `theme`, open on the stories' page built in `dir` at `search`: the bare address for the index and every
 * story, `?part=<name>` for one part's, `?story=<id>` for one. A file the folder has is answered as it is, and every other address
 * with the stories' page, as a server of a one-page app does. Waits until every story asked for is drawn, or says it broke, and for
 * the fonts.
 *
 * @param look `scale`, how many pixels of a picture draw one of the page, for a picture enlarged with the pointer's state kept; and
 *   `still`, whether the page is told nothing may move, so that a colour is read with no transition to wait out
 */
export async function openParts(
  browser: Browser,
  dir: string,
  theme: 'light' | 'dark',
  search = '',
  look: { scale?: number; still?: boolean } = {},
): Promise<Page> {
  const context = await browser.newContext({
    colorScheme: theme,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: look.scale ?? 1,
    reducedMotion: look.still ? 'reduce' : 'no-preference',
  });
  const page = await context.newPage();
  await page.route(`${PARTS_URL}**`, (route) => {
    const file = fileAt(dir, route.request().url());
    return route.fulfill({ contentType: typeOf(file), body: fs.readFileSync(file) });
  });
  await page.goto(`${PARTS_URL}${search}`);
  await page.locator('[data-stories-page]').waitFor();
  await page.waitForFunction(() => {
    const sections = [...document.querySelectorAll('[data-story]')];
    return sections.length > 0 && sections.every((section) => section.querySelector('[data-story-ground], [data-broken]'));
  });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  return page;
}
