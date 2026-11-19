/**
 * `nemia factory volume set` (volume.verb.ts) on a store's factory of two read-only volumes, neither stored by name: a switch given is
 * written, the other kept, the volume's folder, mark and the other volume unmoved, and the name it reads by stored; refused, and the file
 * unchanged, for a name it does not hold, for neither switch, for a switch neither on nor off, and on the default factory.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { handled } from '../../../test/typed.ts';
import { addFactoryAt, readFactoryAt } from '../factory.store.ts';
import type { Env } from '../../config/config.store.ts';
import { FACTORY_VOLUME_SET } from './volume.verb.ts';

const ROOT = scratch('wf-volume-set-');
const ENV: Env = { ...process.env, WF_ROOT: ROOT };
const DATA = scratch('wf-volume-set-data-');
const NOTES = path.join(DATA, 'notes');
const DOCS = path.join(DATA, 'docs');
fs.mkdirSync(NOTES);
fs.mkdirSync(DOCS);
const { file } = addFactoryAt(ROOT, { name: 'mill', volumes: [`${NOTES}:ro`, `${DOCS}:ro`] });

/** `volume set` run as the api calls it, on this store. */
const set = (input: Record<string, unknown>) => handled(FACTORY_VOLUME_SET, input, { env: ENV });

/** The factory's volumes as its file holds them. */
const stored = () => readFactoryAt(ROOT, 'mill').volumes;

/** That `run` is refused with `tag`, naming `named`, and leaves the factory's file as it was. */
async function refused(run: Promise<unknown>, tag: 'Invalid' | 'Missing' | 'Conflict', named: string) {
  const before = fs.readFileSync(file, 'utf8');
  await assert.rejects(run, (err: Error & { _tag?: string }) => err._tag === tag && err.message.includes(named));
  assert.equal(fs.readFileSync(file, 'utf8'), before);
}

test('a switch given is written on the volume named, its name stored, its folder, its mark and the other volume as they read', async () => {
  const answered = await set({ factory: 'mill', volume: 'notes', claudeMd: true });
  assert.deepEqual(answered, { file, name: 'notes' });
  const notes = stored().find((v) => v.path === NOTES);
  assert.deepEqual(notes, { path: NOTES, readOnly: true, name: 'notes', claudeMd: true });
  assert.deepEqual(
    stored().find((v) => v.path === DOCS),
    { path: DOCS, readOnly: true, name: 'docs' },
    'the other volume as it read, its read name stored as an add stores every name',
  );
});

test('a second set of the other switch keeps the first, its words read as the command line types them', async () => {
  await set({ factory: 'mill', volume: 'notes', skills: 'off' });
  assert.deepEqual(
    stored().find((v) => v.path === NOTES),
    { path: NOTES, readOnly: true, name: 'notes', claudeMd: true, skills: false },
  );
});

test('REFUSED, nothing written: a name the factory does not hold (Missing, naming those it holds)', async () => {
  await refused(set({ factory: 'mill', volume: 'ghost', skills: false }), 'Missing', 'docs');
});

test('REFUSED, nothing written: neither switch, and a switch neither on nor off (Invalid, naming the flag)', async () => {
  await refused(set({ factory: 'mill', volume: 'notes' }), 'Invalid', '--claude-md');
  await refused(set({ factory: 'mill', volume: 'notes', claudeMd: 'maybe' }), 'Invalid', '--claude-md');
});

test('REFUSED: the default factory, which keeps no volumes', async () => {
  await assert.rejects(set({ factory: 'default', volume: 'notes', claudeMd: true }), (err: Error & { _tag?: string }) =>
    ['Conflict', 'Invalid'].includes(err._tag ?? ''),
  );
});
