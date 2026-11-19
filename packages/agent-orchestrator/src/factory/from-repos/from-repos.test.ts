/**
 * `volumesFromRepos`' laws that tsverify leaves `bounded` (`contracts/volumes-from-repos.contract.ts`), held here: a row per law, each
 * input the shape a factory's file had before one list, or after it.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { volumesFromRepos, type FormerKeys } from './from-repos.ts';

const URL = 'https://example.com/o/app.git';

describe('a file written before one list is read into one list, and one written after is answered as it is', () => {
  const rows: { name: string; file: FormerKeys; want: readonly unknown[] }[] = [
    {
      name: 'each repository leads, writable, in the order it was filed, its URL its origin',
      file: { repos: ['/b', '/s/clones/app', '/a'], origins: { '/s/clones/app': URL } },
      want: [
        { path: '/b', readOnly: false },
        { path: '/s/clones/app', readOnly: false, origin: URL },
        { path: '/a', readOnly: false },
      ],
    },
    {
      name: 'an extra folder follows, at its path and under its name, read-only even where it was writable',
      file: {
        repos: ['/r'],
        volumes: [
          { path: '/notes', readOnly: true, name: 'notes' },
          { path: '/scratch', readOnly: false },
        ],
      },
      want: [
        { path: '/r', readOnly: false },
        { path: '/notes', readOnly: true, name: 'notes' },
        { path: '/scratch', readOnly: true },
      ],
    },
    {
      name: "a prototype's name in origins is no URL",
      file: { repos: ['constructor'], origins: {} },
      want: [{ path: 'constructor', readOnly: false }],
    },
    {
      name: 'a file already in one list is answered as it is, its writable volumes with their origins',
      file: {
        volumes: [
          { path: '/s/clones/app', readOnly: false, origin: URL, name: 'app' },
          { path: '/notes', readOnly: true },
        ],
      },
      want: [
        { path: '/s/clones/app', readOnly: false, origin: URL, name: 'app' },
        { path: '/notes', readOnly: true },
      ],
    },
    { name: 'a file with neither is a factory with no volume', file: {}, want: [] },
  ];
  for (const row of rows)
    test(row.name, () => {
      assert.deepEqual(JSON.parse(JSON.stringify(volumesFromRepos(row.file))), row.want);
    });
});
