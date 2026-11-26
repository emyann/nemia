/**
 * The factories as objects (factory.verb.ts), off a listing as `nemia factory` reads it, its file beside it, and the controller's status
 * file in a scratch store: the default factory listed first and got, a stray file listed with its error, the generation and the status
 * read, and the commands a person types for it; and a factory's home read whole (`factoryHomeOf`), in a scratch store, its tree copied in,
 * named by the digest a run's copy takes, and its refusals. Their page and selection are `src/object/listed.verb.test.ts`'s.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Factory as FactorySchema } from 'objects';
import { Cause, Effect, Exit, Schema } from 'effect';
import { scratch } from 'test-kit/scratch';
import type { FactoryListing } from '../factory.ts';
import { factoryCommands, factoryObjectsOf, followOf, type FactoryListed } from './factory.verb.ts';
import { volumeBase } from '../volume/volume.ts';
import { FactoryDoor } from '../door/factories.store.ts';
import { factoriesNow } from '../../../testing.ts';
import { StoreRoot } from '../../config/root.store.ts';
import { treeDir } from '../applied/applied.store.ts';
import type { Factory } from '../factory.ts';
import { freezeHomeFiles } from '../../frozen/frozen.store.ts';
import { factoryHomeOf } from './factory.verb.ts';

const home = scratch('nemia-factory-object-');
const repo = scratch('nemia-factory-object-repo-');

const acme: FactoryListing = {
  name: 'acme',
  file: path.join(home, 'factories', 'acme.json'),
  volumes: [
    { path: repo, readOnly: false },
    { path: '/data/a', readOnly: true },
  ],
  workflows: ['make'],
  hires: { 'make/implement': 'implementer' },
  schedules: {},
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

const objects = factoriesNow(home, factoryObjectsOf(listed, home));
const byName = (name: string) => objects.find((o) => o.metadata.name === name);

test('the default factory is listed first, on no repository, offering every workflow and hiring no one', () => {
  const d = objects[0];
  assert.equal(d?.metadata.name, 'default');
  assert.deepEqual(d?.spec, { hires: {}, volumes: [] }, 'no `workflows` key: it offers every workflow found');
  assert.equal(d?.metadata.namespace, undefined, 'a Factory is cluster-scoped');
});

test("a factory's generation is its file's, its status the controller's, its places not trusted read live", () => {
  const m = byName('acme');
  assert.equal(m?.metadata.generation, 3);
  assert.equal(m?.status.observedGeneration, 2);
  assert.equal(m?.status.applied, '1.2.0');
  assert.equal(m?.status.conditions[0]?.lastTransitionTime, '2026-11-01T00:00:00.000Z');
  assert.deepEqual(m?.status.untrusted, [{ place: repo, harness: 'Claude Code', withheld: 'its hooks' }]);
  assert.deepEqual(
    m?.spec.volumes.find((v) => v.path === '/data/a'),
    { name: 'a', path: '/data/a', readOnly: true },
    'an unnamed volume is read by its name',
  );
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
  const without = factoriesNow(home, factoryObjectsOf({ ...listed, untrusted: [] }, home)).find((o) => o.metadata.name === 'acme');
  assert.notDeepEqual(without?.status, byName('acme')?.status, 'the status moved');
  assert.equal(
    without?.metadata.resourceVersion,
    byName('acme')?.metadata.resourceVersion,
    'as metadata.generation, a status write moves no version',
  );
  assert.equal(
    factoriesNow(home, factoryObjectsOf(listed, home)).find((o) => o.metadata.name === 'acme')?.metadata.resourceVersion,
    byName('acme')?.metadata.resourceVersion,
    'the same read is the same version',
  );
});

test("a Factory's resourceVersion moves with its rules and its instruction, read beside its spec and status", () => {
  const versionOf = (name: string) =>
    factoriesNow(home, factoryObjectsOf(listed, home)).find((o) => o.metadata.name === name)?.metadata.resourceVersion;
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
    add: 'nemia factory add acme --volume <path|url>:rw',
    schedule: 'nemia factory schedule acme <workflow> --cron <expr> --brief <text>',
    trust: 'nemia factory trust acme',
    volume: 'nemia factory volume add acme <path|url>:ro|:rw',
    trigger: 'nemia factory trigger acme <name> --labels <key>=<value> --to <workflow>',
    unschedule: { nightly: 'nemia factory unschedule acme nightly' },
    volumeRm: { a: 'nemia factory volume rm acme /data/a', [volumeBase(repo)]: `nemia factory volume rm acme ${repo}` },
  });
  assert.match(factoryCommands(m, []).attach, /^nemia factory attach acme/);
});

test('a factory whose template declares a boolean that follows a host is told how to follow it, and one whose template declares none is not', () => {
  const follow = followOf('acme', '4.9.0', {
    model: { type: 'string', description: 'a model', whenOrigin: 'example.org' },
    lands: { type: 'boolean', description: 'whether it lands there', default: false, whenOrigin: 'example.org' },
  });
  assert.deepEqual([follow?.host, follow?.parameter], ['example.org', 'lands']);
  assert.match(follow?.line ?? '', /^nemia factory diff acme --to 4\.9\.0 --set lands=true$/);
  assert.equal(followOf('acme', '4.9.0', { lands: { type: 'boolean', description: 'whether it lands', default: false } }), undefined);
});

test("a cloned volume's origin is on its spec, and a volume given no URL has none", () => {
  const into = path.join(home, 'clones', 'h', 'o', 'r');
  const mill: FactoryListing = {
    ...acme,
    name: 'mill',
    file: path.join(home, 'factories', 'mill.json'),
    volumes: [{ path: into, readOnly: false, origin: 'https://h/o/r.git' }],
  };
  const { name: _n, file: _f, ...millFiled } = mill;
  fs.writeFileSync(mill.file, JSON.stringify(millFiled));
  const served = factoriesNow(home, factoryObjectsOf({ factories: [mill], untrusted: [] }, home)).find((o) => o.metadata.name === 'mill');
  assert.equal(served?.spec.volumes.at(0)?.origin, 'https://h/o/r.git');
  assert.ok(served && Schema.is(FactorySchema)(served));
  assert.equal(
    byName('acme')?.spec.volumes.some((v) => 'origin' in v),
    false,
    'a volume given no URL serves none',
  );
});

/** A store of its own, in a scratch folder: `shop` filed in it, a copy of `tree` rendered as its tree where one is given. */
function homeStore(tree: string | undefined) {
  const root = scratch('wf-home-store-door-');
  const factory: Factory = {
    name: 'shop',
    volumes: [],
    workflows: [],
    hires: {},
    schedules: {},
    ...(tree === undefined ? {} : { template: { source: '/templates/shop', version: '1.0.0', params: {} } }),
  };
  factoriesNow(
    root,
    Effect.flatMap(FactoryDoor, (door) => door.factories.create(factory)),
  );
  if (tree !== undefined) fs.cpSync(tree, treeDir(root, 'shop'), { recursive: true, verbatimSymlinks: true });
  return (name: string) => Effect.runPromiseExit(factoryHomeOf(name).pipe(Effect.provideService(StoreRoot, root)));
}

