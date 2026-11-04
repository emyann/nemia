/**
 * The runtime's Agent SDK is pinned exactly, and the lock, the installed tree and the Claude Code that SDK bundles all agree with the
 * pin (`sdk-pin.ts`).
 *
 * The fault this holds against happened: the spec said `^0.3.261`, the lock held 0.3.270, and every session of the factory ran a
 * Claude Code eleven versions behind the owner's own terminal, where the alias `opus` named a different model — a drift nothing
 * failed on, because a range is satisfied by whatever the lock happens to hold. So the spec's *shape* is the subject as much as its
 * value, and every rule here is a function of what was read: `pinRefusals` is given the tree as it is and then given a tree with each
 * fact broken in turn, so each refusal is seen to happen rather than assumed. Each names the one command that moves all four
 * together.
 *
 * The pin is the runtime's own fact and lives here, not in `agent-orchestrator/test/contract.test.ts`: that scans every package's
 * manifest for which layer may import what, and the runtime's dependency versions are not the orchestrator's to keep.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CLAUDE_CODE_VERSION, SDK_VERSION } from './sdk-pin.ts';

const PKG = path.join(import.meta.dirname, '..');
const ROOT = path.join(PKG, '..', '..');
const DEP = '@anthropic-ai/claude-agent-sdk';

/**
 * What to type where the tree disagrees with the pin: the one command that moves all four together. Without `--save-exact` npm writes
 * `^` before the version it installs.
 */
const FIX = `npm install ${DEP}@${SDK_VERSION} --save-exact --workspace agent-runtime, from the workspace root, and commit the lock with it`;

/** Whether `spec` names one version and no range: `0.3.316`, never `^0.3.316`, `~0.3.316`, `0.3.x`, `>=0.3.316` or `*`. */
const isExact = (spec: string): boolean => /^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(spec);

/** The tree's four facts about the SDK, as the three files on disk say them. */
type Pinned = {
  /** What `packages/agent-runtime/package.json` asks for. */
  spec: string;
  /** What the root lock holds, by its entry's path. */
  locked: [string, string | undefined][];
  /** What is installed under `node_modules`, and the Claude Code it bundles. */
  installed: { version: string; claudeCodeVersion?: string };
};

/** Where `tree` disagrees with the pin, each worded with what to type. */
const pinRefusals = (tree: Pinned): string[] => {
  const out: string[] = [];
  if (!isExact(tree.spec))
    out.push(`packages/agent-runtime/package.json asks for ${DEP} as \`${tree.spec}\`, a range: the lock can fall behind it. Type: ${FIX}`);
  else if (tree.spec !== SDK_VERSION) out.push(`the manifest pins ${tree.spec} and test/sdk-pin.ts says ${SDK_VERSION}. Type: ${FIX}`);
  if (tree.locked.length < 2)
    out.push(`the lock names ${tree.locked.length} entries for ${DEP}: it should hold its own and its platform binaries. Type: ${FIX}`);
  for (const [at, held] of tree.locked)
    if (held !== SDK_VERSION) out.push(`the lock holds ${at} at ${held}, not ${SDK_VERSION}. Type: ${FIX}`);
  if (tree.installed.version !== SDK_VERSION) out.push(`node_modules holds ${DEP}@${tree.installed.version}. Type: ${FIX}`);
  if (tree.installed.claudeCodeVersion !== CLAUDE_CODE_VERSION)
    out.push(
      `${DEP}@${tree.installed.version} bundles Claude Code ${tree.installed.claudeCodeVersion}, and test/sdk-pin.ts says ` +
        `${CLAUDE_CODE_VERSION}. Re-measure the two constants together: the alias \`opus\` resolves inside that Claude Code, so its ` +
        "version is what makes the factory's sessions and the owner's own terminal mean the same model.",
    );
  return out;
};

const read = (at: string): unknown => JSON.parse(fs.readFileSync(at, 'utf8'));

/** The tree as it stands. */
const onDisk = (): Pinned => {
  const { dependencies } = read(path.join(PKG, 'package.json')) as { dependencies: Record<string, string> };
  const { packages } = read(path.join(ROOT, 'package-lock.json')) as { packages: Record<string, { version?: string }> };
  return {
    spec: dependencies[DEP],
    locked: Object.entries(packages)
      .filter(([at]) => at.includes(DEP))
      .map(([at, held]) => [at, held.version]),
    installed: read(path.join(ROOT, 'node_modules', DEP, 'package.json')) as Pinned['installed'],
  };
};

test('the manifest, the lock, the installed tree and the bundled Claude Code all say the pin', () => {
  const tree = onDisk();
  assert.ok(tree.locked.length > 1, `the lock names ${tree.locked.length} entries for ${DEP}`);
  assert.deepEqual(pinRefusals(tree), []);
});

test('REFUSED: every range npm takes as a spec for the SDK; the exact version alone is a pin', () => {
  const tree = onDisk();
  for (const range of ['^0.3.308', '~0.3.308', '0.3.x', '0.3', '>=0.3.308', '>0.3.307 <0.4.0', '*', 'latest', '0.3.308 || 0.3.307'])
    assert.deepEqual(
      pinRefusals({ ...tree, spec: range }),
      [`packages/agent-runtime/package.json asks for ${DEP} as \`${range}\`, a range: the lock can fall behind it. Type: ${FIX}`],
      `${range} is a range: the lock can fall behind it, which is the fault this file exists for`,
    );
  assert.deepEqual(pinRefusals({ ...tree, spec: '0.3.307' }), [
    `the manifest pins 0.3.307 and test/sdk-pin.ts says ${SDK_VERSION}. Type: ${FIX}`,
  ]);
  assert.deepEqual(
    pinRefusals({ ...tree, spec: '1.0.0-rc.1' }),
    [`the manifest pins 1.0.0-rc.1 and test/sdk-pin.ts says ${SDK_VERSION}. Type: ${FIX}`],
    'a prerelease names one version too, and is refused only for being the wrong one',
  );
});

test('REFUSED: a lock entry behind the pin, a lock that names the SDK once, an installed tree behind it, and a Claude Code that is not the one measured', () => {
  const tree = onDisk();
  assert.deepEqual(pinRefusals({ ...tree, locked: [[`node_modules/${DEP}`, '0.3.270'], ...tree.locked.slice(1)] }), [
    `the lock holds node_modules/${DEP} at 0.3.270, not ${SDK_VERSION}. Type: ${FIX}`,
  ]);
  assert.deepEqual(pinRefusals({ ...tree, locked: [[`node_modules/${DEP}`, SDK_VERSION]] }), [
    `the lock names 1 entries for ${DEP}: it should hold its own and its platform binaries. Type: ${FIX}`,
  ]);
  assert.deepEqual(pinRefusals({ ...tree, installed: { ...tree.installed, version: '0.3.270' } }), [
    `node_modules holds ${DEP}@0.3.270. Type: ${FIX}`,
  ]);
  const stale = pinRefusals({ ...tree, installed: { ...tree.installed, claudeCodeVersion: '2.1.270' } });
  assert.equal(stale.length, 1);
  assert.match(stale[0], /bundles Claude Code 2\.1\.270/);
  assert.match(stale[0], /the same model/, 'and the refusal says why the bundled version is the fact that matters');
});
