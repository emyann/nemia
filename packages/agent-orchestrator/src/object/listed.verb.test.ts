/**
 * Objects listed the one way (`objectsListed`), on the factories as objects off a listing as `nemia factory` reads it, its file beside it
 * in a scratch store: a page walked and selected as a CardList is.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Exit, Schema } from 'effect';
import { FactoryList } from 'objects';
import { scratch } from 'test-kit/scratch';
import type { FactoryListing } from '../factory/factory.ts';
import { factoryObjectsOf, type FactoryListed } from '../factory/object/factory.verb.ts';
import { objectsListed } from './listed.verb.ts';

const home = scratch('nemia-object-listed-');
const repo = scratch('nemia-object-listed-repo-');

const acme: FactoryListing = {
  name: 'acme',
  file: path.join(home, 'factories', 'acme.json'),
  repos: [repo],
  workflows: ['make'],
  hires: { 'make/implement': 'implementer' },
  schedules: {},
  volumes: [{ path: '/data/a', readOnly: true }],
  generation: 3,
};
const { name: _name, file: _file, ...filed } = acme;
fs.mkdirSync(path.join(home, 'factories'), { recursive: true });
fs.writeFileSync(acme.file, JSON.stringify(filed));
const stray: FactoryListing = { name: 'broken', file: path.join(home, 'factories', 'broken.json'), error: 'does not read as JSON' };
const listed: FactoryListed = { factories: [acme, stray], untrusted: [] };
const objects = factoryObjectsOf(listed, home);

test('a page is cut by limit and continue, sorted by name, and counts what remains', async () => {
  const first = await Effect.runPromise(objectsListed('Factory', objects, { limit: 2 }, 'factory'));
  assert.ok(Schema.is(FactoryList)(first));
  assert.deepEqual(
    first.items.map((o) => o.metadata.name),
    ['acme', 'broken'],
  );
  assert.equal(first.metadata.remainingItemCount, 1);
  const next = await Effect.runPromise(objectsListed('Factory', objects, { limit: 2, continue: first.metadata.continue }, 'factory'));
  assert.deepEqual(
    next.items.map((o) => o.metadata.name),
    ['default'],
  );
  assert.equal(next.metadata.continue, undefined);
});

test('no factory stores a label, so only a negative selector (`key!=value`) keeps any, and a bad one is Invalid', async () => {
  const kept = await Effect.runPromise(objectsListed('Factory', objects, { labelSelector: ['team!=core'] }, 'factory'));
  assert.equal(kept.items.length, 3);
  const none = await Effect.runPromise(objectsListed('Factory', objects, { labelSelector: ['team=core'] }, 'factory'));
  assert.equal(none.items.length, 0);
  const bad = await Effect.runPromiseExit(objectsListed('Factory', objects, { labelSelector: ['=='] }, 'factory'));
  assert.ok(Exit.isFailure(bad) && JSON.stringify(bad.cause).includes('Invalid'));
  const limit = await Effect.runPromiseExit(objectsListed('Factory', objects, { limit: 0 }, 'factory'));
  assert.ok(Exit.isFailure(limit));
});
