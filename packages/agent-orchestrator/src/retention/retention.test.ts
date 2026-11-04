/**
 * The retention's order and words: `newestFirst`, which the contract takes as given (`contracts/retention.contract.ts` proves which
 * releases are kept), `retentionLines`, matched on the tags and counts they name, never a whole sentence, and the rule's accepting
 * side, which the contract proves only as "something goes" until tsverify proves a filter keeps every element that passes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newestFirst, retention, retentionLines } from './retention.ts';

test('newestFirst orders the installed releases by when they were built, the latest first, two built at once by tag', async (t) => {
  await t.test('by builtAt, whatever the tags say', () => {
    const order = newestFirst([
      { tag: 'v9', builtAt: '2026-11-01T00:00:00.000Z' },
      { tag: 'v1', builtAt: '2026-11-03T00:00:00.000Z' },
      { tag: 'v5', builtAt: '2026-11-02T00:00:00.000Z' },
    ]);
    assert.deepEqual(
      order.map((r) => r.tag),
      ['v1', 'v5', 'v9'],
    );
  });
  await t.test('a tie by tag, the greater first', () => {
    const at = '2026-11-01T00:00:00.000Z';
    assert.deepEqual(
      newestFirst([
        { tag: 'a', builtAt: at },
        { tag: 'c', builtAt: at },
        { tag: 'b', builtAt: at },
      ]).map((r) => r.tag),
      ['c', 'b', 'a'],
    );
  });
});

test('retentionLines names each release removed, the sessions a held sweep waits on, and nothing with no pointer', async (t) => {
  const installed = newestFirst(['v1', 'v2', 'v3', 'v4'].map((tag, i) => ({ tag, builtAt: `2026-11-0${i + 1}T00:00:00.000Z` })));
  await t.test('each removed tag', () => {
    const answer = retention(installed, { current: 'v4', pinned: [], unrecorded: 0 });
    assert.deepEqual(answer.remove, ['v2', 'v1']);
    const lines = retentionLines(answer, 0);
    assert.equal(lines.length, 2);
    assert.match(lines[0] ?? '', /\bv2\b/);
    assert.match(lines[1] ?? '', /\bv1\b/);
  });
  await t.test('held by unrecorded sessions: one line naming their count', () => {
    const answer = retention(installed, { current: 'v4', pinned: [], unrecorded: 3 });
    const lines = retentionLines(answer, 3);
    assert.equal(lines.length, 1);
    assert.match(lines[0] ?? '', /\b3 local sessions\b/);
  });
  await t.test('no pointer: nothing said', () => {
    assert.deepEqual(retentionLines(retention(installed, { current: null, pinned: [], unrecorded: 0 }), 0), []);
  });
});

test('unheld, every installed release that is not current, not running and not among the two newest is removed', async (t) => {
  const installed = newestFirst(
    ['v1', 'v2', 'v3', 'v4', 'v5', 'v6'].map((tag, i) => ({ tag, builtAt: `2026-11-0${i + 1}T00:00:00.000Z` })),
  );
  await t.test('each old one goes, whatever its place among them', () => {
    assert.deepEqual(retention(installed, { current: 'v6', pinned: [], unrecorded: 0 }).remove, ['v4', 'v3', 'v2', 'v1']);
  });
  await t.test('around a current and a pinned one in the middle', () => {
    assert.deepEqual(retention(installed, { current: 'v3', pinned: ['v2'], unrecorded: 0 }).remove, ['v4', 'v1']);
  });
});