/** A tree whose home holds a memory file, a skill and an executable script. */
function treeWithHome() {
  const tree = path.join(scratch('wf-home-tree-'), 'tree');
  fs.mkdirSync(path.join(tree, 'home', '.claude', 'skills', 'x'), { recursive: true });
  fs.mkdirSync(path.join(tree, 'home', 'bin'), { recursive: true });
  fs.writeFileSync(path.join(tree, 'home', 'CLAUDE.md'), '# the home\n');
  fs.writeFileSync(path.join(tree, 'home', '.claude', 'skills', 'x', 'SKILL.md'), '---\nname: x\n---\n');
  fs.writeFileSync(path.join(tree, 'home', 'bin', 'run.sh'), '#!/bin/sh\n', { mode: 0o755 });
  fs.chmodSync(path.join(tree, 'home', 'CLAUDE.md'), 0o644);
  fs.chmodSync(path.join(tree, 'home', '.claude', 'skills', 'x', 'SKILL.md'), 0o644);
  fs.chmodSync(path.join(tree, 'home', 'bin', 'run.sh'), 0o755);
  return tree;
}

/** The kind of the refusal `exit` failed with. */
const refusedAs = <A, E>(exit: Exit.Exit<A, E>) => {
  if (Exit.isSuccess(exit)) return assert.fail('it was not refused');
  const failed = exit.cause.reasons.find(Cause.isFailReason);
  return (failed?.error as { _tag?: string } | undefined)?._tag ?? Cause.pretty(exit.cause);
};

test("a factory's home answers its files sorted by path, with their modes and bytes, named by the digest a run's copy takes", async () => {
  const tree = treeWithHome();
  const exit = await homeStore(tree)('shop');
  if (!Exit.isSuccess(exit)) return assert.fail(Cause.pretty(exit.cause));
  const answered = exit.value;
  assert.equal(answered.name, 'shop');
  assert.deepEqual(
    answered.files.map((f) => [f.path, f.mode, Buffer.from(f.content, 'base64').toString()]),
    [
      ['.claude/skills/x/SKILL.md', 0o644, '---\nname: x\n---\n'],
      ['CLAUDE.md', 0o644, '# the home\n'],
      ['bin/run.sh', 0o755, '#!/bin/sh\n'],
    ],
  );
  assert.equal(answered.digest, freezeHomeFiles(scratch('wf-home-store-'), { id: 'r-1' }, tree));
});

test('a factory with no tree is refused Missing: it has no home to open', async () => {
  assert.equal(refusedAs(await homeStore(undefined)('shop')), 'Missing');
});

test('a tree with no home/ is refused Missing', async () => {
  const tree = path.join(scratch('wf-home-bare-'), 'tree');
  fs.mkdirSync(tree, { recursive: true });
  assert.equal(refusedAs(await homeStore(tree)('shop')), 'Missing');
});

test('a link in the home is refused Invalid, as a run refuses it', async () => {
  const tree = treeWithHome();
  fs.symlinkSync('/etc/hostname', path.join(tree, 'home', 'linked'));
  assert.equal(refusedAs(await homeStore(tree)('shop')), 'Invalid');
});

test('a name no factory has is refused Missing', async () => {
  assert.equal(refusedAs(await homeStore(treeWithHome())('other')), 'Missing');
});
