/**
 * Draws every card of the build in each theme on React 18.3.1, the way the artifact's page frames it, with the real faces served,
 * in a fresh frame 960 by 1400 so what a story opens under a field has room below it; pictures each, and measures its height in the
 * first theme. In that theme each story is drawn in its turn (`?cells`), and each drawn cell of the board is judged (`cellFault`); a
 * board story whose module names MSW handlers and no tag was never drawn and is refused (`undeclared`). Anything a card throws, asks
 * outside the frame, answers with a 400 or more, a face that does not load, a root in another theme, a card that draws nothing: each
 * is a fault, named with what to do.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import type { CellFault } from '../../contracts/produce.contract.ts';
import { cellFault } from '../decide.ts';
import type { CellReport } from '../cards/runner.ts';
import { KIT_MAP } from '../kit/cards.ts';
import { ofTheFrame, serve } from './serve.ts';

/** The themes, the first the one a card is measured in. */
export const THEMES = ['dark', 'light'] as const;

/** The tallest picture taken of a card. */
const TALLEST = 3000;

/** What the verification found. */
export type Verified = {
  readonly faults: string[];
  readonly heights: Record<string, number>;
  readonly reports: Record<string, CellReport[]>;
  readonly grounds: Record<string, string[]>;
};

/** What to do about each fault of a board story's cell. */
const ADVICE: Readonly<Record<CellFault, (asked: number) => string>> = {
  threw: (asked) => (asked > 0 ? "tag it 'network' if it throws for want of the api, else fix what it throws" : 'fix what it throws'),
  'draws-nothing': (asked) => (asked > 0 ? "it draws nothing without the api: tag it 'network'" : 'give it a state it draws at rest'),
  'covers-card': () => "it opens a layer over the whole window at rest: tag it 'overlay'",
  'waits-on-network': () => "it waits on the api, which a card never answers: tag it 'network'",
  'api-picture': () => "it shows a picture the api serves: tag it 'network'",
};

/**
 * The faults of one card's cells: an undeclared story, and a drawn cell that fails (`cellFault`) — every fault for a board card, what
 * threw or drew nothing for a kit card, which declares nothing.
 * @param card the card's name.
 * @param reports what its page left on `window.__cells`.
 * @param rooted true for a board card.
 */
export const cellFaults = (card: string, reports: readonly CellReport[], rooted: boolean) =>
  reports.flatMap((report) => {
    if (report.fate === 'undeclared')
      return [`${card} ${report.name}: its parameters name MSW handlers and it carries no tag: tag it 'network' (or 'overlay')`];
    if (!report.cell) return [];
    const fault = cellFault(report.cell);
    if (fault === null || (!rooted && fault !== 'threw' && fault !== 'draws-nothing')) return [];
    const thrown = report.cell.threw ? ` (${report.cell.threw.slice(0, 120)})` : '';
    return [`${card} ${report.name}: ${fault}${thrown}: ${ADVICE[fault](report.cell.asked)}`];
  });

/** What one card's page shows once drawn. */
const seenOf = (page: Page) =>
  page.evaluate(() => {
    const root = document.getElementById('root') ?? document.body;
    const fixed = (element: Element) => {
      for (let at: Element | null = element; at && at !== document.body; at = at.parentElement)
        if (getComputedStyle(at).position === 'fixed') return true;
      return false;
    };
    const outside = [...document.body.children]
      .filter((element) => element !== root && element.tagName !== 'SCRIPT' && element.tagName !== 'STYLE')
      .flatMap((element) => [element, ...element.querySelectorAll('*')]);
    const feet = outside
      .filter((element) => !fixed(element))
      .map((element) => element.getBoundingClientRect())
      .filter((box) => box.width > 1 && box.height > 1)
      .map((box) => box.bottom + 24);
    return {
      bad: [...document.querySelectorAll<HTMLElement>('[data-failed],[data-broken]')].map(
        (element) => (element.dataset.failed ?? 'broken') + ': ' + (element.textContent ?? '').slice(0, 200),
      ),
      blank:
        root.getBoundingClientRect().height < 20 ||
        (root.textContent ?? '').trim().length + root.querySelectorAll('svg,img,canvas').length === 0,
      faces: [...document.fonts].filter((face) => face.status === 'error').map((face) => face.family),
      theme: document.documentElement.dataset.theme,
      ground: getComputedStyle(document.body).backgroundColor,
      height: Math.max(Math.ceil(root.getBoundingClientRect().height), Math.ceil(Math.max(0, ...feet))),
      cells: window.__cells ?? [],
    };
  });

