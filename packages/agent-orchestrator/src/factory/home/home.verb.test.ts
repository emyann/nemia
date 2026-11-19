/**
 * A factory's home read whole for a client to render (`factoryHomeOf`), on the Factory door's memory stand-in: its files as a run's copy
 * holds them, named by the digest the run's copy takes, and its refusals — no factory of the name, a factory with no tree, a tree with no
 * home, a link in the home.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Cause, Effect, Exit } from 'effect';
import { scratch } from 'test-kit/scratch';
import { doorFrom, done } from '../../../test/door-walks.ts';
import { FactoryDoor } from '../door/factories.store.ts';
import { factoryDoorMemory } from '../door/memory.store.ts';
import type { Factory } from '../factory.ts';
import { freezeHomeFiles } from '../../frozen/frozen.store.ts';
import { factoryHomeOf } from './home.verb.ts';

/** A store of its own: the Factory door over memory, and `shop` filed in it on `tree`, where one is given. */
function store(tree: string | undefined) {
  const layer = factoryDoorMemory();
  const factory: Factory = {
    name: 'shop',
    volumes: [],
    workflows: [],
    hires: {},
    schedules: {},
    ...(tree === undefined ? {} : { template: { source: '/templates/shop', version: '1.0.0', params: {} }, tree }),
  };
  done(doorFrom(FactoryDoor, layer).factories.create(factory));
  return (name: string) => Effect.runPromiseExit(factoryHomeOf(name).pipe(Effect.provide(layer)));
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
  const exit = await store(tree)('shop');
  if (!Exit.isSuccess(exit)) return assert.fail(Cause.pretty(exit.cause));
  const home = exit.value;
  assert.equal(home.name, 'shop');
  assert.deepEqual(
    home.files.map((f) => [f.path, f.mode, Buffer.from(f.content, 'base64').toString()]),
    [
      ['.claude/skills/x/SKILL.md', 0o644, '---\nname: x\n---\n'],
      ['CLAUDE.md', 0o644, '# the home\n'],
      ['bin/run.sh', 0o755, '#!/bin/sh\n'],
    ],
  );
  assert.equal(home.digest, freezeHomeFiles(scratch('wf-home-store-'), { id: 'r-1' }, tree));
});

test('a factory with no tree is refused Missing: it has no home to open', async () => {
  assert.equal(refusedAs(await store(undefined)('shop')), 'Missing');
});

test('a tree with no home/ is refused Missing', async () => {
  const tree = path.join(scratch('wf-home-bare-'), 'tree');
  fs.mkdirSync(tree, { recursive: true });
  assert.equal(refusedAs(await store(tree)('shop')), 'Missing');
});

test('a link in the home is refused Invalid, as a run refuses it', async () => {
  const tree = treeWithHome();
  fs.symlinkSync('/etc/hostname', path.join(tree, 'home', 'linked'));
  assert.equal(refusedAs(await store(tree)('shop')), 'Invalid');
});

test('a name no factory has is refused Missing', async () => {
  assert.equal(refusedAs(await store(treeWithHome())('other')), 'Missing');
});
