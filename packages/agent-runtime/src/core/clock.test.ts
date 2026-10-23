/**
 * `elapsedMs`: the monotonic clock answers within a boot, the wall clock across one or where a reading has none. `leftOf`: what a
 * budget has left, never below zero. `purseOf`: the waits that share one budget add up to no more than it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elapsedMs, leftOf, purseOf, type Instant } from './clock.ts';

const T0 = Date.parse('2026-10-02T12:00:00Z');
const read = (wallMs: number, monoMs?: number, boot = 'b-1'): Instant => ({
  at: T0 + wallMs,
  ...(monoMs !== undefined ? { mono: { boot, ms: monoMs } } : {}),
});

/** A row of the table: its name and its claim. */
type Row = { name: string; run: () => void };

const ROWS: Row[] = [
  {
    name: 'within one boot, the time elapsed is the monotonic clock’s, whichever way the wall clock stepped',
    run: () => {
      assert.equal(elapsedMs(read(0, 1_000), read(60_000, 6_000)), 5_000, 'a wall clock stepped forward');
      assert.equal(elapsedMs(read(0, 1_000), read(-60_000, 6_000)), 5_000, 'a wall clock stepped back');
    },
  },
  {
    name: 'across two boots, or with a reading missing on either side, the time elapsed is the wall clock’s',
    run: () => {
      assert.equal(elapsedMs(read(0, 1_000, 'b-1'), read(60_000, 6_000, 'b-2')), 60_000, 'another boot');
      assert.equal(elapsedMs(read(0), read(60_000, 6_000)), 60_000, 'none at the start');
      assert.equal(elapsedMs(read(0, 1_000), read(60_000)), 60_000, 'none at the end');
    },
  },
  {
    name: 'a budget has what it has not spent left, and nothing once it is spent',
    run: () => {
      assert.equal(leftOf(read(0, 1_000), 5_000, read(0, 1_000)), 5_000, 'nothing spent at the moment it was taken');
      assert.equal(leftOf(read(0, 1_000), 5_000, read(0, 3_000)), 3_000, 'two of its five seconds spent');
      assert.equal(leftOf(read(0, 1_000), 5_000, read(0, 6_000)), 0, 'spent to the millisecond');
      assert.equal(leftOf(read(0, 1_000), 5_000, read(0, 90_000)), 0, 'long overspent: never below zero, and never its length again');
      assert.equal(leftOf(read(0), 5_000, read(60_000)), 0, 'with no monotonic reading it is the wall clock that spends it');
    },
  },
  {
    name: 'the waits that share one purse add up to no more than its budget, whatever each is given',
    run: () => {
      let mono = 1_000;
      const purse = purseOf(1_000, () => read(0, mono));
      mono += 400;
      assert.equal(purse.take(0.5), 500, 'a share is a ceiling on one take, under what is left');
      mono += 400;
      assert.equal(purse.take(), 200, 'the next take is what the budget has left, not its length again');
      mono += 400;
      assert.equal(purse.take(), 0, 'and nothing once it is spent');
      assert.deepEqual(purse.given, [500, 200, 0], 'what every take answered, in order');
      assert.ok(
        purse.given.reduce((a, b) => a + b, 0) <= 1_000,
        'the parts add up to no more than the whole, which is the point of a purse',
      );
    },
  },
  {
    name: 'a purse spent slower than its shares still gives each take only what is left',
    run: () => {
      const purse = purseOf(100, () => read(0, 1_000));
      assert.deepEqual([purse.take(0.8), purse.take(), purse.take()], [80, 100, 100], 'a clock that never moves spends nothing');
      const spent = purseOf(100, () => read(0, 1_000));
      assert.equal(spent.take(2), 100, 'a share above the whole is still bounded by the budget');
    },
  },
];

test('elapsedMs, leftOf and purseOf: the time elapsed on which clock, what a budget has left, and what the waits sharing one are given', async (t) => {
  for (const row of ROWS) await t.test(row.name, row.run);
});
