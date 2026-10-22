import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { FINISHED_SIZE, type FinishedPage, type OpenRuns, type WaitingRun } from '../../../src/lib/api/runs.ts';
import { rowsSaid } from '../../../src/lib/finished.ts';
import { runClock, titleOf } from '../../../src/lib/factory.ts';
import { agoWords, endedWords, openWord, presentWait, sinceShort, waitSentence, waitTag } from '../../../src/lib/runWords.ts';
import { answered, fed, photograph, photographBothWidths, SECTIONS, sectionsOf, sidebar, themeOf, railPlace, litOf } from '../board.ts';
import { expectBeneath, expectCount, expectNone, expectTexts, expectVisible, idle, literal, Refused, WAIT_MS } from '../checks.ts';
import { agosRefused } from '../runs-times.ts';
import { contrastHolds } from '../runs-contrast.ts';
import { COSTLY, ENDING, GATED, REGATED, regatedFiles, writeRegated } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, photographing, store } from '../world.ts';

/**
 * A place in the menu pressed with Enter, as from the keyboard: the page is not loaded again, and the history has one entry more, as after
 * a click. The browser clicks a link on Enter's keydown, and React Aria lets that click through: only the root's `RouterProvider` keeps it
 * from loading the whole page. Nothing else in the e2e presses a link from the keyboard.
 */
async function enterOnPlace(page: Page, place: (typeof SECTIONS)[number], route: string): Promise<void> {
  const before = await page.evaluate(() => {
    (window as unknown as { e2eNotReloaded?: true }).e2eNotReloaded = true;
    return history.length;
  });
  await sectionsOf(page).filter({ hasText: place }).focus();
  await page.keyboard.press('Enter');
  await page.waitForURL((url) => url.pathname === route, { timeout: WAIT_MS });
  const [kept, after] = await page.evaluate(
    () => [(window as unknown as { e2eNotReloaded?: true }).e2eNotReloaded === true, history.length] as const,
  );
  if (!kept) throw new Refused(`Enter on ${place} in the menu goes to ${route} in the page — the whole page was loaded again`);
  if (after !== before + 1)
    throw new Refused(`Enter on ${place} in the menu adds one entry to the history, as a click does — it went from ${before} to ${after}`);
}

/** The path of each request to the api a fresh visit of the page's address makes until it is idle. */
async function asksOf(page: Page): Promise<string[]> {
  const again = await page.context().newPage();
  const asked: string[] = [];
  again.on('request', (request) => {
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.pathname.startsWith('/api/')) asked.push(url.pathname);
  });
  try {
    await again.goto(page.url(), { waitUntil: 'load' });
    await idle(again);
    await expectVisible(again.locator('[data-runs-page="loaded"]'), 'the page is drawn on a visit of its own');
  } finally {
    await again.close();
  }
  return asked;
}

/** The page asks its two reads, and never the whole list. */
async function twoReads(page: Page): Promise<void> {
  const asked = await asksOf(page);
  for (const read of ['/api/runs-open', '/api/runs-finished'])
    if (!asked.includes(read)) throw new Refused(`the Runs page asks GET ${read} — it asked ${[...new Set(asked)].join(', ')}`);
  if (asked.includes('/api/runs')) throw new Refused('the Runs page never asks GET /api/runs, the whole list — it did');
}

/** The three sections, by their names. */
const section = (page: Page, name: 'waiting' | 'in-flight' | 'finished'): Locator => page.locator(`section[data-section="${name}"]`);

/** The card of the waiting run `id`. */
const cardOf = (page: Page, id: string): Locator => section(page, 'waiting').locator(`article[data-run="${id}"]`);

/**
 * The three parts as the api counts them: a card for every run that waits and no row of it, a row for every run in flight, a page of
 * the finished, each under a plate that says the api's count and stands alone on its line; and nothing of the list the page was.
 */
async function threeParts(page: Page, open: OpenRuns, finished: FinishedPage): Promise<void> {
  await expectTexts(page.getByRole('heading', { level: 1 }), ['Runs'], "the page's header is its name");
  await expectTexts(
    page.getByRole('heading', { level: 2 }),
    ['Waiting on you', 'In flight', 'Finished'],
    'its three sections, what waits on you first',
  );
  for (const [name, count] of [
    ['waiting', open.counts.waiting],
    ['in-flight', open.counts.inFlight],
    ['finished', open.counts.finished],
  ] as const) {
    await expectTexts(section(page, name).locator('[data-plate-count]'), [String(count)], `the plate of ${name} says the api's count`);
    await expectCount(
      section(page, name).locator('[data-plate="loud"] [data-plate-barcode]'),
      1,
      `the plate of ${name} counts runs, so it carries its barcode`,
    );
    const beside = await section(page, name)
      .locator('[data-plate]')
      .evaluate((plate) => [...plate.parentElement!.children].filter((other) => other !== plate).map((other) => other.outerHTML));
    if (beside.length) throw new Refused(`the plate of ${name} stands alone on its line, no rule beside it — ${beside.join(' ')}`);
  }
  if (open.counts.waiting < 2 || open.counts.inFlight < 2 || open.counts.finished < 2)
    throw new Refused(`the seed holds runs of each part — ${JSON.stringify(open.counts)}`);
  await expectCount(section(page, 'waiting').locator('article[data-run]'), open.counts.waiting, 'every run the bell counts gets a card');
  await expectCount(section(page, 'in-flight').locator('tr[data-run]'), open.counts.inFlight, 'every run in flight gets a row');
  await expectCount(
    section(page, 'finished').locator('tr[data-run]'),
    Math.min(FINISHED_SIZE, finished.total),
    'the finished runs are one page of nine',
  );
  for (const run of open.waiting) {
    await expectCount(cardOf(page, run.id), 1, `${run.id}, which waits on you, has one card`);
    await expectCount(page.locator(`tr[data-run="${run.id}"]`), 0, `and no row: ${run.id} is a card and only a card`);
  }
  await expectBeneath(section(page, 'in-flight'), section(page, 'waiting'), 'the runs in flight are beneath what waits on you');
  await expectBeneath(section(page, 'finished'), section(page, 'in-flight'), 'and the finished beneath those');
  await expectCount(
    page.locator('[data-in-flight], [data-to-decide], [data-filtered-out], [data-pruned], main [role="switch"]'),
    0,
    'no switch, nothing to decide from the list',
  );
  const said = (
    await page.locator('[data-sentence], [data-wait-tag], [data-now-word], [data-now-note], th, [data-ended], [data-pager]').allInnerTexts()
  ).join('\n');
  const told = /\bgit\b|\bbranch|\bmerge|\bcommit|worktree|--|\bnemia [a-z]+ /i.exec(said);
  if (told) throw new Refused(`the page's own words say nothing of git and repeat no command — it says "${told[0]}"`);
  if (/\d+s\b/.test(await section(page, 'in-flight').innerText()))
    throw new Refused('no time on the page counts seconds: each is a fact to the minute');
}

