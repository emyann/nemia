import type { Locator, Page, Request } from 'playwright';
import { type CardList, DEFAULT_NAMESPACE } from 'objects';
import { expectCount, expectVisible, idle, Refused } from '../checks.ts';
import { QUEUE } from '../seed.ts';
import type { PageSpec } from '../visit.ts';

/** A card on the Inbox page, by its name. */
const cardIn = (page: Page, name: string) => page.locator(`[data-card="${name}"]`) satisfies Locator;

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
 * namespace, one page of them. Its Open and Closed counts are the api's own of the default factory's cards, its queued card of no factory
 * is listed, and a queued card of another factory is not.
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
  if (!own.some((r) => new URL(r.url()).searchParams.get('limit') === '12'))
    throw new Refused(
      `a factory's Inbox asks one page of its own namespace's cards — it asked ${own.map((r) => r.url()).join(', ') || 'none'}`,
    );

  const { metadata } = await answer<CardList>(page, `/api/namespaces/${DEFAULT_NAMESPACE}/cards?limit=1`);
  const c = metadata.counts;
  const said = async (side: 'open' | 'closed') => Number((await page.locator(`[data-cards-count="${side}"]`).textContent()) ?? '');
  const [open, closed] = [c.notStarted + c.blocked + c.waiting + c.working, c.done + c.failed + c.cancelled];
  if ((await said('open')) !== open) throw new Refused(`Open counts the default factory's cards in play, ${open}, as the api counts them`);
  if ((await said('closed')) !== closed) throw new Refused(`Closed counts its cards whose run ended, ${closed}, as the api counts them`);
  await expectCount(cardIn(page, QUEUE.first.name), 0, `${QUEUE.first.name}, another factory's queued card, is not listed`);
}

export default {
  /**
   * A factory's Inbox reads its own cards, never every card of every factory: the route's loader and the page share one page of its
   * namespace, and its counts are the api's of its cards. Writes nothing.
   */
  name: 'inbox-factory-reads',
  route: `/factories/${DEFAULT_NAMESPACE}`,
  expect: readsItsOwn,
} satisfies PageSpec;
