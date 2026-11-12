/**
 * A harness a person deactivated stays so, through a real shell: its removal, run as the read offers it (`sh -c`, `NEMIA_TOOLS` the
 * tools folder), leaves its mark (`DEACTIVATED`), and then neither the carry (`carryHarnesses`) nor the daemon's start
 * (`adoptBundled`) brings it back from a tree that still carries it, until its install, even one that fails, takes the mark away. The
 * fixes are the real commands, so the shell is this file's subject; installs run against a stand-in `npm` first on the PATH.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { HARNESS_DECLARATIONS } from 'agent-runtime/vocabulary';
import { scratch } from 'test-kit/scratch';
import { toolsBinDir, toolsDir } from '../config/root.store.ts';
import { DEACTIVATED, harnessInstallCommand } from '../needs/index.ts';
import { harnessNeedsOf } from '../needs/harness.ts';
import { adoptBundled, carryHarnesses } from './carry.store.ts';

/** Runs `command` as a harness's fix is run, in the store at `home`: `sh -c`, with `NEMIA_TOOLS` its tools folder. Answers its exit. */
const ranAsFix = (home: string, command: string, env: NodeJS.ProcessEnv = process.env): number | null =>
  spawnSync('sh', ['-c', command], { cwd: home, env: { ...env, NEMIA_TOOLS: toolsDir(home) }, stdio: 'ignore' }).status;

/** The removal of `harness` as the read offers it: its install need's fix of kind `removes`. */
const removalOf = (harness: string): string => {
  const command = harnessNeedsOf(HARNESS_DECLARATIONS)
    .find((need) => need.name === harness)
    ?.fixes?.find((fix) => fix.kind === 'removes')?.command;
  assert.ok(command !== undefined, `${harness} offers a removal`);
  return command;
};

/** A tree that carries the default harness's program in its platform package, as a release that bundled it does. */
const bundlingTree = (): string => {
  const tree = scratch('wf-carry-tree-');
  const dir = path.join(tree, 'node_modules', '@anthropic-ai', `claude-agent-sdk-${process.platform}-${process.arch}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'claude'), '#!/bin/sh\n', { mode: 0o755 });
  return tree;
};

/** A folder of a stand-in `npm` that writes what it was asked into `ran` and exits `code`, and the environment that finds it first. */
const npmStandIn = (code: number): { env: NodeJS.ProcessEnv; ran: string } => {
  const stubs = scratch('wf-carry-stubs-');
  const ran = path.join(stubs, 'npm-ran.txt');
  fs.writeFileSync(path.join(stubs, 'npm'), `#!/bin/sh\necho "$*" >> '${ran}'\nexit ${code}\n`, { mode: 0o755 });
  return { env: { ...process.env, PATH: `${stubs}${path.delimiter}${process.env.PATH ?? ''}` }, ran };
};

test('a harness activated, then deactivated, is carried by no upgrade, though a tree still carries it', () => {
  const home = scratch('wf-carry-');
  const tree = bundlingTree();
  const dir = path.join(toolsDir(home), 'harnesses', 'codex', '0.0.1', 'bin');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'codex'), '#!/bin/sh\n', { mode: 0o755 });
  fs.mkdirSync(toolsBinDir(home), { recursive: true });
  fs.symlinkSync(path.join(dir, 'codex'), path.join(toolsBinDir(home), 'codex'));
  for (const harness of ['codex', 'claude']) assert.equal(ranAsFix(home, removalOf(harness)), 0, `${harness}'s removal ran`);

  const npm = npmStandIn(0);
  const done = carryHarnesses(home, npm.env, tree, () => undefined);
  assert.deepEqual(done.harnesses, [], 'neither is carried');
  assert.equal(done.code, 0);
  assert.equal(fs.existsSync(npm.ran), false, 'and nothing is installed');
});

test("the daemon's start adopts a tree's harness where the tools folder has none, but not one a person deactivated, until its install takes the mark away", () => {
  const tree = bundlingTree();
  assert.deepEqual(
    adoptBundled(scratch('wf-adopt-'), [tree]).map((a) => a.name),
    ['claude'],
    'a store that never chose adopts what the tree carries',
  );

  const home = scratch('wf-adopt-');
  assert.equal(ranAsFix(home, removalOf('claude')), 0);
  const mark = path.join(toolsDir(home), 'harnesses', 'claude', DEACTIVATED);
  assert.ok(fs.existsSync(mark), 'the removal leaves its mark');
  assert.deepEqual(adoptBundled(home, [tree]), [], 'deactivated, it is not adopted');
  assert.equal(fs.existsSync(path.join(toolsBinDir(home), 'claude')), false);

  const needs = HARNESS_DECLARATIONS.claude?.needs;
  assert.ok(needs !== undefined);
  ranAsFix(home, harnessInstallCommand('claude', needs), npmStandIn(1).env);
  assert.equal(fs.existsSync(mark), false, 'an install, even one that fails, takes the mark away: the person activated it');
  assert.deepEqual(
    adoptBundled(home, [tree]).map((a) => a.name),
    ['claude'],
    'and the tree is adopted again',
  );
});
