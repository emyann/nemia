import path from 'node:path';
import type { Locator, Page } from 'playwright';
import type { CardList } from 'objects';
import { answered, cardsPath, photograph, snackbarSaying, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled, WAIT_MS, watch } from '../checks.ts';
import { CARDS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { dropStoredCard, OUT, storedCard, storedCardNames } from '../world.ts';

/** The idea this page files from the New card sheet and takes back with Remove. */
const TITLE = 'Give the inbox a keyboard shortcut';

/** A card of the Inbox page, by its name, drawn in the grid or as a row. */
const cardIn = (page: Page, name: string) => page.locator(`[data-card="${name}"]`) satisfies Locator;

/** Every card of the Inbox page, in the order drawn. */
const cardsOf = (page: Page) => page.locator('section[aria-label="Cards"] [data-card]') satisfies Locator;

/** The names of the cards drawn, in order. */
const namesOf = (page: Page) => cardsOf(page).evaluateAll((all) => all.map((el) => el.getAttribute('data-card') ?? ''));

/** Open the Inbox of the board `page` shows, and wait for its reads. */
async function open(page: Page, route = '/inbox') {
  await page.goto(new URL(route, page.url()).href, { waitUntil: 'load' });
  await idle(page);
}

/** Refuses unless the count `side` says is `count`. */
async function expectCount_(page: Page, side: 'open' | 'closed', count: number) {
  const said = Number((await page.locator(`[data-cards-count="${side}"]`).textContent()) ?? '');
  if (said !== count) throw new Refused(`${side} says how many cards it holds as the api counts them — ${count}; it says ${said}`);
}

/** What the api counts of the whole inbox, by side: the cards in play and the cards whose run ended, as `metadata.counts` says. */
async function sidesOf(page: Page) {
  const { metadata } = await answered<CardList>(page, '/api/cards?limit=1');
  const c = metadata.counts;
  return { open: c.notStarted + c.blocked + c.waiting + c.working, closed: c.done + c.failed + c.cancelled };
}

/** The first page of the cards in play, newest first or oldest first, as the api answers it. */
async function firstOf(page: Page, order: 'metadata.creationTimestamp desc' | 'metadata.creationTimestamp') {
  const query = new URLSearchParams({ limit: '12', orderBy: order, fieldSelector: 'status.inPlay=true,status.chained=false' });
  return (await answered<CardList>(page, `/api/cards?${query.toString()}`)).items.map((card) => card.metadata.name);
}

/** The search: the words typed keep the cards they match, `q` in the address, a chip in the bar that takes them off. */
async function searched(page: Page) {
  const bar = page.getByRole('combobox', { name: 'Search the cards' });
  await bar.fill('render');
  await bar.press('Enter');
  await page.waitForURL((url) => url.searchParams.get('search') === 'render', { timeout: WAIT_MS });
  await idle(page);
  const kept = (await answered<CardList>(page, '/api/cards?limit=100&search=render')).items.map((card) => card.metadata.name);
  if (kept.length === 0) throw new Refused('the seed holds a card that says render, so the search keeps one');
  await expectVisible(cardIn(page, kept[0]), `the words keep ${kept[0]}`);
  await expectCount(cardsOf(page), kept.length, 'and only the cards the api keeps for them');
  await page.getByRole('button', { name: 'Take off “render”' }).click();
  await page.waitForURL((url) => !url.searchParams.has('search'), { timeout: WAIT_MS });
  await idle(page);
}

/**
 * A state picked in the bar is the state chips' own filter: `state:` offers the phases, the one picked sets `?phase=`, selects the same
 * chip under Open and Closed and shows as a chip in the bar, and taking the bar's chip off selects All again.
 */
async function stated(page: Page) {
  const bar = page.getByRole('combobox', { name: 'Search the cards' });
  await bar.fill('state:');
  const offered = page.getByRole('option').filter({ hasNotText: /\b0 cards$/ });
  await expectVisible(offered.first(), 'state: offers the phases that hold cards');
  const word = ((await offered.first().textContent()) ?? '')
    .replace(/^state:\s*/, '')
    .replace(/\s*\d+ cards?$/, '')
    .trim();
  await offered.first().click();
  await page.waitForURL((url) => url.searchParams.has('phase'), { timeout: WAIT_MS });
  await idle(page);
  const selected = page.locator('[aria-label="State"] [role="row"][aria-selected="true"]');
  const chip = ((await selected.textContent()) ?? '').toLowerCase();
  if (!chip.startsWith(word.toLowerCase()))
    throw new Refused(`the state picked in the bar is the chip selected — ${word}; the chip says ${chip}`);
  await page.getByRole('button', { name: /^Take off state: / }).click();
  await page.waitForURL((url) => !url.searchParams.has('phase'), { timeout: WAIT_MS });
  await idle(page);
  const all = ((await selected.textContent()) ?? '').toLowerCase();
  if (!all.startsWith('all')) throw new Refused(`taking the bar's state off selects All again — the chip says ${all}`);
}

/** The sort: Oldest puts the oldest first, kept in the address; Newest is the address without it. */
async function sorted(page: Page) {
  const newest = await firstOf(page, 'metadata.creationTimestamp desc');
  const oldest = await firstOf(page, 'metadata.creationTimestamp');
  await page.getByRole('radio', { name: /^Oldest/ }).click();
  await page.waitForURL((url) => url.searchParams.get('sort') === 'oldest', { timeout: WAIT_MS });
  await idle(page);
  await expectVisible(cardIn(page, oldest[0]), `Oldest lists ${oldest[0]} first`);
  const names = await namesOf(page);
  if (names[0] !== oldest[0]) throw new Refused(`Oldest puts ${oldest[0]} first — the page puts ${names[0]} first`);
  await page.getByRole('radio', { name: /^Newest/ }).click();
  await page.waitForURL((url) => !url.searchParams.has('sort'), { timeout: WAIT_MS });
  await idle(page);
  const again = await namesOf(page);
  if (again[0] !== newest[0]) throw new Refused(`Newest puts ${newest[0]} first — the page puts ${again[0]} first`);
}

/** The layout: Grid the first time; List draws rows, and the browser keeps the pick for the next load. */
async function laidOut(page: Page) {
  await expectVisible(page.locator('article[data-card]'), 'the first time, the cards are drawn in a grid of frames');
  await page.getByRole('radio', { name: /^List/ }).click();
  await expectCount(page.locator('article[data-card]'), 0, 'List draws no frame');
  await expectVisible(page.locator('tr[data-card]'), 'but a row of the table for each card');
  await open(page);
  await expectCount(page.locator('article[data-card]'), 0, 'the pick is kept: a load of the page is a list still');
  await page.getByRole('radio', { name: /^Grid/ }).click();
  await expectVisible(page.locator('article[data-card]'), 'Grid draws the frames again');
}

/** The sides: Open and Closed say how many cards each holds, as the api counts them, and Closed is kept in the address. */
async function sides(page: Page) {
  const counts = await sidesOf(page);
  await expectCount_(page, 'open', counts.open);
  await expectCount_(page, 'closed', counts.closed);
  await page.getByRole('radio', { name: /^Closed/ }).click();
  await page.waitForURL((url) => url.searchParams.get('cards') === 'closed', { timeout: WAIT_MS });
  await idle(page);
  await page.getByRole('radio', { name: /^Open/ }).click();
  await page.waitForURL((url) => !url.searchParams.has('cards'), { timeout: WAIT_MS });
  await idle(page);
}

/** `/`, pressed where nothing is typed, puts the focus in the search bar. */
async function slash(page: Page) {
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  await page.keyboard.press('/');
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null);
  if (focused !== 'Search the cards') throw new Refused(`/ focuses the search bar — the focus is on ${JSON.stringify(focused)}`);
  await page.keyboard.press('Escape');
}

