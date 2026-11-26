import path from 'node:path';
import type { Response } from 'playwright';
import { fed, photograph, themeOf, stepBar, isRunAction } from '../board.ts';
import { cardOf, expectClearOfEachOther, expectClearOfPanels, gateApprove } from '../canvas.ts';
import { expectCount, expectOnScreen, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import { GATED } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { dropStoredAsks, OUT, storedAsks } from '../world.ts';

export default {
  /**
   * A run held at a gate in its middle, on the default floor: nothing of it moves, the api reads it failed with nothing to decide about its
   * result, and it waits on a person all the same — so its card stays, says what it asks, and takes the answer. The card links to what is
   * being approved, in its answer row, which grows it no taller: pressed, the run's page opens on plan's inspector, its part whole, with
   * the plan's approach in what it gave, and the page goes back to the floor. The card is approved where it is, a press a person can make
   * clear of the legend: its gate's Approve, which approves with no words. The approval is written, then taken back, so every page after
   * reads the store as seeded.
   */
  name: 'factory-mid-gate',
  route: '/factories/default',
  expect: async (page) => {
    const { id, gated } = GATED;
    const approved = (r: Response) =>
      r.request().method() === 'POST' && isRunAction(new URL(r.url()).pathname, id, `/steps/${gated}/approve`);
    await expectCount(page.getByRole('switch', { name: 'Show finished', checked: false }), 1, 'Show finished is off');
    await page.getByRole('button', { name: 'Reset layout' }).click();
    await settled(page);
    await expectClearOfEachOther(page);
    await expectClearOfPanels(page, 'after a Reset layout');

    const card = cardOf(page, id);
    await expectVisible(
      card,
      `a run held at ${gated}'s gate, in the middle of the run, is on the default floor: it waits on a person (${id})`,
    );
    await expectVisible(card.getByText('waiting on you', { exact: true }), 'and says it waits on you');
    await expectVisible(
      card.locator(`[data-gate-line="${gated}"]`, { hasText: `approve what ${gated} handed on, or send it back` }),
      `and what approving ${gated} does`,
    );
    await expectVisible(
      card.locator(
        `[data-run-steps] [data-step="${gated}"][data-state="awaiting-approval"][data-mark="yours"] [data-step-bar][aria-label="${gated}, waiting"]`,
      ),
      `and ${gated}'s node on its graph, awaiting approval, said so by its button`,
    );
    await settled(page);
    await photograph(page, path.join(OUT, `factory-mid-gate-${await themeOf(page)}.png`), { fullPage: true });

    const read = card.locator(`a[data-read="${gated}"]`, { hasText: /^Read what it handed on$/ });
    await expectVisible(read, `the card's gate offers Read what it handed on, in its answer row`);
    await expectClearOfEachOther(page);
    await read.click();
    await page.waitForURL((url) => url.pathname === `/runs/${id}` && url.searchParams.get('bar') === `step:${id}/${gated}`, {
      timeout: WAIT_MS,
    });
    const inspector = stepBar(page, id, gated);
    const gave = inspector.locator('[data-part-gave="L"]');
    await expectVisible(gave, `Read what it handed on lands on ${gated}'s bar, its part whole with what it gave`);
    await expectVisible(gave.locator('[data-field="approach"]', { hasText: GATED.output.approach }), "with the plan's approach in it");
    await settled(page);
    await expectOnScreen(inspector, `${gated}'s bar floats in view over the run's page, whatever is above the canvas`);
    await photograph(page, path.join(OUT, `factory-mid-gate-read-${await themeOf(page)}.png`));
    await page.goto(new URL('/factories/default', page.url()).href, { waitUntil: 'load' });
    await idle(page);
    await expectVisible(gateApprove(card), 'back on the floor, the card at its gate again');

    try {
      const [response] = await Promise.all([page.waitForResponse(approved, { timeout: WAIT_MS }), gateApprove(card).click()]);
      if (response.status() !== 202)
        throw new Refused(`the api takes the approval — it answered ${response.status()}: ${await response.text()}`);
      const file = `approve-${gated}-1`;
      const written = JSON.parse(storedAsks(id)[file] ?? 'null');
      if (written?.step !== gated || written?.try !== 1 || 'message' in written) {
        throw new Refused(
          `the approval is written as wf approve writes it, with no words — the run's ask ${file} holds ${JSON.stringify(written)}`,
        );
      }
      await expectVisible(
        card.locator('[data-taken]', { hasText: `approved — the next pass files what waits on ${gated}` }),
        'the card says it is approved, and what comes next',
      );
      await settled(page);
      await photograph(page, path.join(OUT, `factory-mid-gate-approved-${await themeOf(page)}.png`), { fullPage: true });
    } finally {
      dropStoredAsks(id);
      fed(id, gated, 'awaiting approval');
    }
    await expectVisible(gateApprove(card), 'with the approval taken back, the card offers the gate again, and the page ends as it began');
  },
} satisfies PageSpec;
