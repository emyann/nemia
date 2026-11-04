/**
 * A volume as a person spells it (`volumeOf`) and the volumes no run should mount (`volumeRefusal`): one table each, a row per input.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { volumeOf, volumeRefusal, withVolume } from './volume.ts';

test('a volume is read as compose spells it, and its mark is required', async (t) => {
  const rows: { name: string; spelled: string; want: { path: string; readOnly: boolean } | 'refused' }[] = [
    { name: ':ro is read-only', spelled: '/a:ro', want: { path: '/a', readOnly: true } },
    { name: ':rw is writable', spelled: '/a:rw', want: { path: '/a', readOnly: false } },
    { name: 'a relative path is resolved from where it is typed', spelled: 'b:ro', want: { path: '/here/b', readOnly: true } },
    { name: 'a path holding a colon keeps it', spelled: '/a:b:ro', want: { path: '/a:b', readOnly: true } },
    { name: 'no mark is refused, not taken as writable', spelled: '/a', want: 'refused' },
    { name: 'a mark in capitals is refused', spelled: '/a:RO', want: 'refused' },
    { name: 'another mark is refused', spelled: '/a:x', want: 'refused' },
    { name: 'no path is refused', spelled: ':ro', want: 'refused' },
  ];
  for (const row of rows)
    await t.test(row.name, () => {
      const read = volumeOf(row.spelled, '/here');
      if (row.want === 'refused') assert.equal(typeof read, 'string');
      else assert.deepEqual(read, row.want);
    });
});

test('a volume that is no directory, a repository, or reaches the store is refused', async (t) => {
  const factory = { name: 'f', repos: ['/r', '/p/app'] };
  const dirs = new Set([
    '/p',
    '/p/app',
    '/r',
    '/r/sub',
    '/home/me',
    '/home/me/.agent-workflows',
    '/home/me/.agent-workflows/runs',
    '/notes',
  ]);
  const store = '/home/me/.agent-workflows';
  const rows: { name: string; path: string; readOnly: boolean; refused: boolean }[] = [
    { name: 'a folder of this machine is taken', path: '/notes', readOnly: false, refused: false },
    { name: 'no directory', path: '/gone', readOnly: true, refused: true },
    { name: 'one of its repositories', path: '/r', readOnly: true, refused: true },
    { name: 'a read-only folder inside a repository is taken', path: '/r/sub', readOnly: true, refused: false },
    { name: 'a writable folder inside a repository', path: '/r/sub', readOnly: false, refused: true },
    { name: 'a writable folder holding a repository', path: '/p', readOnly: false, refused: true },
    { name: 'a read-only folder holding a repository is taken', path: '/p', readOnly: true, refused: false },
    { name: 'the store itself', path: store, readOnly: true, refused: true },
    { name: 'a folder inside the store', path: `${store}/runs`, readOnly: true, refused: true },
    { name: 'a writable folder holding the store', path: '/home/me', readOnly: false, refused: true },
    { name: 'a read-only folder holding the store is taken', path: '/home/me', readOnly: true, refused: false },
  ];
  for (const row of rows)
    await t.test(row.name, () => {
      const why = volumeRefusal(factory, { path: row.path, readOnly: row.readOnly }, store, (at) => dirs.has(at));
      assert.equal(why !== undefined, row.refused, why);
    });
});

test('a volume added again replaces the one of its path, and says what it was', () => {
  const added = withVolume({ volumes: [{ path: '/b', readOnly: true }] }, { path: '/b', readOnly: false });
  assert.deepEqual(added, { volumes: [{ path: '/b', readOnly: false }], was: true });
  assert.deepEqual(withVolume({}, { path: '/a', readOnly: true }), { volumes: [{ path: '/a', readOnly: true }], was: null });
});