/**
 * What a card may say `run` has waited this time: its present wait at each half minute from a little before the answer `asOf` was read at
 * until now, since the page's own read is another than the one the check made, and the wait grows meanwhile. None for a wait not dated.
 */
const waitsSaid = (run: WaitingRun, asOf: string): Set<string> => {
  const said = new Set<string>();
  const [from, now] = [Date.parse(asOf) - 90_000, Date.now()];
  for (let at = from; at - 30_000 <= now; at += 30_000) {
    const wait = presentWait(run, new Date(at));
    if (wait !== null) said.add(`waiting ${wait}`);
  }
  return said;
};

/** The card of `run` says how long it has waited on a person this time, since the api's `waitingSince`, and nothing where it is null. */
async function waitSaid(page: Page, run: WaitingRun, asOf: string): Promise<void> {
  const figure = cardOf(page, run.id).locator('[data-waited]');
  if (run.waitingSince === null)
    return await expectCount(figure, 0, `the card of ${run.id}, whose wait the api does not date, says no wait`);
  await expectNone(async () => {
    const [said, may] = [(await figure.allInnerTexts()).map((text) => text.trim().toLowerCase()), waitsSaid(run, asOf)];
    return said.length === 1 && may.has(said[0]) ? null : `it says "${said.join(' | ')}", and its present wait is ${[...may].join(' or ')}`;
  }, `the card of ${run.id} says how long it has waited this time, since ${run.waitingSince}`);
}

/** The whole minutes a figure says, of `2h 5m` or `25m`; none for `under 1m` and `none`. */
const minutesIn = (said: string): number => {
  const [, h, m] = /(?:(\d+)h)?\s*(?:(\d+)m)?$/.exec(said.replace(/^under 1m$/, '')) ?? [];
  return Number(h ?? 0) * 60 + Number(m ?? 0);
};

/**
 * REGATED, at its second gate: its card says the present wait, minutes long, while the row of its Clock tile's tooltip keeps every wait
 * on a person summed, over twenty minutes. A card that read the sum would say the row's figure. The open tooltip is photographed.
 */
async function secondGate(page: Page, open: OpenRuns): Promise<void> {
  const run = open.waiting.find((waiting) => waiting.id === REGATED.id);
  if (!run?.clock || run.waitingSince === null) throw new Refused(`${REGATED.id} waits on you, and the api dates its present wait`);
  const [present, summed] = [Date.parse(open.asOf) - Date.parse(run.waitingSince), run.clock.personMs];
  if (present >= 10 * 60_000 || summed < 20 * 60_000)
    throw new Refused(`the api dates ${REGATED.id}'s wait from its second gate: ${present} ms of ${summed} ms waited in all`);
  const card = cardOf(page, run.id);
  await card.scrollIntoViewIfNeeded();
  const waited = minutesIn(
    (await card.locator('[data-waited]').innerText())
      .trim()
      .toLowerCase()
      .replace(/^waiting /, ''),
  );
  if (waited < 1 || waited >= 10)
    throw new Refused(`the card of ${REGATED.id} says its wait at the second gate, a few minutes — it says ${waited} minutes`);
  await card.locator('[data-stat-tile="clock"]').focus();
  await expectVisible(tooltip(page), "its Clock tile's tooltip opens on focus");
  const row = (await tooltip(page).locator('[data-breakdown-row="Waiting on you"] dd').innerText()).trim();
  await photograph(page, path.join(OUT, `runs-tooltip-second-gate-${await themeOf(page)}.png`));
  await page.keyboard.press('Escape');
  await expectCount(tooltip(page), 0, 'Escape closes it');
  if (minutesIn(row) < 20)
    throw new Refused(`the tooltip's row keeps the run's whole time waiting on a person, both gates summed — it says "${row}"`);
}

/**
 * A waiting run's card says its tag, its factory, its title as a link, its id, one sentence, its steps by name, and on its one button
 * what there is to read, by the kind of its wait (`openWord`); the button opens its page.
 */
async function cardSays(page: Page, run: WaitingRun): Promise<void> {
  const card = cardOf(page, run.id);
  const open = `[href="/runs/${run.id}"]`;
  await expectTexts(card.locator('[data-wait-tag]'), [waitTag(run)], `the card of ${run.id} says what is asked of you`);
  await expectTexts(card.locator('[data-sentence]'), [run.unreadable ?? waitSentence(run)], 'one plain sentence');
  await expectTexts(card.getByRole('heading', { level: 3 }).locator(`a${open}`), [titleOf(run)], "the run's title, a link to its page");
  await expectTexts(card.locator('[data-run-id]'), [run.id], 'its id');
  await expectTexts(
    card.locator('[data-step-name]'),
    run.steps.map((step) => step.name),
    'a rail of its own steps, each by its name',
  );
  await expectTexts(card.locator('[data-sticker] > span:first-child'), ['Clock', 'Cost', 'Tokens'], 'three tiles');
  await expectTexts(
    card.locator(`a[data-cut-button]${open}`),
    [openWord(run)],
    "one filled button, which says what there is to read and opens the run's page",
  );
  await expectCount(card.locator('button[data-step-bar]'), run.steps.length, "each bar of its rail a button that opens its step's card");
  await expectCount(
    card.locator('button:not([data-step-bar])'),
    1,
    'and one control more, the copy of its id: nothing is decided from the list',
  );
}

/** The seed's two gates name what a person reads there: the plan that waits, and the review done before a landing not yet filed. */
async function gatesSay(page: Page): Promise<void> {
  for (const [id, words, why] of [
    [GATED.id, 'Read the plan', 'a gate on a step that has run names that step'],
    [ENDING.id, 'Read the review', 'a gate held before its step is filed names the step done before it'],
  ] as const)
    await expectTexts(cardOf(page, id).locator('a[data-cut-button]'), [words], why);
}

/** Where a card's button stands against its tiles: under them or beside them, and how far its right edge is from the foot's. */
const footOf = (card: Locator): Promise<{ under: boolean; beside: boolean; fromRight: number }> =>
  card.locator('[data-foot]').evaluate((foot) => {
    const [tiles, button] = ['[data-tiles]', '[data-cut-button]'].map((part) => foot.querySelector(part)!.getBoundingClientRect());
    return {
      under: button.top >= tiles.bottom,
      beside: button.top < tiles.bottom && button.bottom > tiles.top,
      fromRight: Math.round(foot.getBoundingClientRect().right - button.right),
    };
  });

