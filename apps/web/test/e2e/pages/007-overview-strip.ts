import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectTexts, expectVisible, idle, Refused, settled } from '../checks.ts';
import type { Ceilings, Daemon, Factory, FinishedPage, RunSummary } from '../../../src/lib/api.ts';
import { tokensBreakdown } from '../../../src/lib/breakdown.ts';
import { daemonDot } from '../../../src/lib/footer.ts';
import { dollars, readoutOf, type Strip, stripOf } from '../../../src/lib/strip.ts';
import { NEIGHBOUR } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** The window the strip is read in: 1440 pixels wide, the rail open. */
const WIDE = { width: 1440, height: 1000 };

/** A phone's window, under the width the strip holds one row from. */
const PHONE = { width: 390, height: 844 };

/** That on a phone the three frames stack, each under the one before it, each as wide as the others. */
async function expectStacked(strip: Locator): Promise<void> {
  const boxes = await strip.locator('[data-strip-frame]').evaluateAll((frames) =>
    frames.map((f) => ({
      top: Math.round(f.getBoundingClientRect().top),
      bottom: Math.round(f.getBoundingClientRect().bottom),
      width: Math.round(f.getBoundingClientRect().width),
    })),
  );
  const stacked = boxes.every((box, at) => at === 0 || box.top >= boxes[at - 1].bottom) && new Set(boxes.map((b) => b.width)).size === 1;
  if (!stacked) throw new Refused(`on a phone the three frames stack at one width — ${JSON.stringify(boxes)}`);
}

/** What the api answers at `url`, read in the page as the board reads it. */
const answer = <T>(page: Page, url: string): Promise<T> =>
  page.evaluate(async (at) => (await (await fetch(at)).json()) as unknown, url) as Promise<T>;

/** The value a sticker of `strip` labelled `label` shows. */
const stickerOf = (strip: Locator, label: string): Locator =>
  strip
    .locator('[data-sticker]')
    .filter({ has: strip.page().getByText(label, { exact: true }) })
    .locator('span')
    .last();

/** The strip the board's rule gives for the api's own answer, at the page's instant and from the browser's midnight. */
async function expected(page: Page, factory?: string) {
  const [runs, factories, ceilings] = await Promise.all([
    answer<RunSummary[]>(page, '/api/runs'),
    answer<Factory[]>(page, '/api/factories'),
    answer<Ceilings>(page, '/api/ceilings'),
  ]);
  const { now, dayStart } = await page.evaluate(() => {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    return { now: Date.now(), dayStart: day.getTime() };
  });
  return { strip: stripOf({ runs, factories, ceilings, now, dayStart, factory }), dayStart };
}

/** The factory whose runs name none, read at `?factory=`: it hires no agent, where every factory hires one. */
const DEFAULT_FACTORY = 'default';

/** The agents' count as the strip says it: `1 OF 2`, the count alone with no total. */
const agentsSaid = ({ agents }: Strip): string => `${agents.count}${agents.hired === null ? '' : ` OF ${agents.hired}`}`;

/** That each of the six stickers reads what `want` says. */
async function expectStickers(strip: Locator, want: Strip): Promise<void> {
  const stickers: Array<[string, string]> = [
    ['Wait on you', String(want.waitsOnYou)],
    ['In flight', String(want.inFlight)],
    ['Landed', String(want.landed)],
    ['Spent', dollars(want.spentUsd)],
    ['Per landing', dollars(want.perLanding)],
    ['Failed', String(want.failed)],
  ];
  for (const [label, value] of stickers)
    await expectTexts(stickerOf(strip, label), [value], `the ${label} sticker reads the rule's ${value}`);
}

/** That the three frames' tops stand on one line, and the six stickers on one line: the row did not wrap. */
async function expectOneRow(strip: Locator): Promise<void> {
  const tops = await strip
    .locator('[data-strip-frame]')
    .evaluateAll((frames) => frames.map((f) => Math.round(f.getBoundingClientRect().top)));
  if (tops.length !== 3 || new Set(tops).size !== 1)
    throw new Refused(`the three frames stand in one row at 1440 pixels, rail open — their tops ${tops.join(', ')}`);
  const stickers = await strip
    .locator('[data-sticker]')
    .evaluateAll((all) =>
      all.map((s) => ({ top: Math.round(s.getBoundingClientRect().top), width: Math.round(s.getBoundingClientRect().width) })),
    );
  const room = await strip.locator('[data-strip="today"]').evaluate((today) => Math.round(today.getBoundingClientRect().width));
  if (stickers.length !== 6 || new Set(stickers.map((s) => s.top)).size !== 1)
    throw new Refused(
      `the six stickers hold one line — their tops ${stickers.map((s) => s.top).join(', ')}, widths ${stickers.map((s) => s.width).join(', ')} in a frame ${room} wide`,
    );
}

/** That each agent's row is cut short with an ellipsis where it runs out of room, and never wraps onto a second line. */
async function expectRowsCut(strip: Locator): Promise<void> {
  const rows = await strip.locator('[data-agent-words]').evaluateAll((all) =>
    all.map((w) => {
      const style = getComputedStyle(w);
      return { lines: w.getClientRects().length, ellipsis: style.textOverflow === 'ellipsis' && style.whiteSpace === 'nowrap' };
    }),
  );
  if (rows.some((row) => row.lines !== 1 || !row.ellipsis)) throw new Refused('each agent row holds one line, cut with an ellipsis');
}

