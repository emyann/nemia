/**
 * The factories as objects (factory.verb.ts), off a listing as `nemia factory` reads it and the controller's status file in a scratch
 * store: the default factory listed first and got, a stray file listed with its error, the generation and the status read, a page walked
 * and selected as a CardList is, and the commands built off the table.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Exit } from 'effect';
import { Factory as FactorySchema, FactoryList } from 'objects';
import { Schema } from 'effect';
import { scratch } from '../../test/scratch.ts';
import { commandLine } from '../command/command.ts';
import { COMMANDS } from '../command/commands.verb.ts';
import type { FactoryListing } from '../factory/factory.ts';
import { factoryCommands, factoryObjectsOf, objectsListed, type FactoryListed } from './factory.verb.ts';

const home = scratch('nemia-factory-object-');
const repo = scratch('nemia-factory-object-repo-');

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
const stray: FactoryListing = { name: 'broken', file: path.join(home, 'factories', 'broken.json'), error: 'does not read as JSON' };

fs.mkdirSync(path.join(home, 'factories', 'acme'), { recursive: true });
fs.writeFileSync(
  path.join(home, 'factories', 'acme', 'status.json'),
  JSON.stringify({
    version: '1.2.0',
    digest: null,
    params: {},
    conditions: [{ type: 'Applied', status: 'True', reason: 'Rendered', message: 'ok', lastTransitionTime: '2026-11-01T00:00:00.000Z' }],
    observedGeneration: 2,
  }),
);

const listed: FactoryListed = {
  factories: [acme, stray],
  schedules: [],
  untrusted: [{ factory: 'acme', place: repo, harness: 'Claude Code', folder: repo, withheld: 'its hooks', never: null }],
};

const objects = factoryObjectsOf(listed, repo, home);
const byName = (name: string) => objects.find((o) => o.metadata.name === name);

test('the default factory is listed first, on the repository given, offering every workflow and hiring no one', () => {
  const d = objects[0];
  assert.equal(d?.metadata.name, 'default');
  assert.deepEqual(d?.spec, { repos: [repo], hires: {}, volumes: [] }, 'no `workflows` key: it offers every workflow found');
  assert.equal(d?.metadata.namespace, undefined, 'a Factory is cluster-scoped');
});

test("a factory's generation is its file's, its status the controller's, its places not trusted read live", () => {
  const m = byName('acme');
  assert.equal(m?.metadata.generation, 3);
  assert.equal(m?.status.observedGeneration, 2);
  assert.equal(m?.status.applied, '1.2.0');
  assert.equal(m?.status.conditions[0]?.lastTransitionTime, '2026-11-01T00:00:00.000Z');
  assert.deepEqual(m?.status.untrusted, [{ place: repo, harness: 'Claude Code', withheld: 'its hooks' }]);
  assert.deepEqual(m?.spec.volumes, [{ name: 'a', path: '/data/a', readOnly: true }], 'an unnamed volume is read by its name');
  assert.deepEqual(m?.spec.workflows, ['make']);
});

test('a stray file is listed with why it does not read, and hides no other', () => {
  const b = byName('broken');
  assert.match(b?.status.error ?? '', /broken\.json/);
  assert.equal(objects.length, 3);
});

test('every object decodes as the objects say a Factory is, and its resourceVersion moves with its status', () => {
  for (const o of objects) assert.ok(Schema.is(FactorySchema)(o), o.metadata.name);
  const without = factoryObjectsOf({ ...listed, untrusted: [] }, repo, home).find((o) => o.metadata.name === 'acme');
  assert.notEqual(without?.metadata.resourceVersion, byName('acme')?.metadata.resourceVersion);
  assert.equal(
    factoryObjectsOf(listed, repo, home).find((o) => o.metadata.name === 'acme')?.metadata.resourceVersion,
    byName('acme')?.metadata.resourceVersion,
    'the same read is the same version',
  );
});

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

test("a factory's commands are the table's lines, with each schedule's unschedule and each volume's rm", () => {
  const m = byName('acme');
  assert.ok(m);
  const line = (name: string, args: Record<string, string>, flags: Record<string, string> = {}) => {
    const command = COMMANDS.find((c) => c.name === name);
    assert.ok(command, name);
    return commandLine(command, args, flags);
  };
  assert.deepEqual(factoryCommands(m, ['nightly']), {
    attach: line('factory attach', { factory: 'acme' }),
    rm: line('factory rm', { factory: 'acme' }),
    add: line('factory add', { name: 'acme' }, { repos: '<path>' }),
    schedule: line('factory schedule', { factory: 'acme' }, { cron: '<expr>', brief: '<text>' }),
    trust: line('factory trust', { factory: 'acme' }),
    volume: line('factory volume add', { factory: 'acme', volume: '<path>:ro|:rw' }),
    unschedule: { nightly: line('factory unschedule', { factory: 'acme', workflow: 'nightly' }) },
    volumeRm: { a: line('factory volume rm', { factory: 'acme', path: '/data/a' }) },
  });
  assert.match(factoryCommands(m, []).attach, /^nemia factory attach acme/);
});
