import type { Locator, Page, Request } from 'playwright';
import { type CardList, DEFAULT_NAMESPACE, LIST_PAGE } from 'objects';
import { entriesOf } from '../../../src/lib/api/inbox.ts';
import { cardsEnded, cardsInPlay } from '../../../src/lib/inbox.ts';
import { PLACES_SAID } from '../board.ts';
import { expectCount, expectTexts, expectVisible, idle, Refused } from '../checks.ts';
import { QUEUE, QUEUED } from '../seed.ts';
import type { PageSpec } from '../visit.ts';

/** A card on the Inbox page, by its name. */
const cardIn = (page: Page, name: string) => page.locator(`section[aria-label="Cards"] li[data-card="${name}"]`) satisfies Locator;

/** The path of a request's address. */
const pathOf = (request: Request) => new URL(request.url()).pathname;

/** What the api answers at `pathname`, read apart from the page. */
async function answer<T>(page: Page, pathname: string) {
  return (await (await page.request.get(new URL(pathname, page.url()).href)).json()) as T;
}

/**
 * Every request the page sends while `work` runs.
 * @param page The page.
 * @param work What the page does meanwhile.
 */
async function heardDuring(page: Page, work: () => Promise<void>) {
  const heard: Request[] = [];
  const hear = (request: Request) => heard.push(request);
  page.on('request', hear);
  try {
    await work();
  } finally {
    page.off('request', hear);
  }
  return heard;
}

/**
 * Opens the default factory's Inbox, every request kept: none reads every card of every factory, and its cards are asked of its own
 * namespace, the ended ones included (no field selector). Its In play and Ended counts are the api's own of the default factory's cards,
 * its queued card of no factory says its place in the whole queue, and a queued card of another factory is not listed.
 * @param page The page.
 */
async function readsItsOwn(page: Page) {
  const heard = await heardDuring(page, async () => {
    await page.goto(new URL(`/factories/${DEFAULT_NAMESPACE}/inbox`, page.url()).href, { waitUntil: 'load' });
    await expectVisible(cardIn(page, QUEUE.third.name), `the default factory's Inbox lists its queued card ${QUEUE.third.name}`);
    await idle(page);
  });
  const every = heard.filter((r) => pathOf(r) === '/api/cards');
  if (every.length > 0)
    throw new Refused(`a factory's Inbox never asks every card of every factory — it asked ${every.map((r) => r.url()).join(', ')}`);
  const own = heard.filter((r) => r.method() === 'GET' && pathOf(r) === `/api/namespaces/${DEFAULT_NAMESPACE}/cards`);
  if (!own.some((r) => !new URL(r.url()).searchParams.has('fieldSelector')))
    throw new Refused(
      `a factory's Inbox asks its own namespace's cards, the ended ones too, with no field selector — it asked ${own.map((r) => r.url()).join(', ') || 'none'}`,
    );

  const whole = entriesOf(await answer<CardList>(page, `/api/cards?limit=${LIST_PAGE.most}`)).filter((e) => e.factory === null);
  await expectTexts(
    page.locator('[data-cards-count="in play"]'),
    [`· ${cardsInPlay(whole).length}`],
    "In play counts the default factory's cards in play, as the api answers them",
  );
  await expectTexts(
    page.locator('[data-cards-count="ended"]'),
    [`· ${cardsEnded(whole).length}`],
    "Ended counts the default factory's cards whose run ended, as the api answers them",
  );
  const place = PLACES_SAID[QUEUED.indexOf(QUEUE.third)];
  await expectTexts(
    cardIn(page, QUEUE.third.name).locator('[data-queued]'),
    [`queued · ${place}`],
    `${QUEUE.third.name} says its place in the whole queue (${place}), not among its factory's alone`,
  );
  await expectCount(cardIn(page, QUEUE.first.name), 0, `${QUEUE.first.name}, another factory's queued card, is not listed`);
}

export default {
  /**
   * A factory's Inbox reads its own cards, never every card of every factory: the route's loader and the page share one read of its
   * namespace, ended cards included; its counts are the api's of its cards, and its queued card keeps its place in the whole queue. Writes
   * nothing.
   */
  name: 'inbox-factory-reads',
  route: `/factories/${DEFAULT_NAMESPACE}`,
  expect: readsItsOwn,
} satisfies PageSpec;
