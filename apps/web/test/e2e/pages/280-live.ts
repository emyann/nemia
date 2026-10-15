import fs from 'node:fs';
import path from 'node:path';
import { fed, photograph, sidebar, themeOf, railPlace } from '../board.ts';
import { expectCount, expectVisible, FEED_STREAM, feedAnswered, idle, Refused, settled } from '../checks.ts';
import { GATED } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** How long a change on the feed may take to show: well under the minute the board polls at while it follows the feed, and under 5 s. */
const LIVE_MS = 3_000;

/** Longer than 5 s: a board that polled a run every 5 s would read it within this time. */
const OLD_POLL_WINDOW_MS = 6_000;

export default {
  /**
   * The board follows the workflow feed, and reads what moves on it at once: one stream for the page, kept across a navigation inside the
   * board. An approval written behind the page's back — through the api, as `wf approve` from a terminal would be — is not read while
   * nothing says so, for longer than a poll every 5 s would take; once the feed says plan moved, as the tick would, the page shows the
   * approval within `LIVE_MS`. Taken back the same way, so every page after this one, and this one in the other theme, reads the store as
   * seeded.
   */
  name: 'live',
  route: `/runs/${GATED.id}`,
  expect: async (page) => {
    await sidebar(page);
    const { id, gated } = GATED;
    const asks = path.join(store!, 'runs', `${id}.asks`);
    if (fs.existsSync(asks))
      throw new Refused(`the store is as seeded before the page approves anything — ${asks} holds ${fs.readdirSync(asks).join(', ')}`);
    const footer = page.locator('header[data-frame-header] [data-gauges-button][data-feed]');
    await feedAnswered(page);
    await expectVisible(footer.and(page.locator('[data-feed="open"]')), 'the gauges button says the feed is followed (data-feed="open")');
    await idle(page);

    let streams = 0;
    let reads = 0;
    page.on('request', (request) => {
      const { pathname } = new URL(request.url());
      if (pathname === FEED_STREAM) streams += 1;
      if (pathname === `/api/runs/${id}`) reads += 1;
    });

    await railPlace(page, 'Runs').click();
    await page.waitForURL(/\/runs$/);
    await page.locator(`a[href="/runs/${id}"]`).first().click();
    await page.waitForURL(new RegExp(`/runs/${id}$`));
    await idle(page);
    if (streams !== 0)
      throw new Refused(`one stream of the feed a page, kept across a navigation inside the board — ${streams} more opened`);
    if ((await footer.getAttribute('data-feed')) !== 'open')
      throw new Refused(`the feed is still followed after the navigation — the gauges button says ${await footer.getAttribute('data-feed')}`);

    const gate = page.locator(`section[aria-label="The gate of ${gated}"]`);
    const approve = gate.getByRole('button', { name: 'Approve', exact: true });
    const approval = page.locator(`article > section#step-${gated} section[aria-label="The approval of ${gated}"]`);
    await expectVisible(approve, `${gated} waits at its gate`);

    try {
      reads = 0;
      const answered = await page.request.post(new URL(`/api/runs/${id}/steps/${gated}/approve`, page.url()).href, {
        data: { message: GATED.words },
      });
      if (answered.status() !== 202)
        throw new Refused(`the api takes the approval — it answered ${answered.status()}: ${await answered.text()}`);
      await page.waitForTimeout(OLD_POLL_WINDOW_MS);
      if (reads !== 0)
        throw new Refused(
          `an approval written behind the page's back, with nothing said on the feed, is not read: the run is not polled every 5 s while the feed is followed — it was read ${reads} times in ${OLD_POLL_WINDOW_MS} ms`,
        );
      await expectCount(approval, 0, 'and the approval is not shown yet: nothing has said so');

      fed(id, gated, 'approved, try 1');
      await expectVisible(approval, `the approval shows under ${gated} within ${LIVE_MS} ms of the feed saying so`, LIVE_MS);
      await expectCount(gate, 0, 'and the gate is gone', LIVE_MS);
      if (reads < 1) throw new Refused('the run was read again on the feed’s event');
      await idle(page);
      await settled(page);
      await photograph(page, path.join(OUT, `live-approved-${await themeOf(page)}.png`), { fullPage: true });
    } finally {
      fs.rmSync(asks, { recursive: true, force: true });
      fed(id, gated, 'awaiting approval');
    }
    await expectVisible(
      approve,
      `with the approval taken back, ${gated} waits at its gate again within ${LIVE_MS} ms of the feed saying so`,
      LIVE_MS,
    );
    await expectCount(approval, 0, 'and its approval is gone from under it', LIVE_MS);
    if (streams !== 0) throw new Refused(`the page kept its one stream of the feed throughout — ${streams} more opened`);
  },
} satisfies PageSpec;
