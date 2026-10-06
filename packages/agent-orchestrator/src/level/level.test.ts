/**
 * The levels, pure: a raise in force until its end and never at it, a stretch said in minutes, hours or days up to a week, and what a
 * person's write asks of a factory's file — a default set, a raise, an end — with the refusals of a raise of nothing and an end of none.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { atLeast, durationOf, factoryAsked, factoryLevelOf, levelOf, levelsAfter, raiseAt, type FactoryLevelFile } from './level.ts';

const AT = Date.parse('2026-10-06T08:00:00.000Z');
const RAISED: FactoryLevelFile = { since: '2026-10-06T06:00:00.000Z', raise: { level: 'semi-auto', until: '2026-10-06T08:00:00.000Z' } };

test('a raise is in force until its end, never at it: past it, the factory reads as its default with no write', () => {
  assert.equal(levelOf(RAISED, 'manual', AT - 1), 'semi-auto');
  assert.equal(levelOf(RAISED, 'manual', AT), 'manual');
  assert.equal(levelOf(RAISED, 'manual', AT + 1), 'manual');
  assert.equal(raiseAt(RAISED, AT), null);
  assert.deepEqual(factoryLevelOf('pipao', RAISED, 'manual', AT - 1), {
    factory: 'pipao',
    level: 'semi-auto',
    default: 'manual',
    own: null,
    raise: RAISED.raise,
  });
  assert.equal(levelOf({ level: 'semi-auto', since: '' }, 'manual', AT), 'semi-auto', 'its own default over the store');
  assert.equal(levelOf(undefined, 'semi-auto', AT), 'semi-auto', "no file follows the store's");
  assert.ok(atLeast('semi-auto', 'manual') && atLeast('manual', 'manual') && !atLeast('manual', 'semi-auto'));
});

test('REFUSED: a stretch that is no digits and m, h or d, zero, below it, or over a week', () => {
  assert.equal(durationOf('90m'), 90 * 60_000);
  assert.equal(durationOf('2h'), 2 * 3_600_000);
  assert.equal(durationOf('7d'), 7 * 86_400_000);
  for (const text of ['0h', '-1h', '2x', '1.5h', 'h', '8d', '169h']) assert.equal(durationOf(text), undefined, text);
});

test("a raise ends at the moment asked plus its stretch, over the factory's own default, which it keeps", () => {
  const at = new Date(AT);
  assert.deepEqual(factoryAsked({ factory: 'pipao', level: 'semi-auto', forMs: 3_600_000 }, undefined, 'manual', at), {
    file: { since: '2026-10-06T08:00:00.000Z', raise: { level: 'semi-auto', until: '2026-10-06T09:00:00.000Z' } },
  });
  const ended = factoryAsked({ factory: 'pipao', end: true }, { ...RAISED, level: 'manual' }, 'manual', new Date(AT - 1));
  assert.deepEqual(ended, { file: { level: 'manual', since: '2026-10-06T07:59:59.999Z' } });
});

test('REFUSED: an end with no raise in force, one past its end included; a raise to the default or below it', () => {
  const ended = factoryAsked({ factory: 'pipao', end: true }, RAISED, 'manual', new Date(AT));
  assert.deepEqual(ended, { conflict: 'pipao has no raise in force to end: it is at manual by default.' });
  const raised = factoryAsked(
    { factory: 'pipao', level: 'semi-auto', forMs: 60_000 },
    { level: 'semi-auto', since: '' },
    'manual',
    new Date(AT),
  );
  assert.match('invalid' in raised ? raised.invalid : '', /^pipao is at semi-auto by default, so a raise to semi-auto raises nothing/);
  const byStore = factoryAsked({ factory: 'pipao', level: 'semi-auto', forMs: 60_000 }, undefined, 'semi-auto', new Date(AT));
  assert.ok('invalid' in byStore, "the store's level is its default where it has none of its own");
});

test('a default set keeps a raise still above it, and drops one it reaches', () => {
  const raising = { ...RAISED, raise: { level: 'semi-auto' as const, until: '2026-10-06T09:00:00.000Z' } };
  const low = factoryAsked({ factory: 'pipao', level: 'manual' }, raising, 'manual', new Date(AT));
  assert.deepEqual(low, { file: { level: 'manual', since: '2026-10-06T08:00:00.000Z', raise: raising.raise } });
  const high = factoryAsked({ factory: 'pipao', level: 'semi-auto' }, raising, 'manual', new Date(AT));
  assert.deepEqual(high, { file: { level: 'semi-auto', since: '2026-10-06T08:00:00.000Z' } });
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
