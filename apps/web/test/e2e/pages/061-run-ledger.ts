import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { LEDGER, partOf, photograph, themeOf } from '../board.ts';
import { expectCount, expectVisible, Refused, settled } from '../checks.ts';
import { GATED } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** The run page's parts, in the order a person reads them, each by what marks it. */
const ORDER: ReadonlyArray<readonly [string, string]> = [
  ['asks', '[data-asks]'],
  ['header', 'header[data-run-header]'],
  ['graph', `section[aria-label="The run's steps as a graph"]`],
  ['ask', 'section[data-run-ask]'],
  ['result', 'section[data-run-result]'],
  ['ledger', LEDGER],
  ['receipts', 'section[aria-label="Receipts"]'],
];

/** A part's six slots, in their one order (`PART_SLOTS`), each by what marks it in a part drawn whole. */
const SLOTS: ReadonlyArray<readonly [string, string]> = [
  ['head', '[data-step-head="L"]'],
  ['asks', '[data-part-asks]'],
  ['got', '[data-part-got]'],
  ['said', '[data-part-said]'],
  ['gave', '[data-part-gave="L"]'],
  ['detail', '[data-part-detail]'],
];

/** The names of `marks` found under `scope`, in the document's order. */
async function drawnIn(scope: Page | Locator, marks: ReadonlyArray<readonly [string, string]>): Promise<string[]> {
  const root = 'goto' in scope ? scope.locator('body') : scope;
  return root.evaluate((el, all) => {
    const found = all.flatMap(([name, mark]) => {
      const at = el.querySelector(mark);
      return at ? [{ name, at }] : [];
    });
    found.sort((a, b) => (a.at.compareDocumentPosition(b.at) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    return found.map((f) => f.name);
  }, marks);
}

export default {
  /**
   * The run page in its reading order: GATED, waiting at plan's gate, reads what it asks of you, then its header, its graph, its ask and
   * its result, the ledger of every step, and its receipts, each once and in that order. Every part of the ledger draws its slots in the
   * one order — head, asks, got, said, gave, detail — leaving out the ones it has nothing for, never reordering them; the gated plan
   * draws all six. The receipts are closed at first: each fold's trigger says it is not expanded.
   */
  name: 'run-ledger',
  route: `/runs/${GATED.id}`,
  expect: async (page) => {
    for (const [name, mark] of ORDER) await expectCount(page.locator(mark), 1, `the page draws its ${name} once`);
    const read = await drawnIn(page, ORDER);
    if (read.join() !== ORDER.map(([name]) => name).join())
      throw new Refused(`the page reads ${ORDER.map(([name]) => name).join(', ')} — it reads ${read.join(', ')}`);

    const parts = page.locator(LEDGER).locator('article[data-step-part="L"]');
    await expectCount(parts, GATED.steps.length, 'the ledger draws a part for every step');
    const order = SLOTS.map(([name]) => name);
    for (const step of GATED.steps) {
      const slots = await drawnIn(partOf(page.locator(LEDGER), step), SLOTS);
      const kept = order.filter((name) => slots.includes(name));
      if (slots.join() !== kept.join() || slots[0] !== 'head')
        throw new Refused(`${step}'s part draws its slots in the one order, its head first — it draws ${slots.join(', ')}`);
    }
    const gated = await drawnIn(partOf(page.locator(LEDGER), GATED.gated), SLOTS);
    if (gated.join() !== order.join()) throw new Refused(`${GATED.gated}, at its gate, draws all six slots — it draws ${gated.join(', ')}`);

    const receipts = page.locator('section[aria-label="Receipts"]');
    const triggers = receipts.locator('[data-fold] > [data-slot="collapsible-trigger"]');
    if ((await triggers.count()) === 0) throw new Refused('the receipts are drawn as folds');
    await expectCount(receipts.locator('[data-fold] > [data-slot="collapsible-trigger"][aria-expanded="true"]'), 0, 'every receipt closed');
    await expectVisible(triggers.first(), 'the receipts show their folds, closed');
    await settled(page);
    await photograph(page, path.join(OUT, `run-ledger-whole-${await themeOf(page)}.png`), { fullPage: true });
  },
} satisfies PageSpec;
