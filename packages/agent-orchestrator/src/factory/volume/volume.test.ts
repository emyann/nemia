/**
 * A volume as a person spells it (`volumeOf`) and the volumes no run should mount (`volumeRefusal`): one table each, a row per input.
 * And a volume's name: what its folder gives it (`volumeBase`), and the names a factory's volumes are served under (`volumesNamed`,
 * `withVolume`) — what `volumeNameAmong`'s laws (contracts/volume-name.contract.ts) leave to them: the order they are named in.
 */
import { afterAll, beforeAll, describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { volumeBase, volumeOf, volumeRefusal, volumesNamed, withVolume } from './volume.ts';
import { factoryVolumes } from '../factory.ts';

describe('a volume is read as compose spells it, and its mark is required', () => {
  const rows: { name: string; spelled: string; want: { path: string; readOnly: boolean; origin?: string } | 'refused' }[] = [
    { name: ':ro is read-only', spelled: '/a:ro', want: { path: '/a', readOnly: true } },
    { name: ':rw is writable', spelled: '/a:rw', want: { path: '/a', readOnly: false } },
    { name: 'a relative path is resolved from where it is typed', spelled: 'b:ro', want: { path: '/here/b', readOnly: true } },
    { name: 'a path holding a colon keeps it', spelled: '/a:b:ro', want: { path: '/a:b', readOnly: true } },
    { name: 'no mark is refused, not taken as writable', spelled: '/a', want: 'refused' },
    { name: 'a mark in capitals is refused', spelled: '/a:RO', want: 'refused' },
    { name: 'another mark is refused', spelled: '/a:x', want: 'refused' },
    { name: 'no path is refused', spelled: ':ro', want: 'refused' },
    {
      name: 'a git URL is its clone under the store, its URL its origin',
      spelled: 'https://github.com/o/r.git:rw',
      want: { path: '/home/me/.agent-workflows/clones/github.com/o/r', readOnly: false, origin: 'https://github.com/o/r.git' },
    },
    {
      name: 'an scp-like URL keeps its colon',
      spelled: 'git@github.com:o/r.git:ro',
      want: { path: '/home/me/.agent-workflows/clones/github.com/o/r', readOnly: true, origin: 'git@github.com:o/r.git' },
    },
  ];
  for (const row of rows)
    test(row.name, () => {
      const read = volumeOf(row.spelled, '/here', '/home/me/.agent-workflows');
      if (row.want === 'refused') assert.equal(typeof read, 'string');
      else assert.deepEqual(read, row.want);
    });
});

describe('a volume that is no directory, a writable one reaching another, or a read-only one in the store is refused', () => {
  let dirs!: Set<string>;
  beforeAll(() => {
    dirs = new Set(['/p', '/p/app', '/r', '/r/sub', '/home/me', '/home/me/.agent-workflows', '/home/me/.agent-workflows/runs', '/notes']);
  });
  const factory = {
    name: 'f',
    volumes: [
      { path: '/r', readOnly: false },
      { path: '/p/app', readOnly: false },
    ],
  };
  const store = '/home/me/.agent-workflows';
  const rows: { name: string; path: string; readOnly: boolean; origin?: string; refused: boolean }[] = [
    { name: 'a folder of this machine is taken', path: '/notes', readOnly: false, refused: false },
    { name: 'no directory', path: '/gone', readOnly: true, refused: true },
    { name: 'a clone not made yet is taken', path: '/gone', readOnly: false, origin: 'https://h/o/r', refused: false },
    { name: 'a read-only clone the store keeps is taken', path: `${store}/runs`, readOnly: true, origin: 'https://h/o/r', refused: false },
    { name: 'one of its repositories again, now read-only, replaces it', path: '/r', readOnly: true, refused: false },
    { name: 'one of its repositories again, writable, replaces it', path: '/r', readOnly: false, refused: false },
    { name: 'a read-only folder inside a repository is taken', path: '/r/sub', readOnly: true, refused: false },
    { name: 'a writable folder inside a repository', path: '/r/sub', readOnly: false, refused: true },
    { name: 'a writable folder holding a repository', path: '/p', readOnly: false, refused: true },
    { name: 'a read-only folder holding a repository is taken', path: '/p', readOnly: true, refused: false },
    { name: 'the store itself', path: store, readOnly: true, refused: true },
    { name: 'a folder inside the store', path: `${store}/runs`, readOnly: true, refused: true },
    { name: 'a writable repository the store keeps, a clone, is taken', path: `${store}/runs`, readOnly: false, refused: false },
    {
      name: 'a writable folder holding the store is taken: a repository is the place to judge',
      path: '/home/me',
      readOnly: false,
      refused: false,
    },
    { name: 'a read-only folder holding the store is taken', path: '/home/me', readOnly: true, refused: false },
  ];
  for (const row of rows)
    test(row.name, () => {
      const why = volumeRefusal(
        factory,
        { path: row.path, readOnly: row.readOnly, ...(row.origin === undefined ? {} : { origin: row.origin }) },
        store,
        (at) => dirs.has(at),
      );
      assert.equal(why !== undefined, row.refused, why);
    });
});

test('a volume added again replaces the one of its path, keeping its name, and says what it was', () => {
  const added = withVolume({ volumes: [{ path: '/b', readOnly: true, name: 'kept' }] }, { path: '/b', readOnly: false });
  assert.deepEqual(added, { volumes: [{ path: '/b', readOnly: false, name: 'kept' }], was: true });
  assert.deepEqual(withVolume({ volumes: [] }, { path: '/a', readOnly: true }), {
    volumes: [{ path: '/a', readOnly: true, name: 'a' }],
    was: null,
  });
});

test('a volume added again keeps the switches it is not given, and takes those it is', () => {
  const before = { volumes: [{ path: '/b', readOnly: false, name: 'b', claudeMd: true, skills: false }] };
  assert.deepEqual(withVolume(before, { path: '/b', readOnly: false }).volumes, before.volumes);
  assert.deepEqual(withVolume(before, { path: '/b', readOnly: false, skills: true }).volumes, [
    { path: '/b', readOnly: false, name: 'b', claudeMd: true, skills: true },
  ]);
  assert.deepEqual(withVolume({ volumes: [] }, { path: '/a', readOnly: true }).volumes, [{ path: '/a', readOnly: true, name: 'a' }]);
});

test('a run freezes a volume\'s switches only where they are not the defaults', () => {
  assert.deepEqual(
    factoryVolumes({
      volumes: [
        { path: '/a', readOnly: true, claudeMd: true, skills: true },
        { path: '/b', readOnly: true, claudeMd: false, skills: false },
        { path: '/c', readOnly: true },
      ],
    }),
    [
      { path: '/a', readOnly: true, claudeMd: true },
      { path: '/b', readOnly: true, skills: false },
      { path: '/c', readOnly: true },
    ],
  );
});

describe("a volume is named by its folder's name, a suffix telling two apart, and a name once stored is kept", () => {
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
    test(row.name, () => {
      assert.deepEqual(
        volumesNamed(row.volumes).map((v) => v.name),
        row.want,
      );
    });
  test('a stored name survives a volume added before it in path order', () => {
    const first = withVolume({ volumes: [] }, { path: '/b/data', readOnly: true });
    const second = withVolume({ volumes: first.volumes }, { path: '/a/data', readOnly: true });
    assert.deepEqual(
      second.volumes.map((v) => [v.path, v.name]),
      [
        ['/b/data', 'data'],
        ['/a/data', 'data-2'],
      ],
      'a new volume goes last, so the order writable ones were given in stays',
    );
  });
  test('a volume an older file stores no name of keeps the one it is named on read when another is added', () => {
    const old = [{ path: '/b/data', readOnly: true }];
    const read = volumesNamed(old).map((v) => v.name);
    const added = withVolume({ volumes: old }, { path: '/a/data', readOnly: true });
    assert.deepEqual(added.volumes.find((v) => v.path === '/b/data')?.name, read[0]);
  });
  afterAll(() => {
    assert.equal(volumeBase('/srv/Data_Sets/'), 'data-sets');
  });
});
