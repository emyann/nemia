import type { Page, Request, Route } from 'playwright';
import { expectClearOfPanels, onTheFloor } from '../canvas.ts';
import { expectCount, expectVisible, idle, Refused } from '../checks.ts';
import { QUEUED_IN } from '../seed.ts';
import type { PageSpec } from '../visit.ts';

/** The default floor's cards in play, as the floor asks them of the api. */
const CARDS = '**/api/namespaces/default/cards**';

/** Each factory's lines, which the pane's picker reads beside the floor. */
const COMMANDS = '**/api/factories/*/commands';

/** A read held until `release` is called: each request routed to it waits, then goes on to the api as it was sent. */
function held() {
  let release = () => {};
  const open = new Promise<void>((resolve) => {
    release = resolve;
  });
  const handler = async (route: Route) => {
    await open;
    await route.continue();
  };
  return { handler, release: () => release() };
}

/**
 * Opens the default floor with its cards' read and every factory's lines held, and sees the floor drawn first; then lets them go and sees
 * the queue's ghosts come beside it, the floor fitted again clear of its panels. Every request it sees is kept, and none reads every card
 * of every factory.
 * @param page The page.
 */
async function drawsBeforeTheCards(page: Page) {
  const cards = held();
  const commands = held();
  const heard: Request[] = [];
  const hear = (request: Request) => heard.push(request);
  page.on('request', hear);
  await page.route(CARDS, cards.handler);
  await page.route(COMMANDS, commands.handler);
  try {
    await page.goto(new URL('/factories/default', page.url()).href, { waitUntil: 'load' });
    await expectVisible(onTheFloor(page).card, "the floor draws its runs while its cards and the factories' lines are still asked");
    await expectCount(page.locator('aside[aria-label="Queued cards"]'), 0, 'and no queue lane before its cards are read');
  } finally {
    cards.release();
    commands.release();
  }
  try {
    await expectCount(
      page.locator('aside[aria-label="Queued cards"] a[data-ghost]'),
      QUEUED_IN.default.length,
      'once its cards are read, a ghost per queued card of no factory',
    );
    await idle(page);
    await expectClearOfPanels(page, 'after the queue came beside the floor');
    const every = heard.filter((r) => new URL(r.url()).pathname === '/api/cards');
    if (every.length > 0)
      throw new Refused(`the floor never asks every card of every factory — it asked ${every.map((r) => r.url()).join(', ')}`);
  } finally {
    page.off('request', hear);
    await page.unroute(CARDS, cards.handler);
    await page.unroute(COMMANDS, commands.handler);
  }
}

export default {
  /**
   * A factory's floor draws as soon as the factories and its open runs are read, never waiting on its cards nor on any factory's lines:
   * held, the floor's run is drawn and no lane yet; let go, the queue's ghosts come and the floor is fitted again clear of its panels. It
   * asks its cards of its own namespace, never every card. Writes nothing.
   */
  name: 'factory-cards-later',
  route: '/factories/default',
  expect: drawsBeforeTheCards,
} satisfies PageSpec;
