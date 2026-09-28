/**
 * How `npm run e2e` looks at its pages, and how it ends: every page in both themes, then an exit code
 * that says whether each passed. Apart from run.ts, which builds and serves the app, so that a page
 * breaking the rules can be put through the very same code (broken-page.ts) and seen to fail it — not
 * only the app's pages seen to pass.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { expectTheme, idle, Refused, settled, track, watch } from './checks.ts';

export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

/**
 * A page the e2e visits: its name, for the screenshots and the failure; where it is; and what it must have. `follows` for a page that follows a
 * live session over server-sent events: its stream never finishes, so the network never idles, and the page is visited once it has loaded and
 * photographed once its canvases have settled, without waiting on the network. Every other page is visited once it has loaded and its network
 * is idle (`idle`: the feed's stream, which the board may hold open, left out), and photographed once it is idle again.
 */
export type PageSpec = { name: string; route: string; expect: (page: Page) => Promise<void>; follows?: true };

const where = (spec: PageSpec, theme: Theme) => `the ${spec.name} page (${spec.route}) in the ${theme} theme`;

/**
 * What the e2e says once its store is gone. It sits in the temporary directory, which the machine may sweep while the pages are visited:
 * on 2026-09-24 a slow WSL boot ran checks while `systemd-tmpfiles --remove --boot` was still emptying /tmp, twelve minutes long, and it
 * reached the store halfway through the dark theme. Every run then read 404, the board said each was removed with `wf rm`, and the page
 * being visited failed on an answer box it never drew, blamed on the branch under check.
 */
export const storeGone = (store: string): string =>
  `the e2e's store ${store} is gone, removed from outside while the pages were visited: every run reads 404 since, so no page failed. Run the e2e again` +
  '\n  what removes it: a sweep of the temporary directory — `systemd-tmpfiles --remove --boot` empties /tmp, and a slow WSL boot runs it beside the checks';

class PageFailure extends Error {
  constructor(where: string, cause: unknown, screenshot: string, lost?: string) {
    const why =
      cause instanceof Refused ? cause.message : `could not be checked: ${cause instanceof Error ? cause.message : String(cause)}`;
    // With the store gone, that is the failure, and what the page could not find follows from it.
    super(
      lost
        ? `${where}: ${lost}\n  what the page then failed on: ${why}\n  what it looked like: ${screenshot}`
        : `${where}: ${why}\n  what it looked like: ${screenshot}`,
    );
  }
}

async function visit(context: BrowserContext, base: string, spec: PageSpec, theme: Theme, out: string, store?: string): Promise<string> {
  const page = await context.newPage();
  const { problems } = watch(page);
  const shot = path.join(out, `${spec.name}-${theme}.png`);
  try {
    await page.goto(base + spec.route, { waitUntil: 'load' });
    if (!spec.follows) await idle(page);
    await expectTheme(page, theme);
    await spec.expect(page);
    // What a person would see, once whatever the last assertion started has settled.
    if (!spec.follows) await idle(page);
    await settled(page);
    await page.screenshot({ path: shot, fullPage: true });
    const seen = problems();
    if (seen.length) throw new Refused(`no console error and no failed request — ${seen.length} seen:\n    ${seen.join('\n    ')}`);
    return shot;
  } catch (err) {
    fs.rmSync(shot, { force: true });
    const failed = path.join(out, `${spec.name}-${theme}-failed.png`);
    await page.screenshot({ path: failed, fullPage: true }).catch(() => {});
    throw new PageFailure(where(spec, theme), err, failed, store !== undefined && !fs.existsSync(store) ? storeGone(store) : undefined);
  } finally {
    await page.close();
  }
}

/**
 * Every page, in the light theme and then the dark, each in a 1280 × 800 browser; a screenshot of each
 * into `out`. Rejects on the first page that fails, naming the page, the theme and the assertion — or, once the `store` the api serves
 * is gone, saying so in place of the assertion (`storeGone`), and visiting no page after it.
 */
