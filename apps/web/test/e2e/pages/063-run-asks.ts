import fs from 'node:fs';
import path from 'node:path';
import { fed, isRunAction, LEDGER, partOf, photograph, themeOf } from '../board.ts';
import { expectCount, expectOnScreen, expectVisible, Refused, settled, WAIT_MS } from '../checks.ts';
import { GATED } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

export default {
  /**
   * What the run asks of you, at the top, and where it is answered: GATED's ask, approve plan, is one line at the top of the page that
   * links to plan's part; followed, the address names the part and the part is on screen. Its Approve is in that part's second slot,
   * what it asks of you, right under its head; pressed there, the api takes the approval (`useApprove`) and writes it as `nemia approve`
   * does, and the ask goes from the top. The approval is taken back.
   */
  name: 'run-asks',
  route: `/runs/${GATED.id}`,
  expect: async (page) => {
    const { id, gated } = GATED;
    const asks = page.locator('section[aria-label="Asks of you"]');
    const line = asks.locator(`li[data-ask="gate"][data-step="${gated}"]`);
    await expectVisible(line, `the top of the page asks you to approve ${gated}`);
    const link = line.locator(`a[data-ask-link="${gated}"]`);
    await link.click();
    await page.waitForURL((url) => url.hash === `#step-${gated}`);
    const part = partOf(page.locator(LEDGER), gated);
    await expectOnScreen(part.locator('[data-step-head="L"]'), `the ask's link takes the page to ${gated}'s part`);

    const slot = part.locator('[data-part-asks]');
    const second = await part.evaluate((el) => {
      const marks = ['[data-step-head="L"]', '[data-part-asks]', '[data-part-got]', '[data-part-said]', '[data-part-gave="L"]'];
      const found = marks.flatMap((mark) => (el.querySelector(mark) ? [mark] : []));
      return found[1] ?? null;
    });
    if (second !== '[data-part-asks]') throw new Refused(`what ${gated} asks of you is its part's second slot — the second is ${second}`);
    const gate = slot.locator(`section[aria-label="The gate of ${gated}"]`);
    const approve = gate.getByRole('button', { name: 'Approve', exact: true });
    await expectVisible(approve, `the approve form is in ${gated}'s asks`);
    await settled(page);
    await photograph(part, path.join(OUT, `run-asks-part-${await themeOf(page)}.png`));

    const dir = path.join(store!, 'runs', `${id}.asks`);
    try {
      const [answered] = await Promise.all([
        page.waitForResponse(
          (r) => r.request().method() === 'POST' && isRunAction(new URL(r.url()).pathname, id, `/steps/${gated}/approve`),
          { timeout: WAIT_MS },
        ),
        approve.click(),
      ]);
      if (answered.status() !== 202) throw new Refused(`the api takes the approval made in the part — it answered ${answered.status()}`);
      if (!fs.existsSync(path.join(dir, `approve-${gated}-1`)))
        throw new Refused(`the approval is written in ${dir}, as nemia approve does`);
      await expectCount(asks, 0, 'approved, the top asks nothing more');
      await expectCount(gate, 0, 'and the part offers the gate no more');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      fed(id, gated, 'awaiting approval');
    }
    await expectVisible(approve, `taken back, ${gated} waits at its gate again`);
  },
} satisfies PageSpec;
