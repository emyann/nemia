import path from 'node:path';
import type { Page } from 'playwright';
import { fed, isRunAction, photograph, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import { GATED } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { dropStoredAsks, OUT, storedAsks, storedRecordText } from '../world.ts';

export default {
  /**
   * Approving from the waiting card: the run at plan's gate has a button named `Approve plan` beside `Open the run`, which no other
   * kind of wait gives. It opens a modal named for the step, holding what the gate asks — the closeout's summary and the gate itself —
   * and Approve there answers the gate (one approval sent for the step, the modal gone with the answer). Taken back, the modal's Send back
   * with words sends one retry carrying them, and the modal goes with the answer. Each file is taken back, so every page after this one
   * reads the store as seeded.
   */
  name: 'waiting-approve',
  route: '/runs',
  expect: async (page: Page) => {
    const { id, gated } = GATED;
    const seededRecord = storedRecordText(id);
    const approved = (r: { request: () => { method: () => string }; url: () => string }) =>
      r.request().method() === 'POST' && isRunAction(new URL(r.url()).pathname, id, `/steps/${gated}/approve`);
    const retried = (r: { request: () => { method: () => string }; url: () => string }) =>
      r.request().method() === 'POST' && isRunAction(new URL(r.url()).pathname, id, `/steps/${gated}/retry`);
    const card = page.locator(`section[data-section="waiting"] article[data-run="${id}"]`);
    const button = card.getByRole('button', { name: `Approve ${gated}`, exact: true });
    await expectVisible(button, `the waiting card of a run at ${gated}'s gate holds Approve ${gated}`);
    await expectVisible(card.getByRole('link', { name: 'Open the run' }), 'beside Open the run');

    const cards = await page.locator('section[data-section="waiting"] article[data-run]').all();
    let others = 0;
    for (const other of cards) {
      const approves = await other.locator('[data-approve]').count();
      if (approves > 1) throw new Refused(`a waiting card holds one Approve button at most — one holds ${approves}`);
      if (approves === 1) {
        await expectCount(other.locator('[data-now-words]'), 0, 'a card that holds Approve leaves the words of its wait to it');
        continue;
      }
      others += 1;
      const said = ((await other.locator('[data-now-words]').first().textContent()) ?? '').trim().toLowerCase();
      if (said.startsWith('approve ')) throw new Refused(`the card that says "${said}" holds its Approve button`);
    }
    if (others === 0) throw new Refused('a waiting card of another kind of wait stands beside the gate, to hold no Approve');

    const modal = page.getByRole('dialog', { name: `Approve ${gated}`, exact: true });
    const gateOf = () => modal.locator(`section[aria-label="The gate of ${gated}"]`);
    const open = async (what: string) => {
      await button.click();
      await expectVisible(modal.locator('[data-part-said] [data-summary]'), `${what}: the modal holds the closeout's summary`);
      await expectVisible(gateOf(), `${what}: and the gate of ${gated}`);
    };

    await open('opened');
    await settled(page);
    await photograph(page, path.join(OUT, `waiting-approve-modal-${await themeOf(page)}.png`));
    await gateOf()
      .getByRole('textbox', { name: `Words to approve ${gated} with, if any` })
      .fill(GATED.words);
    const [response] = await Promise.all([
      page.waitForResponse(approved, { timeout: WAIT_MS }),
      gateOf().getByRole('button', { name: 'Approve', exact: true }).click(),
    ]);
    if (response.status() !== 202)
      throw new Refused(`the api takes the approval — it answered ${response.status()}: ${await response.text()}`);
    await expectCount(modal, 0, 'the modal closes on the answer');
    if (Object.keys(storedAsks(id)).length !== 1)
      throw new Refused(`one approval is written — the run's asks hold ${Object.keys(storedAsks(id))}`);

    try {
      dropStoredAsks(id);
      fed(id, gated, 'awaiting approval');
      await expectVisible(button, `with the approval taken back, ${gated} waits at its gate again`);
      await open('opened again');
      await gateOf()
        .getByRole('textbox', { name: `What to change, sent back to ${gated}` })
        .fill(GATED.objection);
      const [sent] = await Promise.all([
        page.waitForResponse(retried, { timeout: WAIT_MS }),
        gateOf().getByRole('button', { name: 'Send back', exact: true }).click(),
      ]);
      if (sent.status() !== 202) throw new Refused(`the api takes the send-back — it answered ${sent.status()}: ${await sent.text()}`);
      const asked = Object.values(storedAsks(id)).map((text) => JSON.parse(text) as { message?: string });
      if (!asked.some((ask) => ask.message === GATED.objection))
        throw new Refused(`the send-back carries the words — the run's asks hold ${JSON.stringify(asked)}`);
      await expectCount(modal, 0, 'the modal closes on the send-back');
    } finally {
      dropStoredAsks(id);
      fed(id, gated, 'awaiting approval');
    }
    await expectVisible(button, 'the send-back taken back, the page ends as it began');
    if (storedRecordText(id) !== seededRecord) throw new Refused(`the api writes nothing of the run's record — ${id}'s changed`);
    await idle(page);
  },
} satisfies PageSpec;
