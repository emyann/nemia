/**
 * What the label page says an initiative's runs spent (`spentOf`, `src/lib/api/labels.ts`): every step's measured cost summed, whatever
 * became of the runs, and nothing where no try's cost was measured — never the mean of the landed runs alone.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spentOf, type LabelStats } from '../src/lib/api/labels.ts';

const stats = (costs: (number | null)[], costPerLanded: number | null = null): LabelStats => ({
  all: { total: { runs: costs.length, landed: null, costPerLanded }, steps: costs.map((costUsd) => ({ costUsd })) },
});

test('the label page spends what every step of its runs cost, landed or not, and says none where none was measured', async (t) => {
  await t.test('a failed run and no landing still spent its tries', () => assert.equal(spentOf(stats([40], null)), 40));
  await t.test('every step measured is summed, one unmeasured left out', () => assert.equal(spentOf(stats([1.5, null, 2.25], 9)), 3.75));
  await t.test('nothing measured is no amount, not zero', () => assert.equal(spentOf(stats([null, null])), null));
});