/** The window a card holds its tiles and its button side by side in. */
const WIDE = 1680;

/**
 * The button of `run`'s card stands at the card's right: under the tiles in the window the visit is in, where the card does not hold
 * both, and beside them in a window `WIDE` across, where it does; and so does every other card's, wherever its button falls. The foot
 * is photographed at each width, and the window put back.
 */
async function footAtRight(page: Page, open: OpenRuns, run: WaitingRun): Promise<void> {
  const size = page.viewportSize() ?? { width: 1280, height: 800 };
  try {
    for (const [width, place] of [
      [size.width, 'under'],
      [WIDE, 'beside'],
    ] as const) {
      await page.setViewportSize({ width, height: size.height });
      await expectNone(async () => {
        const at = await footOf(cardOf(page, run.id));
        return at[place] && at.fromRight === 0 ? null : JSON.stringify(at);
      }, `${width} wide, the button of ${run.id}'s card is ${place} its tiles, at the card's right`);
      for (const other of open.waiting) {
        const at = await footOf(cardOf(page, other.id));
        if (at.fromRight !== 0 || at.under === at.beside)
          throw new Refused(`${width} wide, the button of ${other.id}'s card is at the card's right — ${JSON.stringify(at)}`);
      }
      const foot = cardOf(page, run.id).locator('[data-foot]');
      await foot.scrollIntoViewIfNeeded();
      await photograph(foot, path.join(OUT, `runs-foot-${place}-${await themeOf(page)}.png`));
    }
  } finally {
    await page.setViewportSize(size);
  }
}

/** A copy control's glyph, its id and the line that holds both, as the browser lays them out, in whole pixels. */
const copyOf = (holder: Locator): Promise<{ glyph: string; gap: number; line: number }> =>
  holder.evaluate((copy) => {
    const box = (part: string) => copy.querySelector(part)!.getBoundingClientRect();
    const [glyph, id] = [box('[data-copy-glyph]'), box('[data-run-id]')];
    return {
      glyph: `${glyph.width} by ${glyph.height}`,
      gap: Math.round(glyph.left - id.right),
      line: Math.round(copy.getBoundingClientRect().height),
    };
  });

/**
 * The copy control as the canvas draws it, on a card and in each table: its glyph 12 pixels across, 7 from the id; and on a card the
 * line of the whole id 16 pixels tall, 4 under the title.
 */
async function copyDrawn(page: Page, open: OpenRuns, finished: FinishedPage): Promise<void> {
  const card = cardOf(page, open.waiting[0].id);
  const holders: Array<[Locator, string]> = [
    [card.locator('[data-copy-id]'), 'a card'],
    [section(page, 'in-flight').locator('tr[data-run] [data-copy-id]').first(), 'a row in flight'],
    [section(page, 'finished').locator(`tr[data-run="${finished.runs[0].id}"] [data-copy-id]`), 'a finished row'],
  ];
  for (const [holder, where] of holders) {
    const drawn = await copyOf(holder);
    if (drawn.glyph !== '12 by 12' || drawn.gap !== 7)
      throw new Refused(`the copy control of ${where} draws its glyph 12 pixels across, 7 from the id — ${JSON.stringify(drawn)}`);
  }
  const under = await card.locator('[data-copy-id]').evaluate((copy) => {
    const title = copy.closest('article')!.querySelector('h3')!.getBoundingClientRect();
    return Math.round(copy.getBoundingClientRect().top - title.bottom);
  });
  const { line } = await copyOf(holders[0][0]);
  if (line !== 16 || under !== 4)
    throw new Refused(`on a card the whole id's line is 16 pixels tall, 4 under the title — ${line} tall, ${under} under`);
}

/** A title long enough to run over the copy control under it, and short enough to stay on one line of a card. */
const OVER = 'A title that runs over the copy control';

/**
 * A press on a card's title opens the run, on its lowest row too, which the copy control's target reaches: with a title that runs
 * over the control written into the first card and taken out again, the point a pixel inside the title's lower edge, above the
 * control's centre, is within the target's reach and answers the title's link.
 */
async function titleKeepsItsBox(page: Page, open: OpenRuns): Promise<void> {
  const card = cardOf(page, open.waiting[0].id);
  await card.scrollIntoViewIfNeeded();
  const hit = await card.evaluate((article, over) => {
    const link = article.querySelector('h3 a')!;
    const text = [...link.childNodes].find((node) => node.nodeType === Node.TEXT_NODE)!;
    const was = text.nodeValue;
    text.nodeValue = over;
    try {
      const button = article.querySelector('[data-copy-id] button')!.getBoundingClientRect();
      const [x, cy] = [button.left + button.width / 2, button.top + button.height / 2];
      const rows = [...link.getClientRects()];
      const row = rows.at(-1)!;
      const at = document.elementFromPoint(x, row.bottom - 1);
      return {
        rows: rows.length,
        over: x > row.left && x < row.right,
        above: Math.round(cy - row.bottom),
        title: at?.closest('a') === link,
        tag: at?.tagName ?? 'nothing',
      };
    } finally {
      text.nodeValue = was;
    }
  }, OVER);
  if (hit.rows !== 1 || !hit.over || hit.above >= 24)
    throw new Refused(`the title written runs over the copy control, within its target's reach — ${JSON.stringify(hit)}`);
  if (!hit.title)
    throw new Refused(`a press on the lowest row of a card's title, over the copy control, opens the run — it lands on ${hit.tag}`);
}

/** The element the keyboard is on. */
const focused = (page: Page): Locator => page.locator(':focus');

/** The tooltip that shows. */
const tooltip = (page: Page): Locator => page.locator('[data-slot="tooltip"]');

/**
 * The keyboard's path over COSTLY's card: from its title, Tab reaches the copy control, which Enter presses, then the rail's bars;
 * from the last bar each tile in turn, whose tooltip opens on focus with its breakdown and closes on Escape, asking the api nothing;
 * then the button. Each tooltip is photographed.
 */