/** A card filed from New card, listed at once, and taken off with Remove from its menu; the store is as it was after. */
async function filedAndRemoved(page: Page, theme: string) {
  const before = storedCardNames();
  await page.getByRole('button', { name: 'New card' }).click();
  const sheet = page.getByRole('dialog', { name: 'New card' });
  await expectVisible(sheet, 'New card opens its sheet');
  await sheet.getByRole('textbox', { name: 'Title' }).fill(TITLE);
  await settled(page);
  await photograph(page, path.join(OUT, `inbox-new-card-${theme}.png`), { fullPage: true });
  const [filed] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST' && cardsPath().test(new URL(r.url()).pathname), { timeout: WAIT_MS }),
    sheet.getByRole('button', { name: 'File card' }).click(),
  ]);
  if (filed.status() !== 201) throw new Refused(`the api files the card — it answered ${filed.status()}: ${await filed.text()}`);
  const { metadata } = (await filed.json()) as { metadata: { name: string } };
  const name = metadata.name;
  try {
    if (!(storedCard(name) ?? '').startsWith(TITLE))
      throw new Refused(`the card is filed as its title says — the store holds ${storedCard(name)}`);
    await snackbarSaying(page, name, 'the frame says the card was filed, naming it');
    await expectVisible(cardIn(page, name), `${name} is listed at once`);
    await page.getByRole('button', { name: `More actions on ${name}` }).click();
    const [dropped] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'DELETE' && cardsPath(name).test(new URL(r.url()).pathname), {
        timeout: WAIT_MS,
      }),
      page.getByRole('menuitem', { name: 'Remove' }).click(),
    ]);
    if (dropped.status() !== 200) throw new Refused(`the api drops the card — it answered ${dropped.status()}`);
    await expectCount(cardIn(page, name), 0, `Remove takes ${name} off the page`);
  } finally {
    dropStoredCard(name);
  }
  if (storedCardNames().join() !== before.join())
    throw new Refused('every card the page filed is taken back: the store holds what it held');
}

export default {
  /**
   * The Inbox: its counts as the api counts them, its search, a state picked in the bar, its sort, its layout kept in the browser,
   * Closed in the address, `/` into the search bar, and a card filed from New card and taken off with Remove. Every write is taken
   * back, so every page after this one, in either theme, reads the store as seeded.
   */
  name: 'inbox',
  route: '/inbox',
  expect: async (page) => {
    const theme = await themeOf(page);
    const { problems } = watch(page);
    await open(page);
    await expectVisible(cardIn(page, CARDS.bare.name), `${CARDS.bare.name}, a seeded card, is listed`);
    await settled(page);
    await photograph(page, path.join(OUT, `inbox-${theme}.png`), { fullPage: true });
    await sides(page);
    await searched(page);
    await stated(page);
    await sorted(page);
    await laidOut(page);
    await slash(page);
    await filedAndRemoved(page, theme);
    await idle(page);
    const seen = problems();
    if (seen.length)
      throw new Refused(`no console error and no failed request on the Inbox — ${seen.length} seen:\n    ${seen.join('\n    ')}`);
  },
} satisfies PageSpec;
