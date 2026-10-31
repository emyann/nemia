import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { fed, photograph, themeOf } from '../board.ts';
import { cardOf, expectClearOfEachOther, expectClearOfPanels, holdEdgeOf, photographCard } from '../canvas.ts';
import { expectCount, expectVisible, idle, literal, Refused, settled } from '../checks.ts';
import { GATED, HELD } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store, unreadName } from '../world.ts';

export default {
  /**
   * A hold lifted on the board, as `wf hold <run> --off` lifts it (`DELETE /api/runs/:id/hold`): GATED held until HELD, as the `hold` page
   * holds it, lifted once from its card on the Factory and once from its page, each asked twice. The lift removes the hold's file — the
   * page does not — and the board reads the run again of itself: no hold said, no hold edge, and plan's gate offered again. What the api
   * refuses is proven in its own tests (`apps/api/test/hold.test.ts`), since the e2e's watch counts every 4xx.
   */
  name: 'lift',
  route: '/factories/default',
  expect: async (page) => {
    const { id, gated } = GATED;
    const until = HELD.id;
    const hold = path.join(store!, 'runs', `${id}.hold`);
    const word = `held until ${unreadName(until)} lands`;
    const holdIt = () => {
      if (fs.existsSync(hold)) throw new Refused(`no hold on ${id} before the page writes one — ${hold} is there`);
      fs.writeFileSync(hold, JSON.stringify({ at: new Date().toISOString(), until: [until] }, null, 2), { flag: 'wx' });
      fed(id, 'held');
    };
    const lifted = (where: string) => {
      if (fs.existsSync(hold)) throw new Refused(`the lift from ${where} removed ${hold} once the api answered — it is still there`);
    };
    const theme = await themeOf(page);
    await page.getByRole('button', { name: 'Reset layout' }).click();
    await settled(page);
    const card = cardOf(page, id);
    const edge = holdEdgeOf(page, until, id);
    await expectVisible(card.locator('[data-answer="Approve"]'), `before the hold, ${id}'s card offers ${gated}'s gate`);
    await expectCount(page.locator('[data-lift]'), 0, 'and no card offers a lift: nothing on the floor is held');

    try {
      holdIt();
      await expectVisible(card.locator('[data-holding]', { hasText: new RegExp(`^${literal(word)}$`) }), `the card says ${word}`);
      const button = card.locator(`[data-lift="${id}"]`);
      await expectVisible(button, 'and offers Lift… beside its held chip');
      await expectCount(page.locator('[data-lift]'), 1, 'on the held card alone');
      await expectClearOfEachOther(page);
      await expectClearOfPanels(page, 'with a held card offering its lift');
      await photographCard(page, card, path.join(OUT, `lift-card-${theme}.png`));
      await button.click();
      const dialog = page.getByRole('dialog', { name: `Lift the hold on ${id}` });
      await expectVisible(dialog.getByText(`Lift the hold on ${id}?`, { exact: true }), 'the first press asks');
      if (!fs.existsSync(hold)) throw new Refused('the first press lifts nothing: the hold is still on disk');
      await settled(page);
      await photograph(page, path.join(OUT, `lift-card-asking-${theme}.png`), { fullPage: true });
      await dialog.getByRole('button', { name: 'Lift', exact: true }).click();
      await expectCount(dialog, 0, 'the second press lifts, and the popover closes');
      lifted('the card');
      await expectCount(card.locator('[data-holding]'), 0, 'the card says no hold');
      await expectCount(edge, 0, 'and no hold edge comes into it');
      await expectCount(page.locator('[data-lift]'), 0, 'and offers no lift');
      await expectVisible(card.locator('[data-answer="Approve"]'), `and offers ${gated}'s gate again`);

      holdIt();
      await page.goto(new URL(`/runs/${id}`, page.url()).href, { waitUntil: 'load' });
      await idle(page);
      const section = page.locator('section[aria-label="Held"]');
      await expectVisible(section.locator('p.font-mono', { hasText: new RegExp(`^${literal(word)}$`) }), `the run's page says ${word}`);
      await section.getByRole('button', { name: 'Lift…', exact: true }).click();
      await expectVisible(section.getByText(`Lift the hold on ${id}?`), 'the first press asks');
      if (!fs.existsSync(hold)) throw new Refused('the first press lifts nothing: the hold is still on disk');
      await settled(page);
      await photograph(page, path.join(OUT, `lift-run-asking-${theme}.png`), { fullPage: true });
      await section.getByRole('button', { name: 'Lift', exact: true }).click();
      await expectCount(section, 0, 'the second press lifts, and the page says no hold');
      lifted('the run page');
      await expectVisible(
        page.locator(`article > section#step-${gated}`).getByRole('button', { name: 'Approve', exact: true }),
        `and offers ${gated}'s Approve again`,
      );
      await expectCount(page.locator('[role="alert"][data-lift-refused]'), 0, 'with no refusal said');
      await settled(page);
      await photograph(page, path.join(OUT, `lift-lifted-${theme}.png`), { fullPage: true });
    } finally {
      await takeBack(page, hold, id, gated);
    }
  },
} satisfies PageSpec;

/** Whatever hold the page left, taken back as `wf hold --off` does and said on the feed, so every page after reads the store as seeded. */
async function takeBack(page: Page, hold: string, id: string, gated: string): Promise<void> {
  const left = fs.existsSync(hold);
  fs.rmSync(hold, { force: true });
  fed(id, gated, 'awaiting approval');
  if (left) await idle(page);
}
