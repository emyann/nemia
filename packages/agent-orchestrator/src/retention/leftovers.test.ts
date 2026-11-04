/**
 * The leftovers' rule on its accepting side, which the contract proves only as "something goes" until tsverify proves a filter keeps
 * every element that passes (`contracts/leftovers.contract.ts`), the 30 days' edge, and `leftoverLines`, matched on the names they
 * carry, never a whole sentence.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOGS_KEPT_MS, leftoverLines, leftovers } from './leftovers.ts';

const NOW = 1_800_000_000_000;

test('leftovers removes every entry whose process is gone and every log older than 30 days, and nothing else', async (t) => {
  await t.test('every dead entry goes, every live one stays', () => {
    const entries = [
      { name: '.building-v1-11', live: false },
      { name: '.building-v2-12', live: true },
      { name: '.current-13', live: false },
      { name: '.current-14', live: true },
    ];
    assert.deepEqual(leftovers(entries, [], NOW).entries, ['.building-v1-11', '.current-13']);
  });
  await t.test('a log 30 days and 1 ms old goes', () => {
    assert.deepEqual(leftovers([], [{ name: 'a.log', modifiedMs: NOW - LOGS_KEPT_MS - 1 }], NOW).logs, ['a.log']);
  });
  await t.test('a log exactly 30 days old stays', () => {
    assert.deepEqual(leftovers([], [{ name: 'a.log', modifiedMs: NOW - LOGS_KEPT_MS }], NOW).logs, []);
  });
  await t.test('a log written after now stays', () => {
    assert.deepEqual(leftovers([], [{ name: 'a.log', modifiedMs: NOW + 1 }], NOW).logs, []);
  });
  await t.test('every old log goes, whatever its place among fresh ones', () => {
    const logs = ['a', 'b', 'c', 'd'].map((name, i) => ({ name, modifiedMs: i % 2 === 0 ? 0 : NOW }));
    assert.deepEqual(leftovers([], logs, NOW).logs, ['a', 'c']);
  });
  await t.test('nothing found, nothing removed', () => {
    assert.deepEqual(leftovers([], [], NOW), { entries: [], logs: [] });
  });
});

test('leftoverLines names each entry and each log removed, and says nothing when none was', () => {
  const lines = leftoverLines({ entries: ['.building-v1-11'], logs: ['v1-2026.log'] });
  assert.equal(lines.length, 2);
  assert.match(lines[0] ?? '', /releases\/\.building-v1-11\b/);
  assert.match(lines[1] ?? '', /\.logs\/v1-2026\.log\b.*\b30 days\b/);
  assert.deepEqual(leftoverLines({ entries: [], logs: [] }), []);
});
