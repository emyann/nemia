/**
 * Which cuts of a framed table's frame were painted over (`spilledOver`, `test/e2e/parts/pixels.ts`), as `bars.test.ts` reads them:
 * a name is kept when its point is far enough from the ground, each name once, and in one order whichever point crossed first, so
 * that a borderline pixel at the first depth cannot refuse a case both cuts spilled in. `npm run e2e` reads the painted pixels.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spilledOver, type Rgb } from './e2e/parts/pixels.ts';

const GROUND: Rgb = [16, 16, 16];
const PAINTED: Rgb = [220, 220, 220];
const BORDERLINE: Rgb = [18, 18, 18];

/** The points of one depth of the cuts, in the order `cutSpills` reads them: the bottom-left cut's two, then the top-right cut's. */
const atDepth = (d: number, bottomLeft: Rgb, topRight: Rgb): Record<string, Rgb> => ({
  [`the bottom-left cut:${d}a`]: bottomLeft,
  [`the bottom-left cut:${d}b`]: bottomLeft,
  [`the top-right cut:${d}`]: topRight,
});

test('the cuts painted over are named in one order, the top-right one crossing the threshold first', () => {
  const found = { ...atDepth(1, BORDERLINE, PAINTED), ...atDepth(2, PAINTED, PAINTED) };
  assert.equal(
    Object.keys(found).find((where) => spilledOver({ [where]: found[where] }, GROUND, 3).length > 0),
    'the top-right cut:1',
    'the fixture has the top-right cut cross first, which the order a point was seen in would put first',
  );
  assert.deepEqual(spilledOver(found, GROUND, 3), ['the bottom-left cut', 'the top-right cut'], 'both cuts, in one order');
});

test('the cuts painted over are named in one order, the bottom-left one crossing the threshold first', () => {
  const found = { ...atDepth(1, PAINTED, BORDERLINE), ...atDepth(2, PAINTED, PAINTED) };
  assert.deepEqual(spilledOver(found, GROUND, 3), ['the bottom-left cut', 'the top-right cut'], 'both cuts, in the same order');
});

test('REFUSED: only one cut painted over, where both are read', () => {
  const found = { ...atDepth(1, BORDERLINE, BORDERLINE), ...atDepth(2, PAINTED, BORDERLINE) };
  assert.deepEqual(spilledOver(found, GROUND, 3), ['the bottom-left cut'], 'the top-right cut stays within the threshold');
  assert.notDeepEqual(spilledOver(found, GROUND, 3), ['the bottom-left cut', 'the top-right cut'], 'the grounded case is refused');
});

test('REFUSED: no cut painted over, where the ground shows through both', () => {
  assert.deepEqual(spilledOver({ ...atDepth(1, BORDERLINE, BORDERLINE), ...atDepth(2, GROUND, GROUND) }, GROUND, 3), []);
});