async function byKeyboard(page: Page, run: WaitingRun): Promise<void> {
  const card = cardOf(page, run.id);
  await card.scrollIntoViewIfNeeded();
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const asked: string[] = [];
  const hear = (request: { url(): string }) => void (request.url().includes(`/api/runs/${run.id}`) && asked.push(request.url()));
  await card.getByRole('heading', { level: 3 }).locator('a').focus();
  await page.keyboard.press('Tab');
  await expectVisible(card.locator('[data-copy-id] button:focus'), 'Tab from the title reaches the copy control');
  await page.keyboard.press('Enter');
  await expectVisible(card.locator('[data-copy-id][data-copied]'), 'Enter on it copies, and the control says so');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  if (copied !== run.id) throw new Refused(`the copy control copies the run's whole id, ${run.id} — the clipboard holds "${copied}"`);
  await expectTexts(card.locator('[data-copy-id] [role="status"]'), ['Copied'], 'and says it to a screen reader');
  await page.keyboard.press('Tab');
  await expectVisible(card.locator('button[data-step-bar]').first().locator(':scope:focus'), "then Tab reaches the rail's first bar");
  await card.locator('button[data-step-bar]').last().focus();
  await page.keyboard.press('Escape');
  await expectCount(page.locator('[data-slot="preview-card"]'), 0, "Escape on the rail's last bar leaves no step's card open");

  const heads: Record<string, RegExp> = {
    clock: /^(?:not started|not judged|under 1m|\d+[dhm](?: \d+[hm])?)$/,
    cost: new RegExp(`^${literal(COSTLY.cost)} so far, by step$`),
    tokens: new RegExp(`^${COSTLY.tokens.said.replace(' tokens', '')} counted, `),
  };
  page.on('request', hear);
  for (const tile of ['clock', 'cost', 'tokens'] as const) {
    await page.keyboard.press('Tab');
    await expectVisible(card.locator(`[data-stat-tile="${tile}"]:focus`), `Tab reaches the ${tile} tile`);
    await expectVisible(tooltip(page), `and its tooltip opens on focus, with no pointer`);
    const head = (await tooltip(page).locator('[data-slot="tooltip-headline"]').innerText()).trim();
    if (!heads[tile].test(head)) throw new Refused(`the ${tile} tooltip is headed as ${heads[tile]} — it says "${head}"`);
    if (tile === 'cost')
      await expectTexts(
        tooltip(page).locator('dt'),
        (run.stepCosts ?? []).map((step) => step.step),
        'the cost is broken down by step, in the run’s order',
      );
    else if ((await tooltip(page).locator('[data-breakdown-row]').count()) < 2) throw new Refused(`the ${tile} tooltip has its rows`);
    if (tile === 'clock') {
      const foot = (await tooltip(page).locator('[data-breakdown-foot]').innerText()).trim();
      if (!/^Wall time .+, from .+\.$/.test(foot))
        throw new Refused(`the clock's tooltip says the wall time its rows add up to, in its foot — it says "${foot}"`);
    }
    const described = await focused(page).getAttribute('aria-describedby');
    if (!described) throw new Refused(`the ${tile} tile is described by its tooltip while it shows`);
    await photograph(page, path.join(OUT, `runs-tooltip-${tile}-${await themeOf(page)}.png`));
    await page.keyboard.press('Escape');
    await expectCount(tooltip(page), 0, 'Escape closes it');
  }
  page.off('request', hear);
  await page.keyboard.press('Tab');
  await expectVisible(card.locator('a[data-cut-button]:focus'), 'then Tab reaches the button that opens the run');
  if (asked.length)
    throw new Refused(`a tooltip opens with no request: the light answer carries its rows — the page asked ${asked.join(', ')}`);
}

/**
 * In a table the keyboard reaches a row, then, with the arrow keys, the title's link and the copy control, which Enter presses: no
 * pointer.
 */
async function tableByKeyboard(page: Page, finished: FinishedPage): Promise<void> {
  const run = finished.runs[0];
  const row = section(page, 'finished').locator(`tr[data-run="${run.id}"]`);
  await row.scrollIntoViewIfNeeded();
  await section(page, 'in-flight').locator('tr[data-run]').last().focus();
  await page.keyboard.press('Tab');
  await expectNone(async () => {
    const at = await focused(page).evaluate((element) => element.closest('section')?.getAttribute('data-section') ?? null);
    return at === 'finished' ? null : `the keyboard is in ${at}`;
  }, 'Tab from the table in flight reaches the finished table');
  const reach = async (target: Locator, what: string) => {
    for (let pressed = 0; pressed < 12 && (await target.evaluate((element) => element !== document.activeElement)); pressed += 1)
      await page.keyboard.press('ArrowRight');
    if (await target.evaluate((element) => element !== document.activeElement))
      throw new Refused(`the arrow keys reach ${what} of the first finished row — they do not`);
  };
  await reach(row.locator(`a[href="/runs/${run.id}"]`), "the title's link");
  await reach(row.locator('[data-copy-id] button'), 'the copy control');
  await page.keyboard.press('Enter');
  await expectVisible(row.locator('[data-copy-id][data-copied]'), 'Enter on the copy control of a finished row copies its id');
  const edges = await page
    .locator('section[data-section="finished"] [data-run-id]')
    .evaluateAll((all) => all.map((id) => `${id.closest('[data-copied]') ? 'copied' : 'rest'} ${getComputedStyle(id).borderTopColor}`));
  const [lit, rest] = [edges.filter((edge) => edge.startsWith('copied')), new Set(edges.filter((edge) => edge.startsWith('rest')))];
  if (lit.length !== 1 || rest.size !== 1 || rest.has(lit[0].replace('copied', 'rest')))
    throw new Refused(`the box of the id just copied takes another colour than the others, for a moment — ${edges.join(' | ')}`);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  if (copied !== run.id)
    throw new Refused(`a finished row shows its id's end and copies it whole, ${run.id} — the clipboard holds "${copied}"`);
}

/** The points `across` to each side of `control`'s centre, `up` above it and `down` below it that do not answer the control. */
const missed = (control: Locator, across: number, up: number, down: number): Promise<string[]> =>
  control.evaluate(
    (button, [dx, above, below]) => {
      const box = button.getBoundingClientRect();
      const [cx, cy] = [box.left + box.width / 2, box.top + box.height / 2];
      const points: Array<[number, number]> = [
        [cx - dx, cy],
        [cx + dx, cy],
        [cx, cy - above],
        [cx, cy + below],
      ];
      return points.flatMap(([x, y]) =>
        document.elementFromPoint(x, y)?.closest('button') === button ? [] : [`${Math.round(x - cx)},${Math.round(y - cy)}`],
      );
    },
    [across, up, down] as const,
  );

/**
 * What the page guarantees a finger on a copy control: 48 pixels across everywhere; on a card from the title's lower edge, 12 above
 * its centre, to 24 below it; in a table 40 down, from 24 above its centre to 16 below, where the target of the next row's control
 * begins. Probed a pixel inside each edge, the pointer away so that no step's card stands open; and the probe refuses a control whose
 * target something clips.
 */
