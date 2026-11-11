/**
 * A factory's cost lines, pure (`cost-line.ts`): which line a factory may set (`costLineRefusal`), one row per input, and a line set and
 * taken back (`withCostLine`, `withoutCostLine`). The verbs over the Factory door are `cost-line.verb.test.ts`'s.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { names } from '../../../test/assessed.ts';
import { costLineRefusal, withCostLine, withoutCostLine } from './cost-line.ts';

const MILL = { name: 'mill', workflows: ['build'] };

test('costLineRefusal: a line of dollars above zero for a workflow the factory offers, and nothing else', async (t) => {
  await t.test('$80 for build, which it offers', () => assert.equal(costLineRefusal(MILL, 'build', 80), undefined));
  await t.test('$0.50, a line under a dollar', () => assert.equal(costLineRefusal(MILL, 'build', 0.5), undefined));
  await t.test('REFUSED: a workflow it does not offer, naming the attach', () =>
    names(costLineRefusal(MILL, 'intake', 80), 'nemia factory attach mill intake'),
  );
  for (const usd of [0, -1, Number.NaN, Number.POSITIVE_INFINITY])
    await t.test(`REFUSED: ${String(usd)}`, () => names(costLineRefusal(MILL, 'build', usd), 'nemia factory cost-line set mill build'));
  await t.test("REFUSED: a name that is no workflow's", () => assert.notEqual(costLineRefusal(MILL, 'a/b', 80), undefined));
});

test('withCostLine and withoutCostLine: a line set replaces the workflow’s, and the lines go once none is left', () => {
  assert.deepEqual(withCostLine(undefined, 'build', 80), { build: 80 });
  assert.deepEqual(withCostLine({ build: 80, intake: 5 }, 'build', 95), { build: 95, intake: 5 });
  assert.deepEqual(withoutCostLine({ build: 80, intake: 5 }, 'build'), { intake: 5 });
  assert.equal(withoutCostLine({ build: 80 }, 'build'), undefined);
  assert.equal(withoutCostLine(undefined, 'build'), undefined);
});
