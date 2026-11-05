/**
 * A volume as a person spells it (`volumeOf`) and the volumes no run should mount (`volumeRefusal`): one table each, a row per input.
 * And a volume's name: what its folder gives it (`volumeBase`), and the names a factory's volumes are served under (`volumesNamed`,
 * `withVolume`) — what `volumeNameAmong`'s laws (contracts/volume-name.contract.ts) leave to them: the order they are named in.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { volumeBase, volumeOf, volumeRefusal, volumesNamed, withVolume } from './volume.ts';

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

test('a volume added again replaces the one of its path, keeping its name, and says what it was', () => {
  const added = withVolume({ volumes: [{ path: '/b', readOnly: true, name: 'kept' }] }, { path: '/b', readOnly: false });
  assert.deepEqual(added, { volumes: [{ path: '/b', readOnly: false, name: 'kept' }], was: true });
  assert.deepEqual(withVolume({}, { path: '/a', readOnly: true }), { volumes: [{ path: '/a', readOnly: true, name: 'a' }], was: null });
});

test("a volume is named by its folder's name, a suffix telling two apart, and a name once stored is kept", async (t) => {
  const rows: { name: string; volumes: { path: string; readOnly: boolean; name?: string }[]; want: string[] }[] = [
    { name: 'its folder, as a slug', volumes: [{ path: '/home/me/My Notes', readOnly: true }], want: ['my-notes'] },
    { name: 'the root, whose folder gives nothing', volumes: [{ path: '/', readOnly: true }], want: ['volume'] },
    {
      name: '/a/data and /b/data are data and data-2, named in path order',
      volumes: [
        { path: '/b/data', readOnly: true },
        { path: '/a/data', readOnly: false },
      ],
      want: ['data-2', 'data'],
    },
    {
      name: 'a stored name is kept, and one named on read takes another',
      volumes: [
        { path: '/a/data', readOnly: true },
        { path: '/b/data', readOnly: true, name: 'data' },
      ],
      want: ['data-2', 'data'],
    },
  ];
  for (const row of rows)
    await t.test(row.name, () => {
      assert.deepEqual(
        volumesNamed(row.volumes).map((v) => v.name),
        row.want,
      );
    });
  await t.test('a stored name survives a volume added before it in path order', () => {
    const first = withVolume({}, { path: '/b/data', readOnly: true });
    const second = withVolume({ volumes: first.volumes }, { path: '/a/data', readOnly: true });
    assert.deepEqual(
      second.volumes.map((v) => [v.path, v.name]),
      [
        ['/a/data', 'data-2'],
        ['/b/data', 'data'],
      ],
    );
  });
  await t.test('a volume an older file stores no name of keeps the one it is named on read when another is added', () => {
    const old = [{ path: '/b/data', readOnly: true }];
    const read = volumesNamed(old).map((v) => v.name);
    const added = withVolume({ volumes: old }, { path: '/a/data', readOnly: true });
    assert.deepEqual(added.volumes.find((v) => v.path === '/b/data')?.name, read[0]);
  });
  assert.equal(volumeBase('/srv/Data_Sets/'), 'data-sets');
});
