/**
 * Storybook's static build of the board, made and opened: `buildStorybook` builds it into a folder the caller gives, `serveBuilt`
 * answers it on loopback (MSW's worker needs a secure origin, which loopback is), and `openStory` opens one story's `iframe.html` in a
 * page of a browser. `shoot.ts` pictures the stories through them, and the look's browser tests read a story's pixels through them
 * (`storybookFor`): `npm run e2e -- --look` builds it once before them and names the folder in `LOOK_STORYBOOK` (`look.ts`), and a
 * test run alone builds its own.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { Browser } from 'playwright';

/** The variable that names a static build of Storybook made before the look's tests, which each reads instead of building one. */
export const LOOK_STORYBOOK = 'LOOK_STORYBOOK';

/** The longest a Storybook build may take. */
const BUILD_MS = 10 * 60_000;

/** The workspace root, from this file. */
const ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '..', '..');

/** The board's folder. */
const WEB = path.join(ROOT, 'apps', 'web');

/**
 * Builds the Storybook of the board at `web` into `out`; resolves with why where it would not build, else with nothing.
 * @param root The workspace root, whose `node_modules` holds Storybook.
 * @param web The board's folder to build, this checkout's or another tree's.
 * @param out The folder the build is written into.
 */
export async function buildStorybook(root: string, web: string, out: string) {
  const bin = path.join(root, 'node_modules', 'storybook', 'dist', 'bin', 'dispatcher.js');
  const child = spawn(process.execPath, [bin, 'build', '-o', out, '--quiet', '--disable-telemetry'], {
    cwd: web,
    stdio: ['ignore', 'ignore', 'pipe'],
    timeout: BUILD_MS,
  });
  let said = '';
  child.stderr.on('data', (chunk: Buffer) => (said += chunk));
  const code = await new Promise<number | null>((resolve) => child.on('exit', resolve));
  return (
    code === 0 ? undefined : `Storybook did not build at ${web} (exit ${code}): ${said.trim().split('\n').slice(-5).join(' / ')}`
  ) satisfies string | undefined;
}

/**
 * The static build the look's tests read: the one `LOOK_STORYBOOK` names where it holds a story's frame, else this checkout's built
 * into `scratch`. Throws with why where it would not build.
 * @param scratch An empty folder of the caller's, where a build is written when none was made before.
 */
export async function storybookFor(scratch: string) {
  const named = process.env[LOOK_STORYBOOK];
  if (named && fs.existsSync(path.join(named, 'iframe.html'))) return named;
  const out = path.join(scratch, 'static');
  const why = await buildStorybook(ROOT, WEB, out);
  if (why) throw new Error(why);
  return out;
}

const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

/**
 * Answers the static build in `dir` on loopback: a file the folder has as it is, every other address with its index.
 * @param dir The folder of a static build.
 */
export async function serveBuilt(dir: string) {
  const server = http.createServer((request, response) => {
    const asked = path.join(dir, decodeURIComponent(new URL(`http://stories${request.url ?? '/'}`).pathname));
    const file = asked.startsWith(dir) && fs.existsSync(asked) && fs.statSync(asked).isFile() ? asked : path.join(dir, 'index.html');
    response.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' }).end(fs.readFileSync(file));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  return {
    at: `http://127.0.0.1:${port}`,
    close: () => {
      server.close();
      server.closeAllConnections();
    },
  } satisfies { at: string; close: () => void };
}

/**
 * The story ids the static build in `dir` holds, in its index's order.
 * @param dir The folder of a static build.
 */
export const builtIds = (dir: string) => {
  const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')) as { entries: Record<string, { type: string }> };
  return Object.entries(index.entries).flatMap(([id, entry]) => (entry.type === 'story' ? [id] : [])) satisfies string[];
};

/** What a story is drawn in by `openStory`: pixels of a picture to one of the page, and whether nothing may move. */
export type Look = { scale?: number; still?: boolean };

/**
 * A 1280 × 800 page in `theme`, open on the story `id` of the static build served at `at`, alone in Storybook's frame (`iframe.html`):
 * waits until it is drawn, Storybook has finished it (its play function run, which moves the focus: `data-story-finished`, set by
 * `.storybook/preview.tsx`) and its fonts are in, and throws where it threw or another story is drawn beside it.
 * @param browser The browser the page is opened in.
 * @param at Where the static build is served (`serveBuilt`).
 * @param theme The colour scheme the page asks for.
 * @param id Storybook's id of the story.
 * @param look `scale`, how many pixels of a picture draw one of the page, for a picture enlarged with the pointer's state kept; and
 *   `still`, whether the page is told nothing may move, so that a colour is read with no transition to wait out
 */
export async function openStory(browser: Browser, at: string, theme: 'light' | 'dark', id: string, look: Look = {}) {
  const context = await browser.newContext({
    colorScheme: theme,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: look.scale ?? 1,
    reducedMotion: look.still ? 'reduce' : 'no-preference',
  });
  const page = await context.newPage();
  await page.goto(`${at}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`);
  await page.locator('#storybook-root [data-story-ground], #storybook-root [data-broken]').first().waitFor();
  await page.locator(`body[data-story-finished="${id}"]`).waitFor({ state: 'attached' });
  const broken = await page.locator('#storybook-root [data-broken]').allTextContents();
  if (broken.length) throw new Error(`the story ${id} threw as it was drawn: ${broken.join(' / ')}`);
  const grounds = await page.locator('[data-story-ground]').count();
  if (grounds !== 1) throw new Error(`the story ${id} is drawn with ${grounds} grounds, where it is drawn alone in one`);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  return page;
}