async function finger(page: Page, open: OpenRuns, finished: FinishedPage): Promise<void> {
  const controls: Array<[Locator, number, number, string]> = [
    [cardOf(page, open.waiting[0].id).locator('[data-copy-id] button'), 11, 23, 'a card'],
    [section(page, 'in-flight').locator('tr[data-run] [data-copy-id] button').first(), 23, 15, 'a row in flight'],
    [section(page, 'finished').locator(`tr[data-run="${finished.runs[1].id}"] [data-copy-id] button`), 23, 15, 'a finished row'],
  ];
  await page.mouse.move(0, 0);
  await expectCount(page.locator('[data-slot="preview-card"]'), 0, "no step's card left open by a pointer resting on a bar");
  for (const [control, up, down, where] of controls) {
    await control.scrollIntoViewIfNeeded();
    const off = await missed(control, 23, up, down);
    if (off.length)
      throw new Refused(
        `the copy control of ${where} answers a finger 48 across, from ${up + 1} above its centre to ${down + 1} below — not at ${off.join(' and ')} of its centre`,
      );
  }
  const clip = await page.addStyleTag({ content: '[data-copy-id] { overflow: hidden }' });
  const off = await missed(controls[2][0], 23, 23, 15);
  await clip.evaluate((style) => (style as HTMLStyleElement).remove());
  if (!off.length) throw new Refused('the probe refuses a copy control whose target is clipped — it found nothing cut');
}

/**
 * The Clock cell's button of `row`, reached by the table's own arrow keys from the row: the keyboard alone, which is what makes the
 * focus a visible one and so opens the preview — React Aria opens a tooltip on focus only where the focus came from the keyboard.
 */
async function reachClock(page: Page, row: Locator, where: string): Promise<Locator> {
  const clock = row.locator('td[data-clock] button');
  await row.scrollIntoViewIfNeeded();
  await row.focus();
  const elsewhere = () => clock.evaluate((found) => found !== document.activeElement);
  for (let at = 0; at < 14 && (await elsewhere()); at += 1) await page.keyboard.press('ArrowRight');
  if (await elsewhere()) throw new Refused(`the arrow keys reach the Clock cell's button along a ${where} row — they do not`);
  return clock;
}

/**
 * The Clock column of both tables says the run's time at work, which is what `runClock` writes for a row, and never its wall time: a run
 * that waited an hour for others to land said `1h 33m` while it had worked for minutes, and one that has filed nothing says `not
 * started`. A preview over the words breaks that clock down — the rows the waiting card's Clock tile shows, with the wall time as the
 * foot — opened by the keyboard alone, with no request heard, and closed by Escape. Both tables, and the open preview, are pictured.
 */
async function clocksSay(page: Page, open: OpenRuns, finished: FinishedPage): Promise<void> {
  const tables = [
    { where: 'in-flight' as const, at: Date.parse(open.asOf), done: false, runs: open.inFlight },
    { where: 'finished' as const, at: Date.parse(finished.asOf), done: true, runs: finished.runs },
  ];
  let wallsDiffered = 0;
  for (const table of tables) {
    const words = await section(page, table.where)
      .locator('tr[data-run] td[data-clock] [data-clock-words]')
      .evaluateAll((all) => all.map((at) => (at.textContent ?? '').trim()));
    const want = table.runs.map((run) => runClock(run, table.at, table.done, 'row').words);
    if (words.join('|') !== want.join('|'))
      throw new Refused(`the ${table.where} Clock column says the time at work — expected ${want.join(', ')}, found ${words.join(', ')}`);
    wallsDiffered += table.runs.filter((run, i) => words[i] !== sinceShort(run.wallMs)).length;
    await photograph(section(page, table.where), path.join(OUT, `runs-table-${table.where}-${await themeOf(page)}.png`));
  }
  if (!wallsDiffered)
    throw new Refused("the seed holds a run whose wall time is not its time at work: without one the column's words prove nothing");

  for (const table of tables) {
    const row = section(page, table.where).locator('tr[data-run]').first();
    const id = await row.getAttribute('data-run');
    const asked: string[] = [];
    const hear = (request: { url(): string }) => void (request.url().includes(`/api/runs/${id}`) && asked.push(request.url()));
    await row.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    page.on('request', hear);
    await row.locator('td[data-clock] button').hover();
    await expectVisible(tooltip(page), `the Clock cell of a ${table.where} row opens its preview on a resting pointer`);
    const rows = await tooltip(page)
      .locator('[data-breakdown-row]')
      .evaluateAll((all) => all.map((row) => row.getAttribute('data-breakdown-row') ?? ''));
    for (const what of ['Sessions at work', 'Checks running', 'Waiting on you', 'Queued for a slot'])
      if (!rows.includes(what))
        throw new Refused(`the ${table.where} preview holds the waiting card's own rows — it holds ${rows.join(', ')}`);
    await expectVisible(tooltip(page).locator('[data-breakdown-row="Waiting on you"] dd'), 'each row with its figure');
    page.off('request', hear);
    if (asked.length)
      throw new Refused(`the preview opens with no request: the row carries its clock — the page asked ${asked.join(', ')}`);
    await page.mouse.move(0, 0);
    await expectCount(tooltip(page), 0, 'the pointer gone, it closes');

    await reachClock(page, row, table.where);
    await expectVisible(tooltip(page), `and the ${table.where} row's clock opens it on focus too, with no pointer`);
    const described = await focused(page).getAttribute('aria-describedby');
    if (!described) throw new Refused(`the ${table.where} Clock cell is described by its preview while it shows`);
    await photograph(page, path.join(OUT, `runs-clock-preview-${table.where}-${await themeOf(page)}.png`));
    await page.keyboard.press('Escape');
    await expectCount(tooltip(page), 0, 'Escape closes it');
  }
}

