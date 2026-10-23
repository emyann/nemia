/**
 * The levels, pure: a raise in force until its end and never at it (`levelOf`, `raiseAt`, `factoryLevelOf`), a stretch said in
 * minutes, hours or days up to a week (`durationOf`), what a person's write asks of a factory's file — a default set, a raise, an end —
 * with the refusals of a raise of nothing and an end of none (`factoryAsked`), and the levels after a write (`levelsAfter`). The keeper
 * acting on them is told in `test/nemia-keeper.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { names } from '../../test/assessed.ts';
import { atLeast, durationOf, factoryAsked, factoryLevelOf, levelOf, levelsAfter, raiseAt, type FactoryLevelFile } from './level.ts';

const AT = Date.parse('2026-10-06T08:00:00.000Z');
const RAISED: FactoryLevelFile = { since: '2026-10-06T06:00:00.000Z', raise: { level: 'semi-auto', until: '2026-10-06T08:00:00.000Z' } };

test('`levelOf`: a raise is in force until its end, never at it; past it, the factory reads as its default with no write', async (t) => {
  for (const [name, at, level] of [
    ['a millisecond before its end: raised', AT - 1, 'semi-auto'],
    ['at its end: the default', AT, 'manual'],
    ['past its end: the default', AT + 1, 'manual'],
  ] as const)
    await t.test(name, () => {
      assert.equal(levelOf(RAISED, 'manual', at), level);
    });
  await t.test('`raiseAt` holds no raise at its end; `factoryLevelOf` before it says the raise, the default and no own level', () => {
    assert.equal(raiseAt(RAISED, AT), null);
    assert.deepEqual(factoryLevelOf('pipao', RAISED, 'manual', AT - 1), {
      factory: 'pipao',
      level: 'semi-auto',
      default: 'manual',
      own: null,
      raise: RAISED.raise,
    });
  });
  await t.test("its own default over the store's, and no file follows the store's", () => {
    assert.equal(levelOf({ level: 'semi-auto', since: '' }, 'manual', AT), 'semi-auto', 'its own default over the store');
    assert.equal(levelOf(undefined, 'semi-auto', AT), 'semi-auto', "no file follows the store's");
  });
  await t.test('`atLeast` orders the levels', () => {
    assert.ok(atLeast('semi-auto', 'manual') && atLeast('manual', 'manual') && !atLeast('manual', 'semi-auto'));
  });
});

test('`durationOf`: a stretch is digits and m, h or d, above zero and up to a week', async (t) => {
  for (const [text, ms] of [
    ['90m', 90 * 60_000],
    ['2h', 2 * 3_600_000],
    ['7d', 7 * 86_400_000],
  ] as const)
    await t.test(`${text} is ${ms} ms`, () => {
      assert.equal(durationOf(text), ms);
    });
  for (const text of ['0h', '-1h', '2x', '1.5h', 'h', '8d', '169h'])
    await t.test(`REFUSED: ${text} is no stretch`, () => {
      assert.equal(durationOf(text), undefined, text);
    });
});

test("`factoryAsked`: what a person's write asks of a factory's file, and the raise of nothing and the end of none it refuses", async (t) => {
  await t.test("a raise ends at the moment asked plus its stretch, over the factory's own default, which it keeps", () => {
    assert.deepEqual(factoryAsked({ factory: 'pipao', level: 'semi-auto', forMs: 3_600_000 }, undefined, 'manual', new Date(AT)), {
      file: { since: '2026-10-06T08:00:00.000Z', raise: { level: 'semi-auto', until: '2026-10-06T09:00:00.000Z' } },
    });
  });
  await t.test('an end in force writes the default alone, at the moment asked', () => {
    const ended = factoryAsked({ factory: 'pipao', end: true }, { ...RAISED, level: 'manual' }, 'manual', new Date(AT - 1));
    assert.deepEqual(ended, { file: { level: 'manual', since: '2026-10-06T07:59:59.999Z' } });
  });
  await t.test('REFUSED: an end with no raise in force, one past its end included', () => {
    const ended = factoryAsked({ factory: 'pipao', end: true }, RAISED, 'manual', new Date(AT));
    assert.ok('conflict' in ended, JSON.stringify(ended));
    names(ended.conflict, 'pipao', 'manual by default');
  });
  await t.test("REFUSED: a raise to the factory's default, its own or the store's", () => {
    const raised = factoryAsked(
      { factory: 'pipao', level: 'semi-auto', forMs: 60_000 },
      { level: 'semi-auto', since: '' },
      'manual',
      new Date(AT),
    );
    assert.ok('invalid' in raised, JSON.stringify(raised));
    names(raised.invalid, 'pipao is at semi-auto by default', 'raise to semi-auto');
    const byStore = factoryAsked({ factory: 'pipao', level: 'semi-auto', forMs: 60_000 }, undefined, 'semi-auto', new Date(AT));
    assert.ok('invalid' in byStore, "the store's level is its default where it has none of its own");
  });
  const raising = { ...RAISED, raise: { level: 'semi-auto' as const, until: '2026-10-06T09:00:00.000Z' } };
  await t.test('a default set below a raise keeps the raise', () => {
    const low = factoryAsked({ factory: 'pipao', level: 'manual' }, raising, 'manual', new Date(AT));
    assert.deepEqual(low, { file: { level: 'manual', since: '2026-10-06T08:00:00.000Z', raise: raising.raise } });
  });
  await t.test('a default set that reaches the raise drops it', () => {
    const high = factoryAsked({ factory: 'pipao', level: 'semi-auto' }, raising, 'manual', new Date(AT));
    assert.deepEqual(high, { file: { level: 'semi-auto', since: '2026-10-06T08:00:00.000Z' } });
  });
});

test('the levels after a write: the default factory follows the store, the factory written reads its new file, the rest keep theirs', () => {
  const rows = [
    factoryLevelOf('default', undefined, 'manual', AT - 1),
    factoryLevelOf('pipao', RAISED, 'manual', AT - 1),
    factoryLevelOf('hkb', undefined, 'manual', AT - 1),
  ];
  const after = levelsAfter(rows, 'semi-auto', { factory: 'hkb', file: { level: 'manual', since: '' } }, AT - 1, 'default');
  assert.deepEqual(
    after.map((r) => [r.factory, r.level]),
    [
      ['default', 'semi-auto'],
      ['pipao', 'semi-auto'],
      ['hkb', 'manual'],
    ],
  );
  assert.equal(levelsAfter(rows, 'manual', undefined, AT, 'default')[1].level, 'manual', 'a raise past its end is gone');
});
