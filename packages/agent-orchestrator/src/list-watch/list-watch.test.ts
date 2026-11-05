/**
 * What a watch says changed (`watchChanges`, list-watch.ts): the halves its contract leaves out until tsverify card
 * `src-a-filter-s-result-is-pro-p25m` restores them (contracts/watch-changes.contract.ts), held here whole — every object the list holds
 * now that the watcher was never sent is ADDED, every one sent at another version MODIFIED, every one sent that the list no longer holds
 * DELETED, and none said twice — over a table of named cases and over every pair of lists of three keys at two versions.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { type Versioned, type WatchChange, watchChanges } from './list-watch.ts';

const said = (changes: readonly WatchChange[], type: WatchChange['type'], key: string) =>
  changes.some((c) => c.type === type && c.key === key);

/** Each law the contract leaves out, broken by `changes` between `sent` and `now`: what it misses, or nothing. */
const misses = (sent: readonly Versioned[], now: readonly Versioned[], changes: readonly WatchChange[]): string[] => [
  ...now.filter((n) => !sent.some((s) => s.key === n.key) && !said(changes, 'ADDED', n.key)).map((n) => `${n.key} not ADDED`),
  ...now
    .filter((n) => sent.some((s) => s.key === n.key && s.version !== n.version) && !said(changes, 'MODIFIED', n.key))
    .map((n) => `${n.key} not MODIFIED`),
  ...sent.filter((s) => !now.some((n) => n.key === s.key) && !said(changes, 'DELETED', s.key)).map((s) => `${s.key} not DELETED`),
  ...changes.filter((c, i) => changes.slice(0, i).some((d) => d.key === c.key)).map((c) => `${c.key} said twice`),
];

const v = (key: string, version: string): Versioned => ({ key, version });

test('the named cases: each new object ADDED, each moved MODIFIED, each gone DELETED, and one that stands not said', async (t) => {
  const rows: [string, Versioned[], Versioned[], WatchChange[]][] = [
    [
      'a first read, nothing sent: every object ADDED',
      [],
      [v('a', '1'), v('b', '1')],
      [
        { type: 'ADDED', key: 'a' },
        { type: 'ADDED', key: 'b' },
      ],
    ],
    ['one filed', [v('a', '1')], [v('a', '1'), v('b', '1')], [{ type: 'ADDED', key: 'b' }]],
    ['one changed', [v('a', '1')], [v('a', '2')], [{ type: 'MODIFIED', key: 'a' }]],
    ['one dropped', [v('a', '1'), v('b', '1')], [v('a', '1')], [{ type: 'DELETED', key: 'b' }]],
    ['nothing moved', [v('a', '1')], [v('a', '1')], []],
    [
      'all three at once',
      [v('a', '1'), v('b', '1')],
      [v('a', '2'), v('c', '1')],
      [
        { type: 'ADDED', key: 'c' },
        { type: 'MODIFIED', key: 'a' },
        { type: 'DELETED', key: 'b' },
      ],
    ],
  ];
  for (const [name, sent, now, expected] of rows)
    await t.test(name, () => {
      const changes = watchChanges(sent, now);
      assert.deepEqual(
        [...changes].sort((x, y) => x.key.localeCompare(y.key)),
        [...expected].sort((x, y) => x.key.localeCompare(y.key)),
      );
      assert.deepEqual(misses(sent, now, changes), []);
    });
});

/** Every list of the keys a, b and c, each absent or at version 1 or 2: 27 lists. */
const lists = (): Versioned[][] =>
  ['a', 'b', 'c'].reduce<Versioned[][]>((acc, key) => acc.flatMap((list) => [list, [...list, v(key, '1')], [...list, v(key, '2')]]), [[]]);

test('every pair of lists of three keys at two versions: nothing new, moved or gone goes unsaid', () => {
  const missed = lists().flatMap((sent) =>
    lists().flatMap((now) => misses(sent, now, watchChanges(sent, now)).map((m) => `${JSON.stringify({ sent, now })}: ${m}`)),
  );
  assert.deepEqual(missed, [], 'each object new now ADDED, each sent at another version MODIFIED, each gone DELETED, none twice');
});
