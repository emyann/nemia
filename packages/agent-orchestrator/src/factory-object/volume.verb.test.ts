/**
 * A factory's volumes as objects (volume.verb.ts): named as the file keeps them or reads them, a gone folder not present and refused in
 * `volumeRefusal`'s words, and the runs in play whose record mounts the path, an ended one not among them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { Volume } from 'objects';
import type { FactoryListing } from '../factory/factory.ts';
import { volumesOf } from './volume.verb.ts';

const mill: Exclude<FactoryListing, { error: string }> = {
  name: 'mill',
  file: '/store/factories/mill.json',
  repos: ['/repo'],
  workflows: [],
  hires: {},
  schedules: {},
  volumes: [
    { path: '/data/notes', readOnly: true, name: 'kept' },
    { path: '/data/gone', readOnly: false },
  ],
};
const there = new Set(['/data/notes']);
const volumes = volumesOf(mill, '2026-11-01T00:00:00.000Z', {
  home: '/store',
  isDirectory: (at) => there.has(at),
  runs: [
    { id: 'run-1', phase: 'running', volumes: [{ path: '/data/notes', readOnly: true }] },
    { id: 'run-2', phase: 'succeeded', volumes: [{ path: '/data/notes', readOnly: true }] },
    { id: 'run-3', phase: 'waiting', volumes: [{ path: '/elsewhere', readOnly: true }] },
  ],
});

const gone = volumes.find((v) => v.metadata.name === 'gone');
const kept = volumes.find((v) => v.metadata.name === 'kept');

test('each volume is named as its file keeps it, or as it reads, in path order, in the factory’s namespace, a Volume of objects', () => {
  assert.deepEqual(
    volumes.map((v) => [v.metadata.name, v.metadata.namespace]),
    [
      ['gone', 'mill'],
      ['kept', 'mill'],
    ],
  );
  for (const v of volumes) assert.ok(Schema.is(Volume)(v));
});

test('a folder that is gone is not present, and is refused as a mount of it would be', () => {
  assert.equal(gone?.status.present, false);
  assert.match(gone?.status.refused ?? '', /no directory/);
  assert.equal(kept?.status.present, true);
  assert.equal(kept?.status.refused, undefined);
});

test('the runs in play whose record mounts the path, and no ended one', () => {
  assert.deepEqual(kept?.status.runs, ['run-1']);
  assert.deepEqual(gone?.status.runs, []);
});
