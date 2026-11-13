import path from 'node:path';
import type { Locator } from 'playwright';
import { LEDGER, partOf, photograph, stepBar, themeOf } from '../board.ts';
import { expectVisible, idle, Refused, settled } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** The rail of the table in flight. */
const FLIGHT = 'section[data-section="in-flight"]';

/** What `scope` says in `mark`, as written (no case a style gives it), its spaces made one. */
const words = async (scope: Locator, mark: string, what: string): Promise<string> => {
  const at = scope.locator(mark).first();
  await expectVisible(at, what);
  return ((await at.textContent()) ?? '').replace(/\s+/g, ' ').trim();
};

export default {
  /**
   * One step, one head, at every size: a step of the first run in flight with a bar on Runs, read as the preview card its bar opens (M),
   * as its node on the run's graph (S), as its row in the run's ledger and in the step bar (L). Its word — its state's tag, the node's
   * status chip — is the same at all four, and its spend the same on the card, the ledger's row and the bar, the node's cost line, where
   * it draws one, saying the same figure: the node draws its word and its spend by the same rules as the part's head (`stateWordsOf`).
   * The bar follows a live step's conversation, a stream that never idles, so the page is left on the run with no bar open.
   */
  name: 'step-sizes',
  route: '/runs',
  expect: async (page) => {
    const bar = page.locator(`${FLIGHT} tr[data-run] [data-step-bar]`).first();
    await expectVisible(bar, 'a run in flight draws its steps as bars');
    const run = await bar.evaluate((el) => el.closest('tr')!.getAttribute('data-run')!);
    const step = (await bar.getAttribute('data-step-bar'))!;
    await page.mouse.move(0, 0);
    await bar.hover();
    const card = page.locator('[data-slot="preview-card"]');
    await expectVisible(card.locator('[data-step-card]'), `${step}'s bar opens its preview card`);
    const m = {
      tag: await words(card, '[data-step-tag]', 'the card says its word'),
      spend: await words(card, '[data-step-spend]', 'its spend'),
    };
    await settled(page);
    await photograph(card, path.join(OUT, `step-sizes-card-${await themeOf(page)}.png`));

    await page.goto(new URL(`/runs/${run}`, page.url()).href, { waitUntil: 'load' });
    await idle(page);
    const node = page.locator(`section[aria-label="The run's steps as a graph"] .react-flow__node[data-id="${step}"]`);
    const s = { tag: await words(node, '[data-state]', 'the node says its word') };
    const cost = node.locator('[data-cost]');
    const costs = (await cost.count()) ? ((await cost.textContent()) ?? '').replace(/^cost\s*/, '').trim() : null;
    const row = partOf(page.locator(LEDGER), step).locator('[data-step-head="L"]');
    const ledger = {
      tag: await words(row, '[data-step-tag]', 'the ledger row says its word'),
      spend: await words(row, '[data-step-spend]', 'and its spend'),
    };

    await page.goto(new URL(`/runs/${run}?bar=step:${run}/${step}`, page.url()).href, { waitUntil: 'load' });
    const inBar = stepBar(page, run, step).locator('[data-step-head="L"]');
    const barred = {
      tag: await words(inBar, '[data-step-tag]', 'the bar says its word'),
      spend: await words(inBar, '[data-step-spend]', 'and its spend'),
    };
    const tags = [m.tag, s.tag, ledger.tag, barred.tag];
    const spends = [m.spend, ledger.spend, barred.spend];
    if (new Set(tags).size !== 1 || new Set(spends).size !== 1 || (costs !== null && !m.spend.includes(costs)))
      throw new Refused(
        `${step} of ${run} says one word and one spend at every size — card ${JSON.stringify(m)}, node ${JSON.stringify({ ...s, costs })}, ledger ${JSON.stringify(ledger)}, bar ${JSON.stringify(barred)}`,
      );
    await page.goto(new URL(`/runs/${run}`, page.url()).href, { waitUntil: 'load' });
    await idle(page);
  },
} satisfies PageSpec;