/**
 * The Spent tile, reached by the keyboard, opens a preview of today's tokens by kind over the very runs Spent counts: headed by the
 * dollars over their tokens, its rows the kinds `tokensBreakdown` gives for `want`'s sum, and Escape closes it. A seed whose day counts no
 * tokens refuses: the preview would prove nothing.
 */
async function expectSpentPreview(page: Page, strip: Locator, want: Strip): Promise<void> {
  if (!want.spentTokens) throw new Refused("the seed's day counts tokens on a run Spent counts, for its preview to be read");
  const breakdown = tokensBreakdown(want.spentTokens, `${dollars(want.spentUsd)} today`);
  const tile = strip.locator('[data-stat-tile="spent"]');
  await tile.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  const tooltip = page.locator('[data-slot="tooltip"]');
  await expectVisible(tooltip, 'the Spent tile opens its preview on the focus the keyboard gives it');
  await expectTexts(tooltip.locator('[data-slot="tooltip-headline"]'), [breakdown.head], 'headed by the dollars over their tokens');
  await expectTexts(
    tooltip.locator('[data-breakdown-row] dt'),
    breakdown.rows.map((r) => r.what),
    "today's tokens by kind",
  );
  await expectTexts(
    tooltip.locator('[data-breakdown-row] dd'),
    breakdown.rows.map((r) => r.said),
    'each with its count',
  );
  await photograph(page, path.join(OUT, `overview-strip-spent-preview-${await themeOf(page)}.png`));
  await page.keyboard.press('Escape');
  await expectCount(tooltip, 0, 'Escape closes it');
}

export default {
  /**
   * The Overview's strip at `/`, at 1440 pixels with the rail open: its three cut frames on one row, the six stickers on one line. Each
   * number is the board's rule (`stripOf`) of the api's own answer, from the browser's midnight; Landed and Failed are the finished
   * page's today too, the api's own words for how a run ended. The readout reads the caps, the daemon's tag says what the api judged
   * of it (none ticks the e2e's store), each agent's row says the agent, its step and the run's title, cut short, never wrapped, and the
   * quota, past its mark in the seed, says so. Spent opens a preview of today's tokens by kind, from the keyboard. On a phone the
   * frames stack, one under the other. At `?factory=default` the strip counts that factory's runs alone, and its agents against those
   * of its own.
   */
  name: 'overview-strip',
  route: '/',
  expect: async (page) => {
    const size = page.viewportSize();
    await page.setViewportSize(WIDE);
    try {
      await idle(page);
      const strip = page.locator('[data-overview-strip]');
      await expectVisible(strip, 'the Overview opens on its strip');
      const { strip: want, dayStart } = await expected(page);
      await expectStickers(strip, want);
      const finished = await answer<FinishedPage>(page, '/api/runs-finished?size=100');
      const today = finished.runs.filter((run) => Date.parse(run.finishedAt) >= dayStart);
      const said = (outcome: string) => today.filter((run) => run.outcome === outcome).length;
      if (said('succeeded') !== want.landed || said('failed') !== want.failed)
        throw new Refused(`Landed and Failed agree with the finished page's today: ${said('succeeded')} and ${said('failed')}`);
      await expectTexts(strip.locator('[data-strip-readout]'), [readoutOf(want)], 'the readout says what is at work against the caps');
      const dot = daemonDot(await answer<Daemon>(page, '/api/daemon'), null, new Date());
      await expectTexts(strip.locator('[data-strip-daemon]'), [dot.word], "the daemon's tag says what the api judged of it");
      await expectTexts(strip.locator('[data-strip-agents]'), [agentsSaid(want)], 'the agents at work, of those of the factories');
      if (!want.rows.some((row) => row.agent === NEIGHBOUR.agent))
        throw new Refused(`the seed's ${NEIGHBOUR.agent} is at work in ${NEIGHBOUR.id}, for its row to be read`);
      await expectTexts(
        strip.locator('[data-agent-words]'),
        want.rows.map((row) => `${row.agent} · ${row.step} · ${row.title}`),
        'a row for each step at work: the agent, the step and the run',
      );
      await expectRowsCut(strip);
      await expectCount(strip.locator('[data-quota-past]'), 1, 'the quota is past its mark in the seed, and says so');
      await expectTexts(strip.locator('[data-quota-past]'), ['Past 80%'], 'at the mark the api gives');
      await expectCount(strip.getByRole('meter'), 2, 'a meter for each window');
      await expectOneRow(strip);
      await expectSpentPreview(page, strip, want);
      await settled(page);
      await photograph(page, path.join(OUT, `overview-strip-day-${await themeOf(page)}.png`));
      await page.setViewportSize(PHONE);
      await expectStacked(strip);
      await settled(page);
      await photograph(page, path.join(OUT, `overview-strip-phone-${await themeOf(page)}.png`), { fullPage: true });
      await page.setViewportSize(WIDE);
      await page.goto(new URL(`/?factory=${DEFAULT_FACTORY}`, page.url()).href);
      await idle(page);
      const { strip: theirs } = await expected(page, DEFAULT_FACTORY);
      if (agentsSaid(theirs) === agentsSaid(want))
        throw new Refused(`the default factory's strip differs from every factory's, for its scope to be read: both ${agentsSaid(want)}`);
      await expectStickers(strip, theirs);
      await expectTexts(strip.locator('[data-strip-agents]'), [agentsSaid(theirs)], "the default factory's agents, of those of its own");
    } finally {
      if (size) await page.setViewportSize(size);
    }
  },
} satisfies PageSpec;
