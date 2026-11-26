import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page, Response } from 'playwright';
import { LIST_PAGE, type RunList } from 'objects';
import {
  FINISHED_SELECTOR,
  FINISHED_SIZE,
  finishedOf,
  OPEN_SELECTOR,
  openOf,
  type FinishedPage,
  type ListedRun,
  type OpenRuns,
  type WaitingRun,
} from '../../../src/lib/api/runs.ts';
import { judged } from '../../../src/lib/api/judged.ts';
import type { WorkflowPageAddress } from '../../../src/lib/api/address.ts';
import { rowsSaid } from '../../../src/lib/finished.ts';
import { workflowNameOf } from '../../../src/lib/api/workflows.ts';
import { runClock, titleOf } from '../../../src/lib/factory.ts';
import { tokensBreakdown } from '../../../src/lib/breakdown.ts';
import { durationWords } from '../../../src/lib/duration.ts';
import { agoWords, nowOf, presentWait } from '../../../src/lib/runWords.ts';
import { ENDED, OPENS } from '../../../src/lib/words.ts';
import {
  answered,
  fed,
  photograph,
  photographBothWidths,
  reachClock,
  sidebar,
  themeOf,
  railPlace,
  litOf,
  finishedAnswered,
  openAnswered,
  runListPath,
  tipsOf,
} from '../board.ts';
import { expectBeneath, expectCount, expectNone, expectTexts, expectTwoDeep, expectVisible, idle, Refused, WAIT_MS } from '../checks.ts';
import { agosRefused } from '../runs-times.ts';
import { contrastHolds } from '../runs-contrast.ts';
import { COSTLY, REGATED, regatedFiles, writeRegated } from '../seed.ts';
import { seated } from '../served.ts';
import type { PageSpec } from '../visit.ts';
import { dropStoredRun, OUT, photographing, store } from '../world.ts';

/**
 * A place in the menu pressed with Enter, as from the keyboard: the page is not loaded again, and the history has one entry more, as after
 * a click. The browser clicks a link on Enter's keydown, and React Aria lets that click through: only the root's `RouterProvider` keeps it
 * from loading the whole page. Nothing else in the e2e presses a link from the keyboard.
 */