/** A row in flight and a finished row say their plain facts: the factory, the steps, what it does now; how it ended, and when. */
async function rowsSay(page: Page, open: OpenRuns, finished: FinishedPage): Promise<void> {
  const flying = open.inFlight.find((run) => !run.unreadable)!;
  const row = section(page, 'in-flight').locator(`tr[data-run="${flying.id}"]`);
  await expectTexts(row.locator(`a[href="/runs/${flying.id}"]`), [titleOf(flying)], 'a row in flight says its title, a link to the run');
  await expectTexts(row.locator('[data-run-id]'), [flying.id], 'its id');
  await expectCount(row.locator('[data-run-steps] [data-step]'), flying.steps.length, 'its own steps as a rail');
  await expectVisible(row.locator('[data-now-word]'), 'and what it does now');
  await expectTexts(
    section(page, 'in-flight').locator('th'),
    ['Run', 'Steps', 'Now', 'Clock', 'Cost'],
    'the table in flight has its columns',
  );
  await expectTexts(
    section(page, 'finished').locator('th'),
    ['Run', 'Factory', 'Created', 'Finished', 'Clock', 'Cost', 'Outcome', 'Id'],
    'the finished table has its columns',
  );
  await expectVisible(page.locator('section[data-section="finished"] [data-plate-hue="grey"]'), 'the Finished plate is at rest, in grey');
  const heads = await page.locator('[data-runs-page] th').evaluateAll((all) =>
    all.map((th) => {
      const style = getComputedStyle(th);
      return `${style.textTransform} ${style.fontSize} ${style.fontWeight}`;
    }),
  );
  if (heads.length !== 13 || heads.some((head) => head !== 'uppercase 11px 600'))
    throw new Refused(
      `every heading of the two tables is in the look's small caps, the small label role in capitals — ${heads.join(', ')}`,
    );
  await expectTexts(
    section(page, 'finished').locator('tr[data-run] [data-ended]'),
    finished.runs.map((run) => endedWords(run.outcome).word),
    'each finished row says how it ended, newest finished first as the api pages them',
  );
  await expectTexts(
    section(page, 'finished').locator('tr[data-run] [data-run-id]'),
    finished.runs.map((run) => run.id.slice(-4)),
    "and its id's end",
  );
  const asOf = new Date(finished.asOf);
  const whens = finished.runs.map((run) => [run.createdAt, run.finishedAt].map((at) => agoWords(new Date(at), asOf)).join('|'));
  await expectNone(async () => {
    const said = await section(page, 'finished')
      .locator('tr[data-run]')
      .evaluateAll((rows) => rows.map((row) => [...row.querySelectorAll('time')].map((time) => time.textContent).join('|')));
    return said.join() === whens.join() ? null : `expected ${whens.join(', ')}, found ${said.join(', ')}`;
  }, 'a finished row says how long ago it was created and how long ago it finished, as `agoWords` writes it');
  const titles = await section(page, 'finished')
    .locator('tr[data-run] time')
    .evaluateAll((all) => all.map((time) => time.getAttribute('title') ?? ''));
  if (!titles.length || titles.some((title) => !/\d{4}, \d{1,2}:\d{2}:\d{2} [AP]M$/.test(title)))
    throw new Refused(`each of them carries the whole instant on hover — ${titles.join(', ')}`);
  const drawn = await section(page, 'finished')
    .locator('tr[data-run] time')
    .evaluateAll((all) =>
      all.map((time) => {
        const cell = time.closest('td')!;
        const box = cell.getBoundingClientRect();
        const style = getComputedStyle(cell);
        return {
          words: time.textContent ?? '',
          width: Math.round(time.scrollWidth),
          room: Math.round(box.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)),
        };
      }),
    );
  const refused = agosRefused(drawn);
  if (refused !== null) throw new Refused(refused);
  await expectTexts(page.locator('[data-pager-rows]'), [rowsSaid(finished)], 'the pager says the rows of the first page');
}

/** What the browser draws of each element `marks` finds under the runs page: the facts of its type, and how it is cut and lit. */
const drawnOf = (page: Page, marks: string) =>
  page
    .locator('[data-runs-page]')
    .locator(marks)
    .evaluateAll((all) =>
      all.map((element) => {
        const style = getComputedStyle(element);
        return {
          face: style.fontFamily,
          tracking: style.letterSpacing,
          cut: element.closest('[data-cut-tag]') ? getComputedStyle(element.closest('[data-cut-tag]')!).clipPath : 'none',
          bars: style.backgroundImage,
          glow: style.boxShadow,
        };
      }),
    );

/** Refuses with `said` unless `marks` finds at least one element and each is drawn with `fact` at `want`. */
async function expectDrawn(page: Page, marks: string, fact: 'tracking' | 'cut', want: string, said: string): Promise<void> {
  const found = (await drawnOf(page, marks)).map((drawn) => drawn[fact]);
  if (!found.length || found.some((value) => value !== want)) throw new Refused(`${said} — ${marks}: ${found.join(', ') || 'none drawn'}`);
}

const TAG_CUT = 'polygon(0px 0px, calc(100% - 7px) 0px, 100% 7px, 100% 100%, 0px 100%)';

/** What the browser draws of a run's titles, the short ids' boxes, the rule under the page's name and the bars of steps done. */
async function lookRules(page: Page): Promise<void> {
  await page.mouse.move(0, 0);
  const titles = await page
    .locator('[data-runs-page] [data-text-link]')
    .evaluateAll((all) => all.map((link) => getComputedStyle(link).textDecorationLine));
  if (!titles.length || titles.some((line) => line !== 'none'))
    throw new Refused(`a run's title carries no line at rest — ${titles.join(', ') || 'no title'}`);
  const ids = await page
    .locator('section[data-section="finished"] [data-run-id]')
    .evaluateAll((all) => all.map((id) => `${getComputedStyle(id).borderTopWidth} ${getComputedStyle(id).paddingLeft}`));
  if (!ids.length || ids.some((box) => box !== '1px 6px')) throw new Refused(`a short id stands in its box — ${ids.join(', ') || 'no id'}`);
  const whole = await page
    .locator('section[data-section="waiting"] [data-run-id]')
    .evaluateAll((all) => all.map((id) => getComputedStyle(id).borderTopWidth));
  if (!whole.length || whole.some((width) => width !== '0px'))
    throw new Refused(`a card's whole id stands in no box — ${whole.join(', ')}`);
  const rule = await page.locator('[data-page-name]').evaluate((name) => {
    const text = document.createRange();
    text.selectNodeContents(name.querySelector('[data-page-name-text]')!.firstChild!);
    const [word, lit, line] = [
      text.getBoundingClientRect(),
      name.querySelector('[data-page-rule-lit]')!,
      name.querySelector('[data-page-rule]')!,
    ];
    const at = lit.getBoundingClientRect();
    const under = Math.round(at.left) === Math.round(word.left) && Math.round(at.right) === Math.round(word.right);
    return `${under ? 'lit under the name' : `lit ${Math.round(at.width)}px under a ${Math.round(word.width)}px name`}, ${getComputedStyle(line).height} thick, ${getComputedStyle(name).paddingBottom} under the name`;
  });
  if (rule !== 'lit under the name, 1px thick, 18px under the name')
    throw new Refused(`the rule under the page's name is lit under the whole name — ${rule}`);
  const done = await page
    .locator('[data-runs-page] [data-step]')
    .evaluateAll((all) =>
      all
        .filter((bar) => ['verified', 'unverified'].includes((bar as HTMLElement).dataset.state ?? ''))
        .map((bar) => `${(bar as HTMLElement).dataset.state} ${getComputedStyle(bar).backgroundColor}`),
    );
  const fills = new Set(done.map((bar) => bar.split(' ').slice(1).join(' ')));
  if (!done.some((bar) => bar.startsWith('unverified')) || fills.size !== 1 || fills.has('rgba(0, 0, 0, 0)'))
    throw new Refused(`a step done is filled, on a check or on its own word — ${done.join(' | ') || 'no step done in a rail'}`);
}

