import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { photograph, sidebar, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled } from '../checks.ts';
import { FACTORIES, FOLDER, WORKFLOWS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { fireWord } from '../../../src/lib/schedules.ts';
import { OUT, photographing, store } from '../world.ts';

/** The factory the page schedules a workflow in, and the workflow attached to it that it schedules. */
const FACTORY = FACTORIES.hiring.name;
const WORKFLOW = WORKFLOWS.good.name;
/** A factory the seed gives no schedule. */
const NONE = FACTORIES.bare;
/** Once a year, on the first of January at 9 in UTC: no fire falls between the page's write and its end, so the tick starts nothing. */
const CRON = '0 9 1 1 *';
const BRIEF = 'Sweep the year: what the factory left behind.';

/** The next fire of CRON after `now`, as the api answers it. */
function nextFire(now: number): string {
  const year = new Date(now).getUTCFullYear();
  const thisYear = Date.UTC(year, 0, 1, 9);
  return new Date(thisYear > now ? thisYear : Date.UTC(year + 1, 0, 1, 9)).toISOString();
}

/** The latest fire of CRON at or before `now`: the one the listing says a kept refusal of is still standing. */
function latestFire(now: number): string {
  const year = new Date(now).getUTCFullYear();
  const thisYear = Date.UTC(year, 0, 1, 9);
  return new Date(thisYear <= now ? thisYear : Date.UTC(year - 1, 0, 1, 9)).toISOString();
}

/** Go to `factory`'s settings page and wait for it to settle. */
async function settingsOf(page: Page, factory: string): Promise<void> {
  await page.goto(new URL(`/factories/${factory}/settings`, page.url()).href, { waitUntil: 'load' });
  await idle(page);
}

/** The line the api answers for scheduling a workflow of `factory`. */
async function scheduleLine(page: Page, factory: string): Promise<string> {
  const answer = await page.request.get(new URL('/api/factories', page.url()).href);
  const listed = (await answer.json()) as { name: string; commands: { schedule: string } }[];
  const line = listed.find((f) => f.name === factory)?.commands.schedule;
  if (!line) throw new Refused(`GET /api/factories answers ${factory} with the line that schedules one — it answers none`);
  return line;
}

/** How many times its size the line of the next run is pictured at, so the gap between a far fire's year and its hour is judged by eye. */
const ENLARGED = 4;

/**
 * Pictures the line of the next run by itself, named factory-schedules-next and its theme: its label and `next`'s words, drawn
 * `ENLARGED` times their size by a transform on their list, which lays no text out again, and taken back after the shot. Only when
 * the page is pictured: nothing is touched otherwise.
 */
async function photographNext(page: Page, next: Locator): Promise<void> {
  if (!photographing) return;
  const list = next.locator('xpath=..');
  await list.scrollIntoViewIfNeeded();
  const style = await list.getAttribute('style');
  await list.evaluate((el, by) => {
    (el as HTMLElement).style.transformOrigin = 'top left';
    (el as HTMLElement).style.transform = `scale(${by})`;
  }, ENLARGED);
  try {
    const clip = await next.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const [label, words] = [el.previousElementSibling!.getBoundingClientRect(), range.getBoundingClientRect()];
      const [left, top] = [Math.floor(label.left) - 16, Math.floor(Math.min(label.top, words.top)) - 16];
      const right = Math.min(window.innerWidth, Math.ceil(words.right) + 16);
      return { x: left, y: top, width: right - left, height: Math.ceil(Math.max(label.bottom, words.bottom)) + 16 - top };
    });
    await photograph(page, path.join(OUT, `factory-schedules-next-${await themeOf(page)}.png`), { clip });
  } finally {
    await list.evaluate((el, was) => (was === null ? el.removeAttribute('style') : el.setAttribute('style', was)), style);
  }
}

/**
 * The card of the scheduled factory: its workflow, cron and time zone, brief, the next fire as the api answers it and as `fireWord`
 * writes it, and the last run, a link to the run's page; no refusal, since the kept try started its run.
 */
async function expectScheduled(page: Page): Promise<void> {
  const card = page.locator(`[data-factory-schedules="${FACTORY}"]`);
  await expectVisible(card.getByText('Schedules', { exact: true }), 'the settings page draws the Schedules card');
  const row = card.locator(`[data-factory-schedule="${WORKFLOW}"]`);
  await expectVisible(row, `the card has a row for ${WORKFLOW}`);
  await expectVisible(row.getByText(CRON, { exact: true }), 'the row says its cron');
  await expectVisible(row.getByText('UTC', { exact: true }), 'and the time zone it is read in');
  await expectVisible(row.getByText(BRIEF, { exact: true }), 'and what each run is asked');
  const next = nextFire(Date.now());
  const shown = await row.locator('[data-schedule-next]').getAttribute('title');
  if (shown !== next) throw new Refused(`the next run is the cron's next fire, ${next} — the row says ${JSON.stringify(shown)}`);
  const timeZone = await page.evaluate(() => new Intl.DateTimeFormat().resolvedOptions().timeZone);
  const words = fireWord(new Date(next), new Date(), timeZone);
  const said = await row.locator('[data-schedule-next]').textContent();
  if (said !== words) throw new Refused(`the next run reads as the board writes a far fire, ${words} — it reads ${JSON.stringify(said)}`);
  const last = row.locator('[data-schedule-last]').getByRole('link', { name: FOLDER.id });
  await expectVisible(last, 'the last run is a link named by the run');
  const href = await last.getAttribute('href');
  if (href !== `/runs/${FOLDER.id}`) throw new Refused(`the last run links to its page, /runs/${FOLDER.id} — it links to ${href}`);
  await expectCount(row.locator('[data-schedule-refused]'), 0, 'a fire that started its run says no refusal');
  await expectVisible(row.locator('code', { hasText: `factory unschedule ${FACTORY} ${WORKFLOW}` }), 'the line that takes it back');
  await settled(page);
  await photograph(page, path.join(OUT, `factory-schedules-scheduled-${await themeOf(page)}.png`), { fullPage: true });
  await photographNext(page, row.locator('[data-schedule-next]'));
  await last.click();
  await page.waitForURL((url) => url.pathname === `/runs/${FOLDER.id}`);
  await idle(page);
}

