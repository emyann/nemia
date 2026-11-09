/**
 * An amount of money, in the board's one writer (src/lib/money.ts), by the package's rule: to the cent, to three figures under one, a
 * dash for none; and a budget as its author writes one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { budgetWord, dollars } from '../src/lib/money.ts';

test('dollars and budgetWord: an amount as the package says one', async (t) => {
  await t.test('dollars', () => {
    const rows: Array<[number | null, string]> = [
      [0, '$0.00'],
      [0.004, '$0.004'],
      [0.5, '$0.50'],
      [3.14159, '$3.14'],
      [12.5, '$12.50'],
      [1234.5, '$1234.50'],
      [null, '—'],
      [-0.13, '-$0.13'],
    ];
    for (const [usd, said] of rows) assert.equal(dollars(usd), said, String(usd));
  });
  await t.test('budgetWord', () => {
    assert.equal(budgetWord(16), '$16', 'whole');
    assert.equal(budgetWord(2.5), '$2.50', 'else as dollars');
  });
});