/**
 * The details of the look, as the browser draws them: each label role's tracking where it is written, the two tags that say a state
 * cut and the factory's whole, a barcode of its own on each plate, the pager's buttons in the face of a heading, and the rail's lit bars.
 */
async function lookDetails(page: Page): Promise<void> {
  await expectDrawn(page, 'th', 'tracking', '1.1px', 'a heading is the small label, tracked by a tenth of its 11 pixels');
  await expectDrawn(page, '[data-step-name]', 'tracking', '1.1px', "a rail's name is tracked by a tenth of its 11 pixels");
  await expectDrawn(
    page,
    '[data-wait-tag] span, [data-now-word] span, article [data-factory] span',
    'tracking',
    '0.72px',
    'a tag is tracked by six hundredths of its 12 pixels',
  );
  await expectDrawn(page, '[data-cut-button] [data-cut-shape]', 'tracking', '0.84px', 'the cut button, by six hundredths of its 14');
  await expectDrawn(page, '[data-pager-newer], [data-pager-older]', 'tracking', '0.84px', "the pager's buttons, as the cut button");
  await expectDrawn(page, '[data-wait-tag], [data-now-word]', 'cut', TAG_CUT, 'a tag that says a state has its top-right corner cut');
  await expectDrawn(page, 'article [data-factory]', 'cut', 'none', "a factory's tag is whole");
  const bars = (await drawnOf(page, '[data-plate-barcode]')).map((drawn) => drawn.bars);
  if (bars.length !== 3 || new Set(bars).size !== 3 || bars.some((image) => !image.startsWith('repeating-linear-gradient')))
    throw new Refused(`each of the three plates carries a barcode of its own — ${bars.join(' | ')}`);
  const [head] = await drawnOf(page, 'th');
  const buttons = await drawnOf(page, '[data-pager-newer], [data-pager-older]');
  const [count] = await drawnOf(page, '[data-pager-rows]');
  if (buttons.length !== 2 || buttons.some((button) => button.face !== head.face || button.face === count.face))
    throw new Refused(
      `the pager's buttons are in the face of a heading, not the mono of its counts — ${buttons.map((b) => b.face).join(' | ')}; a heading ${head.face}; a count ${count.face}`,
    );
  for (const [state, lit, what] of [
    ['working', ' [data-step-breath]', 'the step at work glows, on a layer of its own'],
    ['awaiting-approval', '', 'the step that waits on a person is edged in its hue and glows'],
  ] as const) {
    const glows = (await drawnOf(page, `[data-step][data-state="${state}"]${lit}`)).map((drawn) => drawn.glow);
    if (!glows.length || glows.some((glow) => glow === 'none' || (state !== 'working' && !glow.includes('inset'))))
      throw new Refused(`${what} — ${glows.join(' | ') || `no step ${state} in a rail`}`);
  }
  await lookRules(page);
  const rest = (await drawnOf(page, '[data-step]:not([data-state="working"])')).map((drawn) => drawn.glow);
  if (!rest.includes('none') || rest.some((glow) => glow !== 'none' && !glow.includes('inset')))
    throw new Refused(`a step that neither works nor waits on a person carries no glow — ${rest.join(' | ')}`);
}

/** The parts of the page this change draws, each as a picture of its own, three times the size: `runs-<what>-<theme>.png`. */
const CLOSE_UPS = {
  foot: (page: Page) => section(page, 'waiting').locator('article[data-run] [data-foot]').first(),
  'copy-card': (page: Page) => section(page, 'waiting').locator('article[data-run] h3').first().locator('xpath=..'),
  'copy-flight': (page: Page) => section(page, 'in-flight').locator('tr[data-run] td').first(),
  'finished-row': (page: Page) => section(page, 'finished').locator('tr[data-run]').first(),
} as const;

/**
 * The page's small parts photographed three times their size, in a window of the visit's own size and scheme opened for it and
 * closed after: a card's foot, the copy control on a card, in a row in flight and in a finished row, and a card's title with the
 * keyboard on it, its ring around it. Opens nothing unless the page is pictured.
 */
async function closeUps(page: Page): Promise<void> {
  if (!photographing) return;
  const theme = (await themeOf(page)) as 'light' | 'dark';
  const context = await page.context().browser()!.newContext({ colorScheme: theme, viewport: page.viewportSize(), deviceScaleFactor: 3 });
  try {
    const near = await context.newPage();
    await near.goto(page.url(), { waitUntil: 'load' });
    await idle(near);
    await expectVisible(near.locator('[data-runs-page="loaded"]'), 'the page is drawn in the window that pictures it enlarged');
    for (const [what, part] of Object.entries(CLOSE_UPS)) {
      await part(near).scrollIntoViewIfNeeded();
      await photograph(part(near), path.join(OUT, `runs-${what}-${theme}.png`));
    }
    const title = section(near, 'waiting').locator('article[data-run] h3 a').first();
    await section(near, 'waiting').locator('article[data-run]').first().scrollIntoViewIfNeeded();
    await near.keyboard.press('Tab');
    await title.focus();
    await expectVisible(section(near, 'waiting').locator('h3 a[data-focus-visible]'), 'the keyboard is on the title, and its ring shows');
    await photograph(CLOSE_UPS['copy-card'](near), path.join(OUT, `runs-title-ring-${theme}.png`));
  } finally {
    await context.close();
  }
}

/** Each row in flight's id, the left edges of its copy control and its factory, and what the line holds inside its cell, in pixels. */
const flightLines = (page: Page) =>
  section(page, 'in-flight')
    .locator('tr[data-run]:has([data-factory])')
    .evaluateAll((rows) =>
      rows.map((row) => {
        const [control, factory] = [row.querySelector('[data-copy-id] button')!, row.querySelector('[data-factory]')!];
        const [button, named, cell] = [control, factory, factory.closest('td')!].map((part) => part.getBoundingClientRect());
        const y = named.top + named.height / 2;
        return {
          id: row.getAttribute('data-run')!,
          control: Math.round(button.left),
          factory: Math.round(named.left),
          over: Math.round(named.right - (cell.right - parseFloat(getComputedStyle(factory.closest('td')!).paddingRight))),
          pressed: document.elementFromPoint(named.left + 1, y)?.closest('[data-factory]') !== factory,
        };
      }),
    );