async function enterOnPlace(page: Page, place: string, route: string) {
  const before = await page.evaluate(() => {
    (window as unknown as { e2eNotReloaded?: true }).e2eNotReloaded = true;
    return history.length;
  });
  await railPlace(page, place).focus();
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
async function asksOf(page: Page) {
  const again = await page.context().newPage();
  const asked: string[] = [];
  again.on('request', (request) => {
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.pathname.startsWith('/api/')) asked.push(decodeURIComponent(`${url.pathname}${url.search}`));
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

/** The two reads of the page: the RunList of the runs not finished, every page of it, and the first page of the finished, nine of them. */
const TWO_READS = [
  `/api/runs?limit=${LIST_PAGE.most}&fieldSelector=${OPEN_SELECTOR}`,
  `/api/runs?limit=${FINISHED_SIZE}&fieldSelector=${FINISHED_SELECTOR}`,
];

/** The page asks its two reads of the RunList by state, and never the whole list. */
async function twoReads(page: Page) {
  const asked = await asksOf(page);
  for (const read of TWO_READS)
    if (!asked.includes(read)) throw new Refused(`the Runs page asks GET ${read} — it asked ${[...new Set(asked)].join(', ')}`);
  if (asked.includes(`/api/runs?limit=${LIST_PAGE.most}`))
    throw new Refused('the Runs page never asks GET /api/runs, the whole list — it did');
}

/** The three sections, by their names. */
const section = (page: Page, name: 'waiting' | 'in-flight' | 'finished') =>
  page.locator(`section[data-section="${name}"]`) satisfies Locator;

/** The card of the waiting run `id`. */
const cardOf = (page: Page, id: string) => section(page, 'waiting').locator(`article[data-run="${id}"]`) satisfies Locator;

/**
 * The three parts as the api counts them: a card for every run that waits and no row of it, a row for every run in flight, a page of
 * the finished, each under a count chip that says the api's count in the section's colour, quiet at zero, and stands alone on its
 * line; and nothing of the list the page was.
 */
async function threeParts(page: Page, open: OpenRuns, finished: FinishedPage) {
  await expectTexts(page.getByRole('heading', { level: 1 }), ['Runs'], "the page's header is its name");
  const heads = (await page.getByRole('heading', { level: 2 }).allTextContents()).map((head) => head.replace(/^\d+/, '').trim());
  if (heads.join('|') !== 'Waiting on you|In flight|Finished')
    throw new Refused(`its three sections, what waits on you first, each headed by its count — ${heads.join(', ')}`);
  for (const [name, count, tone] of [
    ['waiting', open.counts.waiting, 'yours'],
    ['in-flight', open.counts.inFlight, 'alive'],
    ['finished', open.counts.finished, 'rest'],
  ] as const) {
    const chip = section(page, name).locator('[data-count-chip]');
    const said = await chip.evaluate((tag) => `${tag.getAttribute('data-count-chip')} ${tag.getAttribute('data-count-tone')}`);
    if (said !== `${count} ${count === 0 ? 'quiet' : tone}`)
      throw new Refused(`the count chip of ${name} says the api's count, ${count}, in its colour, ${tone} — it says ${said}`);
    const beside = await chip
      .locator('xpath=ancestor::h2/..')
      .evaluate((line) => [...line.children].filter((other) => other.tagName !== 'H2').map((other) => other.outerHTML));
    if (name !== 'waiting' && beside.length) throw new Refused(`the count chip of ${name} stands alone on its line — ${beside.join(' ')}`);
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
  const said = (await page.locator('[data-now-word], [data-now-words], th, [data-ended], [data-pager]').allInnerTexts()).join('\n');
  const told = /\bgit\b|\bbranch|\bmerge|\bcommit|worktree|--|\bnemia [a-z]+ /i.exec(said);
  if (told) throw new Refused(`the page's own words say nothing of git and repeat no command — it says "${told[0]}"`);
  if (/\d+s\b/.test(await section(page, 'in-flight').innerText()))
    throw new Refused('no time on the page counts seconds: each is a fact to the minute');
}

/**
 * The card of `run` says how long it has waited on a person this time, since the api's `waitingSince`, and nothing where it is null:
 * its present wait at the instant of the answer the page drew it from (`given`), never of the check's own read a moment later.
 */
async function waitSaid(page: Page, run: WaitingRun, given: () => Given) {
  const figure = cardOf(page, run.id).locator('[data-waited]');
  if (run.waitingSince === null)
    return await expectCount(figure, 0, `the card of ${run.id}, whose wait the api does not date, says no wait`);
  await expectNone(async () => {
    const open = given().open;
    const drawn = open?.waiting.filter(judged).find((waiting) => waiting.id === run.id);
    if (!open || !drawn) return `the page was given no RunList of the runs not finished holding ${run.id} to draw its card against`;
    const wait = presentWait(drawn, new Date(open.asOf));
    const said = (await figure.allInnerTexts()).map((text) => text.trim().toLowerCase());
    return said.length === 1 && wait !== null && said[0] === `waited ${wait}`
      ? null
      : `it says "${said.join(' | ')}", and its present wait is ${wait}`;
  }, `the card of ${run.id} says how long it has waited this time, since ${run.waitingSince}`);
}

/** The whole minutes a figure says, of `2h 05m` or `25m`; none for `under 1m` and `none`. */
const minutesIn = (said: string) => {
  const [, h, m] = /(?:(\d+)h)?\s*(?:(\d+)m)?$/.exec(said.replace(/^under 1m$/, '')) ?? [];
  return Number(h ?? 0) * 60 + Number(m ?? 0);
};

/**
 * REGATED, at its second gate: its card says the present wait, minutes long, while the api keeps every wait on a person summed, over
 * twenty minutes. A card that read the sum would say the sum's figure.
 */
async function secondGate(page: Page, open: OpenRuns) {
  const run = open.waiting.filter(judged).find((waiting) => waiting.id === REGATED.id);
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
      .replace(/^waited /, ''),
  );
  if (waited < 1 || waited >= 10)
    throw new Refused(`the card of ${REGATED.id} says its wait at the second gate, a few minutes — it says ${waited} minutes`);
  await photograph(card, path.join(OUT, `runs-card-second-gate-${await themeOf(page)}.png`));
}

/**
 * A waiting run's card says its meta line (its id's end, its whole id on hover), its title as a link, the yellow chip of the step it
 * waits on you at and the words of what is asked (`nowOf`), its own steps as a short rail, each bar a button that opens its step's
 * card, and one quiet button, which opens the run's page.
 */
async function cardSays(page: Page, run: WaitingRun) {
  const card = cardOf(page, run.id);
  const open = `[href="/runs/${run.id}"]`;
  const now = nowOf(run);
  if (!now) throw new Refused(`${run.id}, which waits on you, has a step it is on now`);
  const chip = await card.locator('[data-now-word]').evaluate((tag) => `${tag.textContent} ${tag.getAttribute('data-tone')}`);
  if (chip !== `${now.step} yours`) throw new Refused(`the card of ${run.id} draws its step in the yellow chip — it draws ${chip}`);
  await expectTexts(
    card.locator('[data-now-words]'),
    [now.words.map((part) => (typeof part === 'string' ? part : part.run.slice(-4))).join(' ')],
    `the card of ${run.id} says what is asked of you`,
  );
  await expectTexts(card.getByRole('heading', { level: 3 }).locator(`a${open}`), [titleOf(run)], "the run's title, a link to its page");
  await expectTexts(card.locator(`[data-copy-id="${run.id}"] [data-run-id]`), [run.id.slice(-4)], "its id's end");
  if ((await tipsOf(card.locator('[data-run-id]'), "the card's id")).join() !== run.id)
    throw new Refused(`the card of ${run.id} says its whole id in the kit's tooltip`);
  await expectCount(card.locator('[data-run-steps] [data-step]'), run.steps.length, 'its own steps as its graph');
  await expectCount(card.locator('[data-step-name]'), 0, 'a graph that names no step under its nodes');
  await expectTexts(card.locator(`a[data-cut-button]${open}`), [OPENS], "one quiet button, which opens the run's page");
  await expectCount(card.locator('[data-cut-button]'), 1, 'and only one');
  await expectCount(card.locator('button[data-step-bar]'), run.steps.length, "each node of its graph a button that opens its step's card");
  const clocks = await card.locator('button[data-clock-words]').count();
  if (clocks > 1) throw new Refused(`the card of ${run.id} draws its clock once — it draws ${clocks}`);
  await expectCount(
    card.locator('button:not([data-step-bar])'),
    1 + (run.cost && run.tokens ? 1 : 0) + clocks,
    'and no control more than the copy of its id and the previews of its clock and its cost: nothing is decided from the list',
  );
}

/** Where a card's button stands against its rail, and how far its right edge is from the foot's. */
const footOf = (card: Locator) =>
  card.locator('[data-foot]').evaluate((foot) => {
    const [rail, button] = ['[data-run-steps]', '[data-cut-button]'].map((part) => foot.querySelector(part)!.getBoundingClientRect());
    return {
      beside: button.top < rail.bottom && button.bottom > rail.top,
      fromRight: Math.round(foot.getBoundingClientRect().right - button.right),
    };
  }) satisfies Promise<{ beside: boolean; fromRight: number }>;

/** A window wider than the visit's, where the cards stand two side by side. */
const WIDE = 1680;

/**
 * The button of every card stands at the card's right, beside its rail, in the window the visit is in and in one `WIDE` across. The
 * foot of `run`'s card is photographed at each width, and the window put back.
 */
async function footAtRight(page: Page, open: OpenRuns, run: WaitingRun) {
  const size = page.viewportSize() ?? { width: 1280, height: 800 };
  try {
    for (const [width, place] of [
      [size.width, 'visit'],
      [WIDE, 'wide'],
    ] as const) {
      await page.setViewportSize({ width, height: size.height });
      await expectNone(async () => {
        const at = await footOf(cardOf(page, run.id));
        return at.beside && at.fromRight === 0 ? null : JSON.stringify(at);
      }, `${width} wide, the button of ${run.id}'s card is beside its rail, at the card's right`);
      for (const other of open.waiting) {
        const at = await footOf(cardOf(page, other.id));
        if (at.fromRight !== 0)
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
const copyOf = (holder: Locator) =>
  holder.evaluate((copy) => {
    const box = (part: string) => copy.querySelector(part)!.getBoundingClientRect();
    const [glyph, id] = [box('[data-copy-glyph]'), box('[data-run-id]')];
    return {
      glyph: `${glyph.width} by ${glyph.height}`,
      gap: Math.round(glyph.left - id.right),
      line: Math.round(copy.getBoundingClientRect().height),
    };
  }) satisfies Promise<{ glyph: string; gap: number; line: number }>;

/**
 * The copy control as the canvas draws it, on a card and in each table: its glyph 12 pixels across, 7 from the id; and on a card its
 * line, the meta line, 18 pixels tall (body-small's line), over the title.
 */
async function copyDrawn(page: Page, open: OpenRuns, finished: FinishedPage) {
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
  const over = await card.locator('[data-copy-id]').evaluate((copy) => {
    const title = copy.closest('article')!.querySelector('h3')!.getBoundingClientRect();
    return Math.round(title.top - copy.getBoundingClientRect().bottom);
  });
  const { line } = await copyOf(holders[0][0]);
  if (line !== 18 || over < 0) throw new Refused(`on a card the id's line is 18 pixels tall, over the title — ${line} tall, ${over} over`);
}

/** A title long enough to run under the copy control over it, and short enough to stay on one line of a card. */
const OVER = 'A title that runs under the copy control';

/**
 * A press on a card's title opens the run, on its highest row too, nearest the copy control's target: with a title that runs under
 * the control written into the first card and taken out again, the point a pixel inside the title's upper edge, under the control's
 * centre, answers the title's link.
 */
async function titleKeepsItsBox(page: Page, open: OpenRuns) {
  const card = cardOf(page, open.waiting[0].id);
  await card.scrollIntoViewIfNeeded();
  const hit = await card.evaluate((article, over) => {
    const link = article.querySelector('h3 a')!;
    const text = document.createTreeWalker(link, NodeFilter.SHOW_TEXT).nextNode()!;
    const was = text.nodeValue;
    text.nodeValue = over;
    try {
      const button = article.querySelector('[data-copy-id] button')!.getBoundingClientRect();
      const [x, cy] = [button.left + button.width / 2, button.top + button.height / 2];
      const rows = [...link.getClientRects()];
      const row = rows[0];
      const at = document.elementFromPoint(x, row.top + 1);
      return {
        rows: rows.length,
        under: x > row.left && x < row.right,
        below: Math.round(row.top - cy),
        title: at?.closest('a') === link,
        tag: at?.tagName ?? 'nothing',
      };
    } finally {
      text.nodeValue = was;
    }
  }, OVER);
  if (hit.rows !== 1 || !hit.under || hit.below >= 24)
    throw new Refused(`the title written runs under the copy control, near its target — ${JSON.stringify(hit)}`);
  if (!hit.title)
    throw new Refused(`a press on the highest row of a card's title, under the copy control, opens the run — it lands on ${hit.tag}`);
}

/** The element the keyboard is on. */
const focused = (page: Page) => page.locator(':focus') satisfies Locator;

/** The tooltip that shows. */
const tooltip = (page: Page) => page.locator('[data-slot="tooltip"]') satisfies Locator;

/**
 * The keyboard's path over COSTLY's card: its copy control, which Enter presses; from its title, Tab reaches the rail's bars; from the
 * last bar its cost, whose preview opens on focus with the run's tokens and closes on Escape, asking the api nothing; then the button.
 * The preview is photographed.
 */
async function byKeyboard(page: Page, run: WaitingRun) {
  const card = cardOf(page, run.id);
  await card.scrollIntoViewIfNeeded();
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const asked: string[] = [];
  const hear = (request: { url(): string }) => void (request.url().includes(`/api/runs/${run.id}`) && asked.push(request.url()));
  await card.locator('[data-copy-id] button').focus();
  await page.keyboard.press('Enter');
  await expectVisible(card.locator('[data-copy-id][data-copied]'), 'Enter on the copy control copies, and the control says so');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  if (copied !== run.id) throw new Refused(`the copy control copies the run's whole id, ${run.id} — the clipboard holds "${copied}"`);
  await expectTexts(card.locator('[data-copy-id] [role="status"]'), ['Copied'], 'and says it to a screen reader');
  await card.getByRole('heading', { level: 3 }).locator('a').focus();
  for (let pressed = 0; pressed < 6 && !(await card.locator('button[data-step-bar]:focus').count()); pressed += 1)
    await page.keyboard.press('Tab');
  await expectVisible(
    card.locator('button[data-step-bar]').first().locator(':scope:focus'),
    "Tab from the title reaches the rail's first bar",
  );
  await card.locator('button[data-step-bar]').last().focus();
  await page.keyboard.press('Escape');
  await expectCount(page.locator('[data-slot="preview-card"]'), 0, "Escape on the rail's last bar leaves no step's card open");

  page.on('request', hear);
  await page.keyboard.press('Tab');
  await expectVisible(card.locator('[data-cost] button[data-cost-words]:focus'), 'Tab from the last bar reaches the cost');
  await expectVisible(tooltip(page), 'and its preview opens on focus, with no pointer');
  const head = (await tooltip(page).locator('[data-slot="tooltip-headline"]').innerText()).trim();
  if (!head.startsWith(COSTLY.cost)) throw new Refused(`the cost's preview is headed by the cost, ${COSTLY.cost} — it says "${head}"`);
  if ((await tooltip(page).locator('[data-breakdown-row]').count()) < 2) throw new Refused("the cost's preview has the tokens' rows");
  const described = await focused(page).getAttribute('aria-describedby');
  if (!described) throw new Refused('the cost is described by its preview while it shows');
  await photograph(page, path.join(OUT, `runs-tooltip-cost-${await themeOf(page)}.png`));
  await page.keyboard.press('Escape');
  await expectCount(tooltip(page), 0, 'Escape closes it');
  page.off('request', hear);
  await page.keyboard.press('Tab');
  await expectVisible(card.locator('a[data-cut-button]:focus'), 'then Tab reaches the button that opens the run');
  if (asked.length)
    throw new Refused(`a preview opens with no request: the light answer carries its rows — the page asked ${asked.join(', ')}`);
}

/**
 * In a table the keyboard reaches a row, then, with the arrow keys, the title's link and the copy control, which Enter presses: no
 * pointer.
 */
async function tableByKeyboard(page: Page, finished: FinishedPage) {
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
    .evaluateAll((all) => all.map((id) => `${id.closest('[data-copied]') ? 'copied' : 'rest'} ${getComputedStyle(id).color}`));
  const [lit, rest] = [edges.filter((edge) => edge.startsWith('copied')), new Set(edges.filter((edge) => edge.startsWith('rest')))];
  if (lit.length !== 1 || rest.size !== 1 || rest.has(lit[0].replace('copied', 'rest')))
    throw new Refused(`the id just copied takes another colour than the others, for a moment — ${edges.join(' | ')}`);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  if (copied !== run.id)
    throw new Refused(`a finished row shows its id's end and copies it whole, ${run.id} — the clipboard holds "${copied}"`);
}

/** The points `across` to each side of `control`'s centre, `up` above it and `down` below it that do not answer the control. */
const missed = (control: Locator, across: number, up: number, down: number) =>
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
  ) satisfies Promise<string[]>;

/**
 * What the page guarantees a finger on a copy control: 48 pixels across everywhere; on a card from 24 above its centre to 12 below
 * it, where the title under it begins; in a table 40 down, from 24 above its centre to 16 below, where the target of the next row's control
 * begins. Probed a pixel inside each edge, the pointer away so that no step's card stands open; and the probe refuses a control whose
 * target something clips.
 */
async function finger(page: Page, open: OpenRuns, finished: FinishedPage) {
  const controls: Array<[Locator, number, number, string]> = [
    [cardOf(page, open.waiting[0].id).locator('[data-copy-id] button'), 23, 11, 'a card'],
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
 * The Clock column of both tables says the run's time at work, which is what `runClock` writes for a row at the instant of the answer
 * the page drew it from (`given`; the finished page's clocks stand still), and never its wall time: a run
 * that waited an hour for others to land said `1h 33m` while it had worked for minutes, and one that has filed nothing says `not
 * started`. A preview over the words breaks that clock down — the rows the waiting card's Clock tile shows, with the wall time as the
 * foot — opened by the keyboard alone, with no request heard, and closed by Escape. Both tables, and the open preview, are pictured.
 */
async function clocksSay(page: Page, finished: FinishedPage, given: () => Given) {
  type Clocked = ListedRun | FinishedPage['runs'][number];
  const tables = ['in-flight', 'finished'] as const;
  const drawnWith = (where: (typeof tables)[number]) => {
    if (where === 'finished')
      return { at: Date.parse(finished.asOf), done: true, runs: finished.runs } satisfies {
        at: number;
        done: boolean;
        runs: readonly Clocked[];
      } | null;
    const open = given().open;
    return (open ? { at: Date.parse(open.asOf), done: false, runs: open.inFlight.filter(judged) } : null) satisfies {
      at: number;
      done: boolean;
      runs: readonly Clocked[];
    } | null;
  };
  let wallsDiffered = 0;
  for (const where of tables) {
    let said: { words: string[]; runs: readonly Clocked[] } = { words: [], runs: [] };
    await expectNone(async () => {
      const drawn = drawnWith(where);
      if (!drawn) return 'the page was given no RunList of the runs not finished to draw its rows against';
      const words = await section(page, where)
        .locator('tr[data-run] td[data-clock] [data-clock-words]')
        .evaluateAll((all) => all.map((at) => (at.textContent ?? '').trim()));
      said = { words, runs: drawn.runs };
      const want = drawn.runs.map((run) => runClock(run, drawn.at, drawn.done, 'row').words);
      return words.join('|') === want.join('|') ? null : `expected ${want.join(', ')}, found ${words.join(', ')}`;
    }, `the ${where} Clock column says the time at work, against the instant of the answer the page drew`);
    wallsDiffered += said.runs.filter((run, i) => said.words[i] !== durationWords(run.wallMs, 'minute')).length;
    await photograph(section(page, where), path.join(OUT, `runs-table-${where}-${await themeOf(page)}.png`));
  }
  if (!wallsDiffered)
    throw new Refused("the seed holds a run whose wall time is not its time at work: without one the column's words prove nothing");

  for (const where of tables) {
    const row = section(page, where).locator('tr[data-run]').first();
    const id = await row.getAttribute('data-run');
    const asked: string[] = [];
    const hear = (request: { url(): string }) => void (request.url().includes(`/api/runs/${id}`) && asked.push(request.url()));
    await row.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    page.on('request', hear);
    await row.locator('td[data-clock] button').hover();
    await expectVisible(tooltip(page), `the Clock cell of a ${where} row opens its preview on a resting pointer`);
    const rows = await tooltip(page)
      .locator('[data-breakdown-row]')
      .evaluateAll((all) => all.map((row) => row.getAttribute('data-breakdown-row') ?? ''));
    for (const what of ['Sessions at work', 'Checks running', 'Waiting on you', 'Queued for a slot'])
      if (!rows.includes(what)) throw new Refused(`the ${where} preview holds the waiting card's own rows — it holds ${rows.join(', ')}`);
    await expectVisible(tooltip(page).locator('[data-breakdown-row="Waiting on you"] dd'), 'each row with its figure');
    page.off('request', hear);
    if (asked.length)
      throw new Refused(`the preview opens with no request: the row carries its clock — the page asked ${asked.join(', ')}`);
    await page.mouse.move(0, 0);
    await expectCount(tooltip(page), 0, 'the pointer gone, it closes');

    await reachClock(page, row, where);
    await expectVisible(tooltip(page), `and the ${where} row's clock opens it on focus too, with no pointer`);
    const described = await focused(page).getAttribute('aria-describedby');
    if (!described) throw new Refused(`the ${where} Clock cell is described by its preview while it shows`);
    await photograph(page, path.join(OUT, `runs-clock-preview-${where}-${await themeOf(page)}.png`));
    await page.keyboard.press('Escape');
    await expectCount(tooltip(page), 0, 'Escape closes it');
  }
}

/**
 * What the page writes into the runs' answers, in the browser alone, for each table's Cost cell to be read: the seed prices no run in
 * flight and none on the finished page. The first row in flight costs `≥$3.21`, a session of it unmeasured; the first finished row
 * `$1.07`, every session measured. Each one's tokens add up kind by kind to their total.
 */
const PRICED = {
  'in-flight': {
    cost: { usd: 3.21, measured: 2, unmeasured: 1, said: '≥$3.21' },
    tokens: {
      total: 2_480_000,
      input: 2_300_000,
      output: 180_000,
      cacheRead: 2_050_000,
      cacheWrite: 190_000,
      uncached: 60_000,
      measured: 2,
      unmeasured: 1,
      said: '≥2.48M tokens',
      split: '',
    },
  },
  finished: {
    cost: { usd: 1.07, measured: 1, unmeasured: 0, said: '$1.07' },
    tokens: {
      total: 812_400,
      input: 776_000,
      output: 36_400,
      cacheRead: 701_000,
      cacheWrite: 47_000,
      uncached: 28_000,
      measured: 1,
      unmeasured: 0,
      said: '812k tokens',
      split: '',
    },
  },
};

/** The runs of each table an answer at `url` carries, if it is one of the two RunLists by state the runs page reads. */
const rowsAt = (url: URL, body: unknown) => {
  const field = url.pathname === '/api/runs' ? url.searchParams.get('fieldSelector') : null;
  const items = (body as Partial<RunList>).items ?? [];
  if (field === OPEN_SELECTOR)
    return [['in-flight', items.filter((run) => run.status.state === 'inFlight')]] satisfies Array<[keyof typeof PRICED, RunList['items']]>;
  return (field === FINISHED_SELECTOR ? [['finished', items]] : []) satisfies Array<[keyof typeof PRICED, RunList['items']]>;
};

/** An answer of the runs page with each table's first run priced (`PRICED`), in its status. */
const pricedIn = <T>(url: URL, body: T) => {
  for (const [table, rows] of rowsAt(url, body)) if (rows[0]) Object.assign(rows[0].status, PRICED[table]);
  return body satisfies T;
};

/** The runs page's two answers with each table's first row priced, routed in the page and let go by `back`. */
async function pricedRows(page: Page) {
  const isRuns = (url: URL) => rowsAt(url, { items: [] }).length > 0;
  await page.route(isRuns, async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: pricedIn(new URL(route.request().url()), await response.json()) });
  });
  await page.reload({ waitUntil: 'load' });
  await idle(page);
  const read = async (pathname: string) => pricedIn(new URL(pathname, page.url()), await answered<RunList>(page, pathname));
  const open = openOf(await read(runListPath(undefined, { fieldSelector: OPEN_SELECTOR })));
  const finished = finishedOf(await read(runListPath(undefined, { fieldSelector: FINISHED_SELECTOR, limit: String(FINISHED_SIZE) })));
  const back = async () => {
    await page.unroute(isRuns);
    await page.reload({ waitUntil: 'load' });
    await idle(page);
  };
  return { open, finished, back } satisfies { open: OpenRuns; finished: FinishedPage; back: () => Promise<void> };
}

/**
 * Each table's Cost cell opens a preview of its run's tokens by kind, from the row the list carries and asking the api nothing: on a
 * resting pointer, and on the keyboard's focus, which Escape closes. Its head is the cost's words over the total, its rows the kinds the
 * board's own rule gives (`tokensBreakdown`), and the words keep inside their cell. The rows are priced by the page itself (`PRICED`):
 * the one in flight, a session of which measured no tokens, heads with `≥`; the finished one, whole, without.
 */
async function costsSay(page: Page) {
  const priced = await pricedRows(page);
  try {
    const short = await costSays(page, 'in-flight', priced.open.inFlight.filter(judged));
    if (!short.includes('≥2.48M tokens'))
      throw new Refused(`a run a session of which measured no tokens says its total is the least it was, with ≥ — it says "${short}"`);
    const whole = await costSays(page, 'finished', priced.finished.runs);
    if (whole.includes('≥')) throw new Refused(`a run every session of which measured its tokens says no ≥ — it says "${whole}"`);
  } finally {
    await priced.back();
  }
}

/** That the first row of `runs` with a cost and tokens, in the table `where`, opens the preview of its tokens; its headline as shown. */
async function costSays(page: Page, where: 'in-flight' | 'finished', runs: readonly ListedRun[]) {
  const run = runs.find((r) => r.cost && r.tokens);
  if (!run?.cost || !run.tokens) throw new Refused(`a ${where} row has a cost and tokens, for its preview to be read`);
  const want = tokensBreakdown(run.tokens, run.cost.said);
  const row = section(page, where).locator(`tr[data-run="${run.id}"]`);
  const over = await row.locator('td[data-cost] [data-cost-words]').evaluate((text) => {
    const cell = text.closest('td')!;
    const room = cell.getBoundingClientRect().right - parseFloat(getComputedStyle(cell).paddingRight);
    return Math.round(text.getBoundingClientRect().right - room);
  });
  if (over > 0) throw new Refused(`the ${where} cost's words keep inside their cell — they run ${over} px past it`);
  const asked: string[] = [];
  const hear = (request: { url(): string }) => void (request.url().includes(`/api/runs/${run.id}`) && asked.push(request.url()));
  await row.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  page.on('request', hear);
  await row.locator('td[data-cost] button').hover();
  await expectVisible(tooltip(page), `the Cost cell of a ${where} row opens its preview on a resting pointer`);
  await expectTexts(tooltip(page).locator('[data-slot="tooltip-headline"]'), [want.head], "headed by the cost's words over its tokens");
  const head = (await tooltip(page).locator('[data-slot="tooltip-headline"]').innerText()).trim();
  await expectTexts(
    tooltip(page).locator('[data-breakdown-row] dt'),
    want.rows.map((r) => r.what),
    'its rows are the kinds the tokens are counted in',
  );
  await expectTexts(
    tooltip(page).locator('[data-breakdown-row] dd'),
    want.rows.map((r) => r.said),
    'each with its count',
  );
  page.off('request', hear);
  if (asked.length) throw new Refused(`the preview opens with no request: the row carries its tokens — the page asked ${asked.join(', ')}`);
  await page.mouse.move(0, 0);
  await expectCount(tooltip(page), 0, 'the pointer gone, it closes');

  await reachClock(page, row, where, 'cost');
  await expectVisible(tooltip(page), `and the ${where} row's cost opens it on focus too, with no pointer`);
  await photograph(page, path.join(OUT, `runs-cost-preview-${where}-${await themeOf(page)}.png`));
  await page.keyboard.press('Escape');
  await expectCount(tooltip(page), 0, 'Escape closes it');
  return head;
}

/** The two RunLists by state as the page itself was last given them, the open one and the finished runs' first page. */
type Given = { open?: OpenRuns; finished?: FinishedPage };

/**
 * The two RunLists by state as the page itself was last given them, kept as each answer arrives: each one's `asOf` is the instant its
 * rows drew their words against. `answered` reads the api apart from the page and a moment later, so near a minute's edge its `asOf`
 * says another word than the page drew.
 */
function answersDrawn(page: Page) {
  const last: Given = {};
  const seen = (response: Response) => {
    const url = new URL(response.url());
    const field = url.pathname === '/api/runs' ? url.searchParams.get('fieldSelector') : null;
    const keep =
      field === OPEN_SELECTOR
        ? (body: RunList) => void (last.open = openOf(body))
        : field === FINISHED_SELECTOR && !url.searchParams.has('continue')
          ? (body: RunList) => void (last.finished = finishedOf(body))
          : null;
    if (keep && response.ok()) response.json().then(keep, () => undefined);
  };
  page.on('response', seen);
  return { last: () => ({ ...last }), stop: () => page.off('response', seen) } satisfies { last: () => Given; stop: () => void };
}

/**
 * A row in flight and a finished row say their plain facts: the id's end, the factory and workflow; in flight
 * the chip of what it does now in the tone `nowOf` gives it, its words never cut, and its rail; finished, how it ended, red only when it
 * failed, and when.
 */
async function rowsSay(page: Page, open: OpenRuns, finished: FinishedPage, given: () => Given) {
  const flying = open.inFlight.filter(judged)[0];
  const row = section(page, 'in-flight').locator(`tr[data-run="${flying.id}"]`);
  await expectTexts(row.locator(`a[href="/runs/${flying.id}"]`), [titleOf(flying)], 'a row in flight says its title, a link to the run');
  await expectTexts(row.locator(`[data-copy-id="${flying.id}"] [data-run-id]`), [flying.id.slice(-4)], "its id's end");
  if ((await tipsOf(row.locator('[data-run-id]'), "the row's id")).join() !== flying.id)
    throw new Refused(`the row of ${flying.id} says its whole id in the kit's tooltip`);
  await expectCount(row.locator('[data-run-steps] [data-step]'), flying.steps.length, 'its own steps as a rail');
  const flights = open.inFlight.filter(judged);
  const tones = await section(page, 'in-flight')
    .locator('tr[data-run]:has([data-now]) [data-now-word]')
    .evaluateAll((all) => all.map((chip) => `${chip.textContent} ${chip.getAttribute('data-tone')}`));
  const toned = flights.flatMap((run) => {
    const now = nowOf(run);
    return now ? [`${now.step} ${now.tone}`] : [];
  });
  if (tones.join('|') !== toned.join('|'))
    throw new Refused(
      `each row in flight draws its step in one chip, in its tone — expected ${toned.join(', ')}, found ${tones.join(', ')}`,
    );
  const cut = await section(page, 'in-flight')
    .locator('[data-now-words], [data-now-word]')
    .evaluateAll((all) => all.filter((words) => words.scrollWidth > words.clientWidth + 1).map((words) => words.textContent));
  if (cut.length) throw new Refused(`what a run does now is never cut — ${cut.join(', ')}`);
  await expectTexts(section(page, 'in-flight').locator('th'), ['Run', 'Now', 'Clock', 'Cost'], 'the table in flight has its columns');
  await expectTexts(
    section(page, 'finished').locator('th'),
    ['Run', 'Finished', 'Clock', 'Cost', 'Outcome'],
    'the finished table has its columns',
  );
  const inks = await section(page, 'finished')
    .locator('tr[data-run] [data-ended]')
    .evaluateAll((all) => all.map((ended) => `${ended.closest('tr')!.getAttribute('data-outcome')}|${getComputedStyle(ended).color}`));
  const [failedInk, restInk] = [inks.filter((ink) => ink.startsWith('failed|')), inks.filter((ink) => !ink.startsWith('failed|'))].map(
    (side) => new Set(side.map((ink) => ink.split('|')[1])),
  );
  if (restInk.size > 1 || failedInk.size > 1 || [...failedInk].some((ink) => restInk.has(ink)))
    throw new Refused(`an outcome is a plain word, red only when the run failed — ${inks.join(', ')}`);
  const heads = await page.locator('[data-runs-page] th').evaluateAll((all) =>
    all.map((th) => {
      const style = getComputedStyle(th.querySelector('[data-slot=typography]') ?? th);
      return `${style.textTransform} ${style.fontSize} ${style.fontWeight}`;
    }),
  );
  if (heads.length !== 9 || heads.some((head) => head !== 'uppercase 11px 600'))
    throw new Refused(
      `every heading of the two tables is in the look's small caps, the small label role in capitals — ${heads.join(', ')}`,
    );
  await expectTexts(
    section(page, 'finished').locator('tr[data-run] [data-ended]'),
    finished.runs.map((run) => ENDED[run.outcome].word),
    'each finished row says how it ended, newest finished first as the api pages them',
  );
  await expectTexts(
    section(page, 'finished').locator('tr[data-run] [data-run-id]'),
    finished.runs.map((run) => run.id.slice(-4)),
    "and its id's end",
  );
  await expectNone(async () => {
    const last = given().finished;
    if (!last) return 'the page was given no first page of the finished RunList to draw its rows against';
    const asOf = new Date(last.asOf);
    const whens = finished.runs.map((run) => agoWords(new Date(run.finishedAt), asOf));
    const said = await section(page, 'finished')
      .locator('tr[data-run]')
      .evaluateAll((rows) => rows.map((row) => [...row.querySelectorAll('time')].map((time) => time.textContent).join('|')));
    return said.join() === whens.join() ? null : `expected ${whens.join(', ')}, found ${said.join(', ')}`;
  }, 'a finished row says how long ago it finished, as `agoWords` writes it');
  const titles = await tipsOf(section(page, 'finished').locator('tr[data-run] time'), "the finished rows' times");
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
  const at = { trail: [], next: finished.continue, count: finished.runs.length, total: finished.total, size: FINISHED_SIZE };
  await expectTexts(page.locator('[data-pager-rows]'), [rowsSaid(at)], 'the pager says the rows of the first page');
}

/**
 * Where a finished run's workflow link leads: its workflow's page in the run's place where its lines page one (`workflowPage`), else the
 * Workflows page.
 */
const workflowAddress = (workflowPage: WorkflowPageAddress | null) =>
  (workflowPage
    ? {
        path: `/workflows/${encodeURIComponent(workflowPage.from)}/${encodeURIComponent(workflowPage.workflow)}`,
        search: {
          ...(workflowPage.factory ? { factory: workflowPage.factory } : {}),
          ...(workflowPage.repo ? { repo: workflowPage.repo } : {}),
        },
      }
    : { path: '/workflows', search: {} }) satisfies { path: string; search: Record<string, string> };

/** A URL's path and its search, read as the board writes them, the quotes of a JSON string taken off. */
const addressParts = (href: string) => {
  const url = new URL(href, 'http://board');
  const search = Object.fromEntries([...url.searchParams].map(([key, value]) => [key, value.replace(/^"(.*)"$/, '$1')]));
  return { path: url.pathname, search } satisfies { path: string; search: Record<string, string> };
};

/**
 * Each finished row names the workflow it ran, by its folder's name, the folder whole on hover, linked as `WorkflowLink` links a run's
 * workflow, and its title, where cut to its room, is whole on hover too; the first row's workflow link, pressed, leads to that
 * workflow's page, and the page comes back to Runs.
 */
async function workflowsSay(page: Page, finished: FinishedPage) {
  const links = section(page, 'finished').locator('tr[data-run] a[data-workflow]');
  await expectTexts(
    links,
    finished.runs.map((run) => workflowNameOf(run.workflowDir)),
    "each finished row names its workflow, by its folder's name",
  );
  const folders = await tipsOf(links, "the finished rows' workflows");
  const said = (await links.evaluateAll((all) => all.map((link) => link.getAttribute('href') ?? ''))).map((href, i) => ({
    title: folders[i] ?? '',
    href,
  }));
  const pages = await Promise.all(
    finished.runs.map(
      async (run) => (await answered<{ workflowPage: WorkflowPageAddress | null }>(page, `/api/runs/${run.id}/lines`)).workflowPage,
    ),
  );
  const wrong = finished.runs.flatMap((run, i) => {
    const want = workflowAddress(pages[i] ?? null);
    const got = addressParts(said[i]?.href ?? '');
    return said[i]?.title === run.workflowDir && JSON.stringify(got) === JSON.stringify(want)
      ? []
      : [`${run.id}: ${JSON.stringify(said[i])}, expected ${run.workflowDir} to ${JSON.stringify(want)}`];
  });
  if (wrong.length) throw new Refused(`each workflow is whole on hover and links to its page — ${wrong.join('; ')}`);
  const titles = section(page, 'finished').locator('tr[data-run] a[href^="/runs/"]');
  const cut = await titles.evaluateAll((all) => all.map((title) => title.scrollWidth - title.clientWidth > 1));
  const titled: string[] = [];
  for (const [i, isCut] of cut.entries()) if (isCut) titled.push(...(await tipsOf(titles.nth(i), "the finished rows' cut titles")));
  const whole = finished.runs.map(titleOf).filter((_, i) => cut[i]);
  if (titled.join('|') !== whole.join('|'))
    throw new Refused(`and each run's title cut to its room is whole on hover — ${titled.join(', ')}`);
  const [first] = finished.runs;
  if (!first) throw new Refused('the seed holds a finished run, to press its workflow');
  const want = workflowAddress(pages[0] ?? null);
  await links.first().click();
  await page.waitForURL((url) => url.pathname === want.path, { timeout: WAIT_MS });
  const at = addressParts(page.url());
  if (JSON.stringify(at) !== JSON.stringify(want))
    throw new Refused(`pressed, ${first.id}'s workflow leads to its page — at ${page.url()}, expected ${JSON.stringify(want)}`);
  await idle(page);
  await page.goBack();
  await page.waitForURL((url) => url.pathname === '/runs', { timeout: WAIT_MS });
  await expectCount(section(page, 'finished').locator('tr[data-run]'), finished.runs.length, 'back on Runs, its finished rows are drawn');
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
          cut: element.closest('[data-cut-tag] [data-cut-shape]')
            ? getComputedStyle(element.closest('[data-cut-tag] [data-cut-shape]')!).clipPath
            : 'none',
          bars: style.backgroundImage,
          glow: style.boxShadow,
        };
      }),
    );

/** Refuses with `said` unless `marks` finds at least one element and each is drawn with `fact` at `want`. */
async function expectDrawn(page: Page, marks: string, fact: 'tracking' | 'cut', want: string, said: string) {
  const found = (await drawnOf(page, marks)).map((drawn) => drawn[fact]);
  if (!found.length || found.some((value) => value !== want)) throw new Refused(`${said} — ${marks}: ${found.join(', ') || 'none drawn'}`);
}

const TAG_CUT = 'polygon(0px 0px, calc(100% - 7px) 0px, 100% 7px, 100% 100%, 0px 100%)';

/** What the browser draws of a run's titles, the short ids with no box, the rule under the page's name and the bars of steps done. */
async function lookRules(page: Page) {
  await page.mouse.move(0, 0);
  const titles = await page
    .locator('[data-runs-page] [data-text-link]')
    .evaluateAll((all) => all.map((link) => getComputedStyle(link).textDecorationLine));
  if (!titles.length || titles.some((line) => line !== 'none'))
    throw new Refused(`a run's title carries no line at rest — ${titles.join(', ') || 'no title'}`);
  const ids = await page
    .locator('[data-runs-page] [data-run-id]')
    .evaluateAll((all) => all.map((id) => `${getComputedStyle(id).borderTopWidth} ${getComputedStyle(id).paddingLeft}`));
  if (!ids.length || ids.some((box) => box !== '0px 0px')) throw new Refused(`a short id stands in no box — ${ids.join(', ') || 'no id'}`);
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
        .map((bar) => `${(bar as HTMLElement).dataset.state} ${getComputedStyle(bar.querySelector('svg > :last-child')!).fill}`),
    );
  const fills = new Set(done.map((bar) => bar.split(' ').slice(1).join(' ')));
  if (!done.some((bar) => bar.startsWith('unverified')) || fills.size !== 1 || fills.has('rgba(0, 0, 0, 0)'))
    throw new Refused(`a step done is filled, on a check or on its own word — ${done.join(' | ') || 'no step done in a rail'}`);
}

/**
 * The details of the look, as the browser draws them: each label role's tracking where it is written, the chips that say a state or a
 * count cut, the pager's buttons in the face of a heading, and only the step at work alive with a pulse.
 */
async function lookDetails(page: Page) {
  await expectDrawn(
    page,
    'th [data-slot=typography]',
    'tracking',
    '1.1px',
    'a heading is the small label, tracked by a tenth of its 11 pixels',
  );
  await expectDrawn(page, '[data-now-word] span', 'tracking', '0.72px', 'a chip is tracked by six hundredths of its 12 pixels');
  await expectDrawn(page, '[data-cut-button] [data-cut-shape]', 'tracking', '0.84px', 'the cut button, by six hundredths of its 14');
  await expectDrawn(
    page,
    '[data-pager-newer] [data-slot=typography], [data-pager-older] [data-slot=typography]',
    'tracking',
    '0.84px',
    "the pager's buttons, as the cut button",
  );
  await expectDrawn(
    page,
    '[data-now-word], [data-count-chip]',
    'cut',
    TAG_CUT,
    'a chip that says a state or a count has its top-right corner cut',
  );
  const [head] = await drawnOf(page, 'th [data-slot=typography]');
  const buttons = await drawnOf(page, '[data-pager-newer] [data-slot=typography], [data-pager-older] [data-slot=typography]');
  const [count] = await drawnOf(page, '[data-pager-rows]');
  if (buttons.length !== 2 || buttons.some((button) => button.face !== head.face || button.face === count.face))
    throw new Refused(
      `the pager's buttons are in the face of a heading, not the mono of its counts — ${buttons.map((b) => b.face).join(' | ')}; a heading ${head.face}; a count ${count.face}`,
    );
  if ((await page.locator('[data-step][data-state="working"] [data-step-pulse]').count()) === 0)
    throw new Refused('the step at work pulses, on a layer of its own — no step at work has its pulse');
  await lookRules(page);
  const stray = await page.locator('[data-step]:not([data-mark="alive"]) [data-step-pulse]').count();
  if (stray > 0) throw new Refused(`no node but the step at work, or its check, pulses — ${stray} others do`);
  const rest = (await drawnOf(page, '[data-step]')).map((drawn) => drawn.glow);
  if (rest.some((glow) => glow !== 'none')) throw new Refused(`no node's holder casts a glow of its own — ${rest.join(' | ')}`);
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
async function closeUps(page: Page) {
  if (!photographing) return;
  const theme = await themeOf(page);
  const context = await seated(
    await page.context().browser()!.newContext({ colorScheme: theme, viewport: page.viewportSize(), deviceScaleFactor: 3 }),
    page.url(),
  );
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
async function flightAligned(page: Page) {
  await expectVisible(section(page, 'in-flight').locator('tr[data-run]:has([data-factory])').first(), 'the rows in flight, read again');
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
async function flightWhole(page: Page) {
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
async function narrow(page: Page) {
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
async function regated(page: Page) {
  writeRegated(store!, Date.now());
  fed(REGATED.id, 'build', 'awaiting approval');
  await page.reload({ waitUntil: 'load' });
  await idle(page);
  await expectCount(cardOf(page, REGATED.id), 1, `${REGATED.id}, written at its second gate, has its card`);
}

/** REGATED taken out of the worker's store, whatever of it was written, and the feed told. */
function regatedBack() {
  for (const file of regatedFiles(store!)) fs.rmSync(file, { recursive: true, force: true });
  dropStoredRun(REGATED.id);
  fed(REGATED.id, 'gone');
}

/** What the page asserts while REGATED is in the store, from its two reads to the menu's places and back. */
async function withRegated(page: Page, drawn: () => Given) {
  await regated(page);
  const open = await openAnswered(page);
  const finished = await finishedAnswered(page);
  await twoReads(page);
  await threeParts(page, open, finished);
  for (const run of open.waiting.filter(judged)) {
    await cardSays(page, run);
    await waitSaid(page, run, drawn);
  }
  const costly = open.waiting.filter(judged).find((run) => run.id === COSTLY.id);
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
  await rowsSay(page, open, finished, drawn);
  await clocksSay(page, finished, drawn);
  await costsSay(page);
  await flightAligned(page);
  await lookDetails(page);
  await narrow(page);
  await contrastHolds(page, ['[data-now-words]']);

  await enterOnPlace(page, 'Agents', '/agents');
  await expectVisible(railPlace(page, 'Agents').and(litOf(page)), 'reached with Enter, Agents is lit in the rail');
  await enterOnPlace(page, 'Waiting', '/runs');
  await expectCount(
    section(page, 'waiting').locator('article[data-run]'),
    open.counts.waiting,
    'back on Runs with Enter, its cards are drawn',
  );
  await workflowsSay(page, finished);
}

export default {
  /**
   * The runs page, "Your move first": on two reads and never the whole list, a card for every run that waits on a person and no row of
   * it, the runs in flight and one page of the finished as quiet tables, each under a plate that says the api's count. A card says its
   * plain words, how long it has waited this time, and opens its run; its button stands at the card's right, under its tiles or beside
   * them; its tiles open their breakdowns, and its id is copied, from the keyboard; a finger finds the copy control, and the title
   * above it keeps its box; 390 wide breaks nothing; and no text pair is under 4.5:1 in either scheme. The menu's places are reached
   * with Enter in the page, to the Inbox and back, and a finished row's workflow, pressed, leads to its page. It writes REGATED, the run
   * at its second gate, for itself, and takes it back at its end, on a refusal too.
   */
  name: 'runs',
  route: '/runs',
  expect: async (page) => {
    await sidebar(page);
    const drawn = answersDrawn(page);
    try {
      await withRegated(page, drawn.last);
      await expectTwoDeep(page, 'the page is two boxes deep at most: a third box is a rule or a gap');
    } finally {
      drawn.stop();
      regatedBack();
    }
    await expectCount(cardOf(page, REGATED.id), 0, `${REGATED.id} taken back, its card goes`);
  },
} satisfies PageSpec;
