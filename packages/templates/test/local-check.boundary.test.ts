/**
 * sdlc's default `localCheck`, `sdlc/carried/local-check.ts`: which of a repository's npm scripts it runs (`localPlan`), and, run in a
 * scratch folder as a check runs it, that a folder Nemia knows nothing of passes and a script that fails refuses.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { localPlan } from '../sdlc/carried/local-check.ts';

const SCRIPT = path.join(import.meta.dirname, '..', 'sdlc', 'carried', 'local-check.ts');

/** The placeholder test `npm init` writes. */
const PLACEHOLDER = 'echo "Error: no test specified" && exit 1';

describe('the scripts a local check runs: lint, typecheck and test, each where declared, npm init’s test left out', () => {
  const rows: Array<[string, unknown, string[]]> = [
    ['no manifest', null, []],
    ['no scripts', { name: 'x' }, []],
    ['all three, in order', { scripts: { test: 'vitest', lint: 'oxlint', typecheck: 'tsc' } }, ['lint', 'typecheck', 'test']],
    ['the placeholder test', { scripts: { test: PLACEHOLDER } }, []],
    ['an empty one and another name', { scripts: { lint: ' ', build: 'tsc' } }, []],
    ['a script that is no string', { scripts: { test: 1 } }, []],
  ];
  for (const [name, manifest, plan] of rows) test(name, () => assert.deepEqual(localPlan(manifest), plan));
});

/** The script run in `dir` with `args`, by default naming npm as its runner: its exit. */
const ran = (dir: string, args: readonly string[] = ['--runner', 'npm']): number | null =>
  spawnSync(process.execPath, [SCRIPT, ...args], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 }).status;

test('a folder with no package.json, and one whose only test is the placeholder, pass; a lint that fails refuses', () => {
  assert.equal(ran(scratch('wf-local-none-')), 0);
  const placeholder = scratch('wf-local-init-');
  fs.writeFileSync(path.join(placeholder, 'package.json'), JSON.stringify({ name: 'x', scripts: { test: PLACEHOLDER } }));
  assert.equal(ran(placeholder), 0);
  const failing = scratch('wf-local-lint-');
  fs.writeFileSync(path.join(failing, 'package.json'), JSON.stringify({ name: 'x', scripts: { lint: 'exit 3' } }));
  assert.notEqual(ran(failing), 0);
});

test('REFUSED: no runner named, or one with no command after it, exits 2 and runs nothing', () => {
  const failing = scratch('wf-local-runner-');
  fs.writeFileSync(path.join(failing, 'package.json'), JSON.stringify({ name: 'x', scripts: { lint: 'exit 3' } }));
  assert.equal(ran(failing, []), 2);
  assert.equal(ran(failing, ['--runner']), 2);
});
