/**
 * What `nemia doctor carry` reads and does on a scratch store (`carryHarnesses`): the harnesses held activated in the tools folder or
 * carried by a release's tree, each installed by its declared install unless it is at its pin already, and the exit it ends with. The
 * installs run against a stand-in `npm` first on the PATH, which records its arguments and exits as the row says, so no row fetches.
 * Which harnesses are carried is `upgradeCarries`' contract; this is its reading of the disk and its running. A harness a person
 * deactivated — its removal run as the read offers it, which leaves its mark — is neither carried nor adopted from a tree that still
 * carries it (`adoptBundled`), until its install takes the mark away.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { CODEX_PIN, HARNESS_DECLARATIONS } from 'agent-runtime/vocabulary';
import { scratch } from 'test-kit/scratch';
import { toolsBinDir, toolsDir } from '../config/root.store.ts';
import { DEACTIVATED, harnessInstallCommand } from '../needs/index.ts';
import { harnessNeedsOf } from '../needs/harness.ts';
import { adoptBundled, bundledProgramIn, carryHarnesses, type HarnessCarried } from './carry.store.ts';

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

/** A store whose tools folder holds what `held` says, a tree that carries what `bundled` says, and an `npm` that exits `npm`. */
type Row = {
  readonly name: string;
  readonly activated?: 'at-pin' | 'elsewhere';
  readonly bundled?: boolean;
  /** Whether each harness the row holds is then deactivated, by the removal the read offers. */
  readonly deactivated?: boolean;
  readonly npm: number;
  readonly carried: readonly Pick<HarnessCarried, 'name' | 'kind'>[];
  readonly code: 0 | 1;
  readonly npmRan: boolean;
};

const ROWS: readonly Row[] = [
  { name: 'a store that holds no harness carries none', npm: 0, carried: [], code: 0, npmRan: false },
  {
    name: 'a harness activated at its pin is left there',
    activated: 'at-pin',
    npm: 0,
    carried: [{ name: 'codex', kind: 'at-pin' }],
    code: 0,
    npmRan: false,
  },
  {
    name: 'a harness activated at another version is installed at the pin',
    activated: 'elsewhere',
    npm: 0,
    carried: [{ name: 'codex', kind: 'installed' }],
    code: 0,
    npmRan: true,
  },
  {
    name: 'a harness the running tree carries is installed, and an install that fails ends the carry 1',
    bundled: true,
    npm: 1,
    carried: [{ name: 'claude', kind: 'failed' }],
    code: 1,
    npmRan: true,
  },
  {
    name: 'a harness deactivated is carried by no tree that still carries it, and one activated then deactivated is not carried',
    activated: 'elsewhere',
    bundled: true,
    deactivated: true,
    npm: 0,
    carried: [],
    code: 0,
    npmRan: false,
  },
];

test('carryHarnesses reads what the store holds and the tree carries, and installs each at its pin', async (t) => {
  for (const row of ROWS)
    await t.test(row.name, () => {
      const home = scratch('wf-carry-');
      const tree = scratch('wf-carry-tree-');
      const stubs = scratch('wf-carry-stubs-');
      const ran = path.join(stubs, 'npm-ran.txt');
      fs.writeFileSync(path.join(stubs, 'npm'), `#!/bin/sh\necho "$*" >> '${ran}'\nexit ${row.npm}\n`, { mode: 0o755 });
      if (row.activated !== undefined) {
        const version = row.activated === 'at-pin' ? CODEX_PIN : '0.0.1';
        const dir = path.join(toolsDir(home), 'harnesses', 'codex', version, 'bin');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'codex'), '#!/bin/sh\n', { mode: 0o755 });
        fs.mkdirSync(toolsBinDir(home), { recursive: true });
        fs.symlinkSync(path.join(dir, 'codex'), path.join(toolsBinDir(home), 'codex'));
      }
      if (row.bundled) {
        const dir = path.join(tree, 'node_modules', '@anthropic-ai', `claude-agent-sdk-${process.platform}-${process.arch}`);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'claude'), '#!/bin/sh\n', { mode: 0o755 });
        assert.equal(bundledProgramIn(tree, 'claude'), path.join(dir, 'claude'));
      }
      if (row.deactivated)
        for (const harness of ['codex', 'claude']) assert.equal(ranAsFix(home, removalOf(harness)), 0, `${harness}'s removal ran`);
      const said: string[] = [];
      const done = carryHarnesses(home, { ...process.env, PATH: `${stubs}${path.delimiter}${process.env.PATH ?? ''}` }, tree, (line) =>
        said.push(line),
      );
      assert.deepEqual(
        done.harnesses.map((h) => ({ name: h.name, kind: h.kind })),
        row.carried,
      );
      assert.equal(done.code, row.code);
      assert.equal(fs.existsSync(ran), row.npmRan, said.join('\n'));
      assert.ok(said.length > 0, 'the carry says what it did');
    });
});

test("the daemon's start adopts a tree's harness where the tools folder has none, but not one a person deactivated, until its install takes the mark away", () => {
  const tree = bundlingTree();
  const fresh = scratch('wf-adopt-');
  assert.deepEqual(
    adoptBundled(fresh, [tree]).map((a) => a.name),
    ['claude'],
    'a store that never chose adopts what the tree carries',
  );

  const home = scratch('wf-adopt-');
  assert.equal(ranAsFix(home, removalOf('claude')), 0);
  const mark = path.join(toolsDir(home), 'harnesses', 'claude', DEACTIVATED);
  assert.ok(fs.existsSync(mark), 'the removal leaves its mark');
  assert.deepEqual(adoptBundled(home, [tree]), [], 'deactivated, it is not adopted');
  assert.equal(fs.existsSync(path.join(toolsBinDir(home), 'claude')), false);

  const stubs = scratch('wf-adopt-stubs-');
  fs.writeFileSync(path.join(stubs, 'npm'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const needs = HARNESS_DECLARATIONS.claude?.needs;
  assert.ok(needs !== undefined);
  ranAsFix(home, harnessInstallCommand('claude', needs), { ...process.env, PATH: `${stubs}${path.delimiter}${process.env.PATH ?? ''}` });
  assert.equal(fs.existsSync(mark), false, 'an install, even one that fails, takes the mark away: the person activated it');
  assert.deepEqual(
    adoptBundled(home, [tree]).map((a) => a.name),
    ['claude'],
    'and the tree is adopted again',
  );
});