/** The card of a factory with no schedule: an empty state that shows the api's line to schedule one. */
async function expectNone(page: Page): Promise<void> {
  const line = await scheduleLine(page, NONE);
  await settingsOf(page, NONE);
  const empty = page.locator(`[data-factory-schedules="${NONE}"] [data-no-schedules]`);
  await expectVisible(empty, 'a factory with no schedule says it has none');
  await expectVisible(empty.locator('code', { hasText: line }), `and shows the api's line to schedule one, ${line}`);
  await settled(page);
  await photograph(page, path.join(OUT, `factory-schedules-none-${await themeOf(page)}.png`), { fullPage: true });
}

/**
 * The card of a schedule whose latest fire the package refused, its workflow detached by hand from the factory's file: the refusal, in
 * the package's words, under a destructive alert, and no last run, since the fire started none.
 */
async function expectRefused(page: Page, why: string): Promise<void> {
  await settingsOf(page, FACTORY);
  const row = page.locator(`[data-factory-schedules="${FACTORY}"] [data-factory-schedule="${WORKFLOW}"]`);
  const alert = row.locator('[data-schedule-refused]');
  await expectVisible(alert.getByText('Its latest fire started no run', { exact: true }), 'a refused fire says it started no run');
  await expectVisible(alert.getByText(why, { exact: true }), 'and why, whole, in the words the tick kept');
  await expectVisible(row.locator('[data-schedule-last]').getByText('none yet', { exact: true }), 'a refused fire is no last run');
  await settled(page);
  await photograph(page, path.join(OUT, `factory-schedules-refused-${await themeOf(page)}.png`), { fullPage: true });
}

/**
 * Detach WORKFLOW from FACTORY by hand, keeping its schedule, and keep the tick's refusal of the cron's latest fire, in the words the
 * package refuses such a start with. Returns those words.
 */
function refuseLatest(factoryFile: string, factory: Record<string, unknown>, schedule: object, tries: string): string {
  const workflows = (factory.workflows as string[]).filter((w) => w !== WORKFLOW).sort();
  const offers = workflows.length ? `it offers: ${workflows.join(', ')}` : 'it offers none yet';
  const attach = `nemia factory attach ${FACTORY} ${WORKFLOW}`;
  const why = `${WORKFLOW}: the factory ${FACTORY} does not offer this workflow — ${offers}. Attach it: ${attach}. Nothing was started.`;
  fs.writeFileSync(factoryFile, `${JSON.stringify({ ...factory, workflows, schedules: { [WORKFLOW]: schedule } }, null, 2)}\n`);
  const kept = { due: latestFire(Date.now()), at: new Date().toISOString(), why, refused: true };
  fs.writeFileSync(path.join(tries, FACTORY, `${WORKFLOW}.json`), `${JSON.stringify(kept, null, 2)}\n`);
  return why;
}

export default {
  /**
   * A factory's schedules on its settings page, read-only. The page writes a schedule of the workflow attached to FACTORIES' `hiring` into
   * its file, as `nemia factory schedule` writes it, and the tick's kept try of it, naming FOLDER's run as the run its last fire started:
   * the card says the cron, the time zone, the brief, the next fire and the last run, a link to its page, and the line that takes it back.
   * A factory with no schedule shows the api's line to schedule one. Then the workflow is detached by hand and the kept try is the tick's
   * refusal of the latest fire: the card says it, whole. The factory's file and the kept try are taken back whatever happens.
   */
  name: 'factory-schedules',
  route: '/',
  expect: async (page) => {
    const factoryFile = path.join(store!, 'factories', `${FACTORY}.json`);
    const tries = path.join(store!, 'schedules');
    const factoryText = fs.readFileSync(factoryFile, 'utf8');
    if (fs.existsSync(tries)) throw new Refused(`the seed keeps no schedule's try — ${tries} is there`);
    const since = new Date().toISOString();
    const factory = JSON.parse(factoryText) as Record<string, unknown>;
    const schedule = { cron: CRON, brief: BRIEF, tz: 'UTC', since };
    try {
      fs.writeFileSync(factoryFile, `${JSON.stringify({ ...factory, schedules: { [WORKFLOW]: schedule } }, null, 2)}\n`);
      fs.mkdirSync(path.join(tries, FACTORY), { recursive: true });
      const kept = { due: '2026-01-01T09:00:00.000Z', at: '2026-01-01T09:00:03.000Z', run: FOLDER.id };
      fs.writeFileSync(path.join(tries, FACTORY, `${WORKFLOW}.json`), `${JSON.stringify(kept, null, 2)}\n`);
      await settingsOf(page, FACTORY);
      await sidebar(page);
      await expectScheduled(page);
      await expectNone(page);
      await expectRefused(page, refuseLatest(factoryFile, factory, schedule, tries));
    } finally {
      fs.writeFileSync(factoryFile, factoryText);
      fs.rmSync(tries, { recursive: true, force: true });
    }
  },
} satisfies PageSpec;
