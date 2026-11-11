/**
 * The factories as objects (factory.verb.ts), off a listing as `nemia factory` reads it, its file beside it, and the controller's status
 * file in a scratch store: the default factory listed first and got, a stray file listed with its error, the generation and the status
 * read, and the commands a person types for it. Their page and selection are `src/object/listed.verb.test.ts`'s.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Factory as FactorySchema } from 'objects';
import { Schema } from 'effect';
import { scratch } from 'test-kit/scratch';
import type { FactoryListing } from '../factory.ts';
import { factoryCommands, factoryObjectsOf, type FactoryListed } from './factory.verb.ts';

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
const { name: _name, file: _file, ...filed } = acme;
fs.writeFileSync(path.join(home, 'factories', 'acme.json'), JSON.stringify(filed));
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

fs.writeFileSync(
  path.join(home, 'factories', 'acme', 'level.json'),
  JSON.stringify({ level: 'semi-auto', since: '2026-11-01T00:00:00.000Z' }),
);

const listed: FactoryListed = {
  factories: [acme, stray],
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

test("a factory's own level is its spec's, read from its level file; one that follows the store's has none", () => {
  assert.equal(byName('acme')?.spec.level, 'semi-auto');
  assert.equal('level' in (objects[0]?.spec ?? {}), false, "the default factory follows the store's level");
});

test('a stray file is listed with why it does not read, and hides no other', () => {
  const b = byName('broken');
  assert.match(b?.status.error ?? '', /broken\.json/);
  assert.equal(objects.length, 3);
});

test('every object decodes as the objects say a Factory is, and its resourceVersion stands when its status alone moves', () => {
  for (const o of objects) assert.ok(Schema.is(FactorySchema)(o), o.metadata.name);
  const without = factoryObjectsOf({ ...listed, untrusted: [] }, repo, home).find((o) => o.metadata.name === 'acme');
  assert.notDeepEqual(without?.status, byName('acme')?.status, 'the status moved');
  assert.equal(without?.metadata.resourceVersion, byName('acme')?.metadata.resourceVersion, 'as metadata.generation, a status write moves no version');
  assert.equal(
    factoryObjectsOf(listed, repo, home).find((o) => o.metadata.name === 'acme')?.metadata.resourceVersion,
    byName('acme')?.metadata.resourceVersion,
    'the same read is the same version',
  );
});

test("a Factory's resourceVersion moves with its rules and its instruction, read beside its spec and status", () => {
  const versionOf = (name: string) => factoryObjectsOf(listed, repo, home).find((o) => o.metadata.name === name)?.metadata.resourceVersion;
  const rules = path.join(home, 'factories', 'acme', 'RULES.md');
  const instruction = path.join(repo, 'NEMIA.md');
  const plain = versionOf('acme');
  const seen = [plain];
  const moves = (what: string) => {
    const now = versionOf('acme');
    assert.ok(!seen.includes(now), what);
    assert.equal(versionOf('acme'), now, `the same read is the same version, ${what}`);
    seen.push(now);
  };
  fs.writeFileSync(rules, 'Be kind.\n');
  moves('rules written');
  fs.writeFileSync(instruction, 'We build tools.\n');
  moves('instruction written');
  fs.writeFileSync(rules, 'Be brief.\n');
  moves('rules edited');
  fs.rmSync(rules);
  moves('rules removed');
  fs.rmSync(instruction);
  assert.equal(versionOf('acme'), plain, 'a factory that keeps neither again has the version of its spec alone');
  assert.equal(versionOf('default'), byName('default')?.metadata.resourceVersion, "the default factory's version does not move");
});

test("a factory's commands are the lines a person types for it, with each schedule's unschedule and each volume's rm", () => {
  const m = byName('acme');
  assert.ok(m);
  assert.deepEqual(factoryCommands(m, ['nightly']), {
    attach: 'nemia factory attach acme <workflow>',
    rm: 'nemia factory rm acme',
    add: 'nemia factory add acme --repo <path>',
    schedule: 'nemia factory schedule acme <workflow> --cron <expr> --brief <text>',
    trust: 'nemia factory trust acme',
    volume: 'nemia factory volume add acme <path>:ro|:rw',
    unschedule: { nightly: 'nemia factory unschedule acme nightly' },
    volumeRm: { a: 'nemia factory volume rm acme /data/a' },
  });
  assert.match(factoryCommands(m, []).attach, /^nemia factory attach acme/);
});
