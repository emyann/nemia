import fs from 'node:fs';
import path from 'node:path';
import { photograph, themeOf } from '../board.ts';
import { cardOf, photographCard } from '../canvas.ts';
import { expectCount, expectVisible, idle, Refused, settled } from '../checks.ts';
import { CHAINED, DIAMOND, seedChained } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

export default {
  /**
   * A run of a factory started `--after` a run of the default factory that may still ship is on its factory's floor as a ghost, dimmed and
   * dashed: its line says what it waits on in `wf ls`'s words, the run it waits on a link to that run's page. The run it waits on, in
   * another factory, brings no card onto this floor, and no edge comes into the ghost. The run is taken back.
   */
  name: 'factory-chained',
  route: `/factories/${CHAINED.factory}`,
  expect: async (page) => {
    const theme = await themeOf(page);
    const parent = DIAMOND.running.id;
    const file = seedChained(store!, path.join(store!, 'checkout'));
    try {
      const said = (await (await page.request.get(new URL(`/api/runs/${parent}`, page.url()).href)).json()) as { status: string };
      if (said.status !== 'running')
        throw new Refused(
          `${parent}, which ${CHAINED.id} waits on, must still be running for it to wait; the api says it is ${said.status}`,
        );
      await page.goto(page.url(), { waitUntil: 'load' });
      await idle(page);
      const card = cardOf(page, CHAINED.id);
      await expectVisible(
        card.locator('[data-ghost-run]'),
        `${CHAINED.id}, waiting on ${parent}, is on ${CHAINED.factory}'s floor as a ghost`,
      );
      await expectVisible(
        card.locator('[data-waiting="on-runs"]', { hasText: CHAINED.word }),
        `its line says ${CHAINED.word}, in wf ls's words`,
      );
      await expectVisible(
        card.locator(`a[data-waits-on="${parent}"][href="/runs/${parent}"]`),
        `${parent}, which it waits on, is a link to that run's page`,
      );
      await expectCount(cardOf(page, parent), 0, `${parent}, of the default factory, has no card on ${CHAINED.factory}'s floor`);
      await expectCount(page.locator(`.react-flow__edge[data-id$="->${CHAINED.id}"]`), 0, 'and no edge comes into the ghost');
      await settled(page);
      await photograph(page, path.join(OUT, `factory-chained-floor-${theme}.png`));
      await photographCard(page, card, path.join(OUT, `factory-chained-ghost-${theme}.png`));
    } finally {
      fs.rmSync(file, { force: true });
    }
  },
} satisfies PageSpec;