/**
 * The second line of every row in flight lines up: each copy control at one edge and each factory at one edge, whatever the length of
 * each id; and the seed holds ids of more than one length, or the rule would hold for nothing.
 */
async function flightAligned(page: Page): Promise<void> {
  const lines = await flightLines(page);
  if (new Set(lines.map((line) => line.id.length)).size < 2)
    throw new Refused(`the runs in flight hold ids of more than one length — ${lines.map((line) => line.id).join(', ')}`);
  for (const edge of ['control', 'factory'] as const) {
    const at = lines.map((line) => line[edge]);
    if (Math.max(...at) - Math.min(...at) > 1)
      throw new Refused(
        `every ${edge} of a row in flight stands at one left edge — ${lines.map((line) => `${line.id} ${line[edge]}`).join(', ')}`,
      );
  }
}

/** Each row in flight's second line inside its cell, its factory under no copy control's target. */
async function flightWhole(page: Page): Promise<void> {
  for (const line of await flightLines(page)) {
    await section(page, 'in-flight').locator(`tr[data-run="${line.id}"] [data-factory]`).scrollIntoViewIfNeeded();
    const [again] = (await flightLines(page)).filter((each) => each.id === line.id);
    if (again.over > 0 || again.pressed)
      throw new Refused(
        `at 390 wide the second line of ${line.id} is whole, its factory clear of the copy control — ${JSON.stringify(again)}`,
      );
  }
}

/** At 390 wide nothing breaks: the document does not scroll sideways, the cards stack, and each table scrolls inside its frame. */
async function narrow(page: Page): Promise<void> {
  const size = page.viewportSize() ?? { width: 1280, height: 800 };
  await page.setViewportSize({ width: 390, height: 844 });
  try {
    await expectNone(async () => {
      const [wide, window] = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
      return wide <= window ? null : `the document is ${wide} wide in a window of ${window}`;
    }, 'at 390 wide the page does not scroll sideways');
    const lefts = await section(page, 'waiting')
      .locator('article[data-run]')
      .evaluateAll((cards) => cards.map((card) => Math.round(card.getBoundingClientRect().left)));
    if (new Set(lefts).size !== 1)
      throw new Refused(`at 390 wide the cards stack in one column — their left edges are ${lefts.join(', ')}`);
    const boxes = await page
      .locator('[data-table-box]')
      .evaluateAll((all) => all.map((box) => [box.scrollWidth, box.clientWidth, getComputedStyle(box).overflowX] as const));
    if (boxes.length !== 2 || boxes.some(([wide, shown, how]) => wide <= shown || how !== 'auto'))
      throw new Refused(`at 390 wide each table scrolls sideways inside its frame — ${JSON.stringify(boxes)}`);
    await flightWhole(page);
  } finally {
    await page.setViewportSize(size);
  }
}

/** REGATED written into the worker's store and said on the feed, and the page loaded again on it. */
async function regated(page: Page): Promise<void> {
  writeRegated(store!, Date.now());
  fed(REGATED.id, 'build', 'awaiting approval');
  await page.reload({ waitUntil: 'load' });
  await idle(page);
  await expectCount(cardOf(page, REGATED.id), 1, `${REGATED.id}, written at its second gate, has its card`);
}

/** REGATED taken out of the worker's store, whatever of it was written, and the feed told. */
function regatedBack(): void {
  for (const file of regatedFiles(store!)) fs.rmSync(file, { recursive: true, force: true });
  fed(REGATED.id, 'gone');
}

/** What the page asserts while REGATED is in the store, from its two reads to the menu's places and back. */
async function withRegated(page: Page): Promise<void> {
  await regated(page);
  const open = await answered<OpenRuns>(page, '/api/runs-open');
  const finished = await answered<FinishedPage>(page, `/api/runs-finished?page=1&size=${FINISHED_SIZE}`);
  await twoReads(page);
  await threeParts(page, open, finished);
  for (const run of open.waiting) {
    await cardSays(page, run);
    await waitSaid(page, run, open.asOf);
  }
  await gatesSay(page);
  const costly = open.waiting.find((run) => run.id === COSTLY.id);
  if (!costly?.clock || !costly.stepCosts) throw new Refused(`${COSTLY.id} waits on you, and the api breaks its clock and its cost down`);
  await photographBothWidths(page, OUT, 'runs', 'page');
  await closeUps(page);
  await footAtRight(page, open, costly);
  await copyDrawn(page, open, finished);
  await titleKeepsItsBox(page, open);
  await byKeyboard(page, costly);
  await secondGate(page, open);
  await tableByKeyboard(page, finished);
  await finger(page, open, finished);
  await rowsSay(page, open, finished);
  await clocksSay(page, open, finished);
  await flightAligned(page);
  await lookDetails(page);
  await narrow(page);
  await contrastHolds(page, ['[data-sentence]']);

  await enterOnPlace(page, 'Inbox', '/inbox');
  await expectVisible(railPlace(page, 'Inbox').and(litOf(page)), 'reached with Enter, the Inbox is lit in the menu');
  await enterOnPlace(page, 'Runs', '/runs');
  await expectCount(
    section(page, 'waiting').locator('article[data-run]'),
    open.counts.waiting,
    'back on Runs with Enter, its cards are drawn',
  );
}

export default {
  /**
   * The runs page, "Your move first": on two reads and never the whole list, a card for every run that waits on a person and no row of
   * it, the runs in flight and one page of the finished as quiet tables, each under a plate that says the api's count. A card says its
   * plain words, how long it has waited this time, and opens its run; its button stands at the card's right, under its tiles or beside
   * them; its tiles open their breakdowns, and its id is copied, from the keyboard; a finger finds the copy control, and the title
   * above it keeps its box; 390 wide breaks nothing; and no text pair is under 4.5:1 in either scheme. The menu's
   * places are reached with Enter in the page, to the Inbox and back. It writes REGATED, the run at its second gate, for itself, and
   * takes it back at its end, on a refusal too.
   */
  name: 'runs',
  route: '/runs',
  expect: async (page) => {
    await sidebar(page);
    try {
      await withRegated(page);
    } finally {
      regatedBack();
    }
    await expectCount(cardOf(page, REGATED.id), 0, `${REGATED.id} taken back, its card goes`);
  },
} satisfies PageSpec;
