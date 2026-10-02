import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BAR_DEFAULT,
  BAR_GAP,
  BAR_MIN,
  barMost,
  barOf,
  barSearch,
  barValue,
  barWidth,
  escapeDoes,
  nextBar,
  parseWidth,
  type Bar,
} from '../src/lib/bar.ts';

const HIRING: Bar = { kind: 'start', factory: 'hiring' };
const OTHER: Bar = { kind: 'start', factory: 'other' };

test('the address opens a bar only for a known kind with a name: anything else opens none', () => {
  for (const value of [undefined, '', 'start', 'start:', 'nope:x', ':hiring', 42, ['start:hiring'], null])
    assert.equal(barOf(value), undefined, `${JSON.stringify(value)} opens no bar`);
  assert.deepEqual(barOf('start:hiring'), HIRING);
  assert.deepEqual(barOf('start:a:b'), { kind: 'start', factory: 'a:b' });
});

test('a bar written to the address reads back as the same bar', () => {
  for (const value of ['start:hiring', 'start:a:b']) assert.equal(barValue(barOf(value)!), value);
  assert.deepEqual(barOf(barValue(OTHER)), OTHER);
});

test("the root's search keeps a well-formed bar and nothing else, so the routes' own keys are theirs", () => {
  assert.deepEqual(barSearch({ bar: 'start:x', factory: 'y', step: 'z' }), { bar: 'start:x' });
  assert.deepEqual(barSearch({ bar: 'bogus' }), {});
  assert.deepEqual(barSearch({ bar: 7 }), {});
  assert.deepEqual(barSearch({}), {});
});

test('pressing what the bar shows closes it, and pressing anything else shows that', () => {
  assert.equal(nextBar(HIRING, { ...HIRING }), undefined);
  assert.deepEqual(nextBar(HIRING, OTHER), OTHER, 'the same kind for another factory switches, not closes');
  assert.deepEqual(nextBar(undefined, HIRING), HIRING);
});

test('a stored width reads as a number of pixels, else the default', () => {
  for (const raw of [null, '', 'abc', '-5', '0', 'NaN', '1e9x', 'Infinity'])
    assert.equal(parseWidth(raw), BAR_DEFAULT, `${JSON.stringify(raw)} reads as the default`);
  assert.equal(parseWidth('600'), 600);
  assert.equal(parseWidth('640.5'), 640.5);
});

test('the width stays between the least and the window less a strip of page, and a window too narrow for both is the whole width', () => {
  assert.equal(barWidth(100, 1280), BAR_MIN);
  assert.equal(barWidth(5000, 1280), 1280 - BAR_GAP);
  assert.equal(barWidth(600, 1280), 600);
  assert.equal(barWidth(600, BAR_MIN + BAR_GAP - 1), BAR_MIN + BAR_GAP - 1);
});

test('the widest the bar is drawn is the window less a strip of page, or the whole of a window too narrow for both', () => {
  assert.equal(barMost(1280), 1280 - BAR_GAP);
  assert.equal(barMost(BAR_MIN + BAR_GAP), BAR_MIN);
  assert.equal(barMost(390), 390);
});

test('Escape closes the bar, unless something else took it, it ends a composition, or it leaves a field that holds text', () => {
  const key = { defaultPrevented: false, isComposing: false, fieldText: null };
  assert.equal(escapeDoes(key), 'close');
  assert.equal(escapeDoes({ ...key, fieldText: '' }), 'close', 'an empty field loses nothing');
  assert.equal(escapeDoes({ ...key, fieldText: 'a brief' }), 'leave');
  assert.equal(escapeDoes({ ...key, defaultPrevented: true }), 'ignore', 'a menu or a modal closed on it');
  assert.equal(escapeDoes({ ...key, isComposing: true, fieldText: 'a' }), 'ignore');
});
