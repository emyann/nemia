import fs from 'node:fs';
import path from 'node:path';
import { photograph, themeOf } from '../board.ts';
import { cardOf, photographCard } from '../canvas.ts';
import { expectCount, expectTexts, expectVisible, idle, Refused, settled } from '../checks.ts';
import { CHAINED, DIAMOND, QUEUE, QUEUED_IN, refusedWhy, seedChained } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

export default {
  /**
   * A run of a factory started `--after` a run of the default factory that may still ship is on its factory's floor as a ghost, dimmed and
   * dashed: its line says what it waits on in `wf ls`'s words, the run it waits on a link to that run's page. The run it waits on, in
   * another factory, brings no card onto this floor, and no edge comes into the ghost. The run is taken back. Before it, the floor's lane:
   * the factory's two queued cards, in the queue's order, the try marked on the one its factory refused.
   */
  name: 'factory-chained',
  route: `/factories/${CHAINED.factory}`,
  expect: async (page) => {
    const theme = await themeOf(page);
    const parent = DIAMOND.running.id;
    const lane = page.locator('aside[aria-label="Queued cards"]');
    const ghosts = await lane.locator('a[data-ghost]').evaluateAll((links) => links.map((link) => link.getAttribute('data-ghost')));
    const queued = QUEUED_IN.hiring.map((card) => card.name);
    if (JSON.stringify(ghosts) !== JSON.stringify(queued)) {
      throw new Refused(
        `${CHAINED.factory}'s floor draws its queued cards as ghosts, in the queue's order — ${queued.join(', ')} — and never the card of no factory; it drew ${ghosts.join(', ') || 'none'}`,
      );
    }
    await expectTexts(
      lane.locator('[data-ghost-tried="refused"]'),
      [`not started, refused: ${refusedWhy()}`],
      `one try is marked, on ${QUEUE.refused.name}: its factory does not offer its workflow, in the package's words`,
    );
    await expectCount(lane.locator(`a[data-ghost="${QUEUE.refused.name}"] [data-ghost-tried="refused"]`), 1, 'and it is on that card');
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