/** Collects what a page says went wrong: errors it logged or threw, requests outside the frame, answers of 400 or more. */
const watched = (page: Page, base: string) => {
  const errors: string[] = [];
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text().slice(0, 300)));
  page.on('pageerror', (error) => errors.push(`it threw: ${String(error).slice(0, 300)}`));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && !(url.origin === base && ofTheFrame(url.pathname)))
      errors.push(`it asked outside the frame: ${request.url().replace(base, '').slice(0, 160)}`);
  });
  page.on(
    'response',
    (response) => response.status() >= 400 && errors.push(`${response.status()} for ${response.url().replace(base, '').slice(0, 160)}`),
  );
  return errors;
};

/** One card in one theme: drawn, judged and pictured. */
const drawCard = async (
  browser: Browser,
  base: string,
  job: { name: string; theme: string; rooted: boolean; shots: string },
  found: Verified,
) => {
  const measuring = job.theme === THEMES[0];
  const context = await browser.newContext({
    viewport: { width: 960, height: 1400 },
    colorScheme: job.theme === 'dark' ? 'light' : 'dark',
  });
  const page = await context.newPage();
  const errors = watched(page, base);
  try {
    await page.goto(`${base}/card/${job.name}?theme=${job.theme}${measuring ? '&cells' : ''}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__drawn === true, null, { timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => new Promise((done) => requestAnimationFrame(() => setTimeout(() => done(true), 450))));
    await page.evaluate(() => document.fonts.ready);
    const seen = await seenOf(page);
    (found.grounds[job.theme] ??= []).push(seen.ground);
    if (seen.theme !== job.theme) errors.push(`its root says ${seen.theme}: set data-theme before the bundle draws`);
    if (seen.faces.length) errors.push(`faces not loaded: ${seen.faces.join(', ')}: copy their files under fonts/`);
    if (seen.bad.length) errors.push(`it threw: ${seen.bad.slice(0, 3).join(' | ')}`);
    if (seen.blank && seen.cells.some((cell) => cell.fate === 'card')) errors.push('it draws nothing: read its stories in Storybook');
    if (measuring) {
      found.heights[job.name] = seen.height;
      found.reports[job.name] = seen.cells;
      found.faults.push(...cellFaults(job.name, seen.cells, job.rooted));
    }
    await page.setViewportSize({ width: 960, height: Math.min(Math.max(seen.height, KIT_MAP.ROOM[job.name] ?? 0, 120), TALLEST) });
    await page.screenshot({ path: path.join(job.shots, `${job.name}.${job.theme}.png`) });
  } catch (error) {
    errors.push(`its page did not finish drawing: ${String(error).slice(0, 300)}`);
  }
  found.faults.push(...[...new Set(errors)].slice(0, 4).map((error) => `${job.name}@${job.theme}: ${error}`));
  await context.close();
};

/**
 * Draws every card in each theme, six pages at once.
 * @param project the artifact's folder.
 * @param shots the folder the pictures are written to.
 * @param cards each card's name and whether it is the board's.
 */
export const verifyCards = async (project: string, shots: string, cards: readonly { name: string; rooted: boolean }[]) => {
  fs.mkdirSync(shots, { recursive: true });
  const { base, close } = await serve(project);
  const browser = await chromium.launch();
  const found: Verified = { faults: [], heights: {}, reports: {}, grounds: {} };
  const jobs = THEMES.flatMap((theme) => cards.map((card) => ({ ...card, theme, shots })));
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let job = jobs.shift(); job; job = jobs.shift()) await drawCard(browser, base, job, found);
    }),
  );
  await browser.close();
  await close();
  for (const [theme, grounds] of Object.entries(found.grounds)) found.grounds[theme] = [...new Set(grounds)];
  return found;
};