export async function visitAll(browser: Browser, base: string, pages: readonly PageSpec[], out: string, store?: string): Promise<string[]> {
  fs.mkdirSync(out, { recursive: true });
  for (const spec of pages) {
    for (const theme of THEMES) {
      for (const name of [`${spec.name}-${theme}.png`, `${spec.name}-${theme}-failed.png`])
        fs.rmSync(path.join(out, name), { force: true });
    }
  }
  const shots: string[] = [];
  for (const theme of THEMES) {
    const context = await browser.newContext({ colorScheme: theme, viewport: { width: 1280, height: 800 } });
    // Every page opened in it, a page's second page too, has its requests counted from its first, for `idle`.
    context.on('page', track);
    try {
      for (const spec of pages) {
        if (store !== undefined && !fs.existsSync(store)) throw new Error(`before ${where(spec, theme)}: ${storeGone(store)}`);
        shots.push(await visit(context, base, spec, theme, out, store));
        console.log(`e2e: ${where(spec, theme)} ✓`);
      }
    } finally {
      await context.close();
    }
  }
  return shots;
}

export async function launch(): Promise<Browser> {
  try {
    return await chromium.launch();
  } catch (err) {
    throw new Error(
      `Chromium did not start: ${(err as Error).message.split('\n')[0]}\n  If it is not installed, run \`npx playwright install chromium\` once on this machine; every worktree shares ~/.cache/ms-playwright.`,
      { cause: err },
    );
  }
}

/** The longest a line of the headline runs: a locator, or the element Playwright says is in the way, can run to hundreds of characters. */
const HEADLINE_WIDTH = 300;

/** What Playwright's call log says of itself while it tries again: none of it says why it tries again. */
const RETRYING =
  /^(?:\d+ × )?(?:retrying \w+ action|waiting \d+ms|waiting for element to be |element is visible, enabled and stable$|scrolling into view|done scrolling|attempting \w+ action)/;

/**
 * A failure in a few lines: its first; for an error Playwright threw, the element it waited for and the last thing its call log says
 * that is not it trying again — what was in the way; and the picture. The whole of it runs to dozens of lines of call log, and each
 * server's last lines follow it.
 */
export function headlineOf(message: string): string[] {
  // Playwright dims its call log in colour, whether or not a terminal reads it.
  // oxlint-disable-next-line no-control-regex -- a terminal colour code starts with ESC, which is what this strips
  const lines = message.replace(/\x1b\[[0-9;]*m/g, '').split('\n');
  const clip = (line: string) => (line.length > HEADLINE_WIDTH ? `${line.slice(0, HEADLINE_WIDTH - 1)}…` : line);
  const said = [lines[0]!];
  const from = lines.findIndex((line) => line.trim() === 'Call log:');
  if (from >= 0) {
    const log = lines
      .slice(from + 1)
      .map((line) => line.trim().replace(/^- /, ''))
      .filter((line) => line && !line.startsWith('what it looked like:'));
    const waited = log.find((line) => /^waiting for (?!element )/.test(line));
    const last = [...log].reverse().find((line) => line !== waited && !RETRYING.test(line));
    for (const line of [waited, last]) if (line) said.push(line);
  }
  const picture = lines.find((line) => line.trim().startsWith('what it looked like:'));
  if (picture) said.push(picture.trim());
  return said.map(clip);
}

/**
 * The process ends with `main`: exit 0 once it resolves; exit 1 once it rejects, saying what failed and
 * then whatever `explain` adds — and then, last, what failed again in a few lines (`headlineOf`), on stderr and on stdout both. A check
 * shows the tail of what it printed and logs its stdout alone: said once, first, on stderr, the reason was under thirty lines of the
 * servers' output and in no log, and the check read as an exit 1 with nothing printed.
 */
export function exitOn(main: Promise<void>, cleanUp: () => void, explain: () => string = () => ''): void {
  main.then(
    () => {
      cleanUp();
      process.exit(0);
    },
    (err: unknown) => {
      const why = err instanceof Error ? err.message : String(err);
      console.error(`\ne2e: FAILED — ${why}${explain()}`);
      const headline = `\ne2e: FAILED — ${headlineOf(why).join('\n  ')}`;
      console.error(headline);
      console.log(headline);
      cleanUp();
      process.exit(1);
    },
  );
}
