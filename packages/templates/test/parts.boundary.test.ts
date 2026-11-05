/**
 * sdlc's parts door (`sdlc/workflows/build/parts.ts`, which `quick/` carries byte for byte): before the implement step signs off, every
 * other branch of its run is held by its own, by patch as the landing reads it, or declared replaced and removed by the script, its tip
 * kept. Driven as the step and its check drive it, in a scratch repository on a run's branch, each call a bounded subprocess.
 *
 * Its subject is git and a spawned script: a boundary file.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';

const SCRIPT = path.join(import.meta.dirname, '..', 'sdlc', 'workflows', 'build', 'parts.ts');

/** Run git in `dir`, as nobody in particular. */
const git = (dir: string, ...args: string[]): string =>
  execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

/** Write `file` in `dir` and commit it as `message`. */
const commit = (dir: string, file: string, text: string, message: string): void => {
  fs.writeFileSync(path.join(dir, file), text);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', message);
};

/** A scratch repository on `main` with one commit, and the run's branch `wf/r-1/run` checked out on it. */
function repo(): string {
  const dir = scratch('wf-parts-repo-');
  git(dir, 'init', '-q', '-b', 'main');
  commit(dir, 'README.md', 'base\n', 'base');
  git(dir, 'checkout', '-q', '-b', 'wf/r-1/run');
  return dir;
}

/** A part branch `wf/r-1/<part>` cut from `main`, one commit writing `file`; HEAD is left where it was. */
function part(dir: string, name: string, file: string, text: string): string {
  const here = git(dir, 'symbolic-ref', '--short', 'HEAD');
  git(dir, 'checkout', '-q', '-b', `wf/r-1/${name}`, 'main');
  commit(dir, file, text, `${name}: ${file}`);
  const tip = git(dir, 'rev-parse', 'HEAD');
  git(dir, 'checkout', '-q', here);
  return tip;
}

type Ran = { code: number | null; out: string; err: string };

/** Run the script's `verb` in `dir`, bounded. */
function parts(dir: string, ...args: string[]): Ran {
  const ran = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: dir,
    env: { PATH: process.env.PATH ?? '', HOME: dir },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60_000,
  });
  return { code: ran.status, out: ran.stdout, err: ran.stderr };
}

const branches = (dir: string): string[] =>
  git(dir, 'for-each-ref', '--format=%(refname)', 'refs/heads/wf/', 'refs/backup/').split('\n').filter(Boolean);

test('a run whose parts are each taken, as a commit of its own, passes, and so does a run with no part', () => {
  const dir = repo();
  assert.equal(parts(dir, 'check').code, 0, 'no part');
  const tip = part(dir, 'p1', 'a.ts', 'a\n');
  git(dir, '-c', 'user.name=t', '-c', 'user.email=t@t', 'cherry-pick', tip);
  const passed = parts(dir, 'check');
  assert.equal(passed.code, 0, passed.err);
  assert.match(passed.out, /wf\/r-1\/p1/);
});

test('REFUSED: a part whose patch the run does not hold; declared replaced, its branch is removed and its tip kept, and the check passes', () => {
  const dir = repo();
  const tip = part(dir, 'p4', 'a.ts', 'an earlier cut\n');
  commit(dir, 'a.ts', 'the cut that replaced it\n', 'p4: a.ts');
  const refused = parts(dir, 'check');
  assert.equal(refused.code, 1, refused.out);
  assert.ok(refused.err.includes('wf/r-1/p4') && refused.err.includes(tip.slice(0, 12)), refused.err);
  assert.ok(refused.err.includes('parts.ts" replaced p4'), `it names the fix:\n${refused.err}`);

  const declared = parts(dir, 'replaced', 'p4');
  assert.equal(declared.code, 0, declared.err);
  assert.deepEqual(branches(dir), ['refs/heads/wf/r-1/run', 'refs/backup/wf/r-1/p4'].sort());
  assert.equal(git(dir, 'rev-parse', 'refs/backup/wf/r-1/p4'), tip, 'the tip is kept');
  assert.equal(parts(dir, 'check').code, 0);
});

test("REFUSED: declaring replaced the step's own branch, a branch the run has not, or a part the run already holds", () => {
  const dir = repo();
  const tip = part(dir, 'p1', 'a.ts', 'a\n');
  part(dir, 'p2', 'b.ts', 'b\n');
  git(dir, '-c', 'user.name=t', '-c', 'user.email=t@t', 'cherry-pick', tip);
  for (const named of ['run', 'p9', 'p1']) {
    const refused = parts(dir, 'replaced', 'p2', named);
    assert.equal(refused.code, 1, `${named}: ${refused.out}`);
    assert.equal(refused.out, '');
  }
  assert.deepEqual(branches(dir), ['refs/heads/wf/r-1/p1', 'refs/heads/wf/r-1/p2', 'refs/heads/wf/r-1/run'], 'nothing is removed');
});

test('REFUSED: declaring replaced a part a worktree has checked out', () => {
  const dir = repo();
  part(dir, 'p2', 'b.ts', 'b\n');
  git(dir, 'worktree', 'add', '-q', path.join(scratch('wf-parts-tree-'), 'p2'), 'wf/r-1/p2');
  const refused = parts(dir, 'replaced', 'p2');
  assert.equal(refused.code, 1, refused.out);
  assert.ok(branches(dir).includes('refs/heads/wf/r-1/p2'), 'it is not removed');
});

test("REFUSED: a branch that is no run's, and a verb the script has not", () => {
  const dir = repo();
  git(dir, 'checkout', '-q', 'main');
  assert.equal(parts(dir, 'check').code, 1);
  git(dir, 'checkout', '-q', 'wf/r-1/run');
  assert.equal(parts(dir, 'delete').code, 1);
});
