/**
 * How `npm run e2e` looks at its pages, and how it ends: every page in both themes, then an exit code
 * that says whether each passed. Apart from run.ts, which builds and serves the app, so that a page
 * breaking the rules can be put through the very same code (broken-page.ts) and seen to fail it — not
 * only the app's pages seen to pass.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { expectTheme, Refused, settled, watch } from './checks.ts';

export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

/**
 * A page the e2e visits: its name, for the screenshots and the failure; where it is; and what it must have. `follows` for a page that follows a
 * live session over server-sent events: its stream never finishes, so the network never idles, and the page is visited once it has loaded and
 * photographed once its canvases have settled, without waiting on the network.
 */
export type PageSpec = { name: string; route: string; expect: (page: Page) => Promise<void>; follows?: true };

const where = (spec: PageSpec, theme: Theme) => `the ${spec.name} page (${spec.route}) in the ${theme} theme`;

class PageFailure extends Error {
  constructor(where: string, cause: unknown, screenshot: string) {
    const why = cause instanceof Refused ? cause.message : `could not be checked: ${cause instanceof Error ? cause.message : String(cause)}`;
    super(`${where}: ${why}\n  what it looked like: ${screenshot}`);
  }
}

async function visit(context: BrowserContext, base: string, spec: PageSpec, theme: Theme, out: string): Promise<string> {
  const page = await context.newPage();
  const { problems } = watch(page);
  const shot = path.join(out, `${spec.name}-${theme}.png`);
  try {
    await page.goto(base + spec.route, { waitUntil: spec.follows ? 'load' : 'networkidle' });
    await expectTheme(page, theme);
    await spec.expect(page);
    // What a person would see, once whatever the last assertion started has settled.
    if (!spec.follows) await page.waitForLoadState('networkidle');
    await settled(page);
    await page.screenshot({ path: shot, fullPage: true });
    const seen = problems();
    if (seen.length) throw new Refused(`no console error and no failed request — ${seen.length} seen:\n    ${seen.join('\n    ')}`);
    return shot;
  } catch (err) {
    fs.rmSync(shot, { force: true });
    const failed = path.join(out, `${spec.name}-${theme}-failed.png`);
    await page.screenshot({ path: failed, fullPage: true }).catch(() => {});
    throw new PageFailure(where(spec, theme), err, failed);
  } finally {
    await page.close();
  }
}

/**
 * Every page, in the light theme and then the dark, each in a 1280 × 800 browser; a screenshot of each
 * into `out`. Rejects on the first page that fails, naming the page, the theme and the assertion.
 */
export async function visitAll(browser: Browser, base: string, pages: readonly PageSpec[], out: string): Promise<string[]> {
  fs.mkdirSync(out, { recursive: true });
  for (const spec of pages) {
    for (const theme of THEMES) {
      for (const name of [`${spec.name}-${theme}.png`, `${spec.name}-${theme}-failed.png`]) fs.rmSync(path.join(out, name), { force: true });
    }
  }
  const shots: string[] = [];
  for (const theme of THEMES) {
    const context = await browser.newContext({ colorScheme: theme, viewport: { width: 1280, height: 800 } });
    try {
      for (const spec of pages) {
        shots.push(await visit(context, base, spec, theme, out));
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
    throw new Error(`Chromium did not start: ${(err as Error).message.split('\n')[0]}\n  If it is not installed, run \`npx playwright install chromium\` once on this machine; every worktree shares ~/.cache/ms-playwright.`);
  }
}

/**
 * The process ends with `main`: exit 0 once it resolves; exit 1 once it rejects, saying what failed and
 * then whatever `explain` adds. `cleanUp` runs before either.
 */
export function exitOn(main: Promise<void>, cleanUp: () => void, explain: () => string = () => ''): void {
  main.then(
    () => {
      cleanUp();
      process.exit(0);
    },
    (err: unknown) => {
      console.error(`\ne2e: FAILED — ${err instanceof Error ? err.message : String(err)}${explain()}`);
      cleanUp();
      process.exit(1);
    },
  );
}
