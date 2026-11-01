/**
 * The git place's `inventory` and `remove` (`place/git/verbs/`), asked of `gitPlace` against scratch repositories: what a run left, read —
 * each worktree inside `under` with its tip, whether it may be removed (held by its lock, gone where git could prune it), what it holds
 * uncommitted and whether its work is on a branch, and each branch of the run with whether it is merged — and taken away, never forced.
 * Each with an answer, a refusal or an empty answer, and an unread outcome, which is never an empty one. Git runs with no user or system
 * configuration
 * and a fixed identity, so a machine's hooks, default branch or signing change nothing here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { gitPlace } from '../place/git/place.ts';
import type { PlaceOutcome, PlaceVerb } from '../src/runner.ts';
import { scratch } from './scratch.ts';

/** The environment git runs in: this process's, without its git variables, with no configuration read and one identity. */
const ENV: NodeJS.ProcessEnv = {
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))),
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@local',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@local',
};

/** Git in `dir`, its stdout trimmed. */
const git = (dir: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd: dir, env: ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** A new repository on `main` with one commit of `f`, its path resolved, as git names its worktrees. */
function repository(): string {
  const dir = fs.realpathSync(scratch('wf-git-inventory-'));
  git(dir, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(dir, 'f'), 'base\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'base');
  return dir;
}

/** `verb` of the git place, in `ENV`, its request as given: one the contract's type refuses is how a malformed request is sent. */
const run = <V extends PlaceVerb>(verb: V, request: object): PlaceOutcome<V> => gitPlace({ env: ENV }).askNow(verb, request as never);

/** The answer of an outcome, or a failure naming what it was instead. */
function answerOf<V extends PlaceVerb>(outcome: PlaceOutcome<V>): Extract<PlaceOutcome<V>, { answer: unknown }>['answer'] {
  assert.ok('answer' in outcome, `an answer expected, got ${JSON.stringify(outcome)}`);
  return outcome.answer;
}

/** The words of an unread outcome, or a failure naming what it was instead. */
function unreadOf(outcome: PlaceOutcome<PlaceVerb>): string {
  assert.ok('unread' in outcome, `unread expected, got ${JSON.stringify(outcome)}`);
  return outcome.unread.said;
}

/**
 * A repository with a run's worktrees under `<repo>-wt/x`: `a` clean on `wf/x/a`; `b` on `wf/x/b`, locked with a reason that has spaces;
 * `c` detached at main's commit, which is on a branch; `d` detached at a commit made there, on none; `g` detached at main's commit with a
 * change to `f`; `e` on `wf/x/e` with a change to `f` and a new file; `p` on `wf/x/p`, its directory gone; and one outside `under`.
 * Branches: `wf/x/ahead` with a commit main has not, `wf/y/a`, another run's, and `other`.
 */
function aRun() {
  const repo = repository();
  const under = `${repo}-wt/x`;
  const at = (name: string) => path.join(under, name);
  git(repo, 'worktree', 'add', '-q', '-b', 'wf/x/a', at('a'));
  git(repo, 'worktree', 'add', '-q', '-b', 'wf/x/b', at('b'));
  git(repo, 'worktree', 'lock', '--reason', 'a person holds it', at('b'));
  git(repo, 'worktree', 'add', '-q', '--detach', at('c'), 'main');
  git(repo, 'worktree', 'add', '-q', '--detach', at('d'), 'main');
  fs.writeFileSync(path.join(at('d'), 'rebased'), 'rebased\n');
  git(at('d'), 'add', '-A');
  git(at('d'), 'commit', '-q', '-m', 'made on no branch');
  git(repo, 'worktree', 'add', '-q', '--detach', at('g'), 'main');
  fs.writeFileSync(path.join(at('g'), 'f'), 'changed\n');
  git(repo, 'worktree', 'add', '-q', '-b', 'wf/x/e', at('e'));
  fs.writeFileSync(path.join(at('e'), 'f'), 'changed\n');
  fs.writeFileSync(path.join(at('e'), 'new.txt'), 'new\n');
  git(repo, 'worktree', 'add', '-q', '-b', 'wf/x/p', at('p'));
  fs.rmSync(at('p'), { recursive: true });
  git(repo, 'worktree', 'add', '-q', '-b', 'wf/x/outside', `${repo}-wt/elsewhere`);
  git(repo, 'branch', 'wf/x/ahead');
  git(repo, 'switch', '-q', 'wf/x/ahead');
  fs.writeFileSync(path.join(repo, 'g'), 'ahead\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'ahead');
  git(repo, 'switch', '-q', 'main');
  git(repo, 'branch', 'wf/y/a');
  git(repo, 'branch', 'other');
  return { repo, under, at, main: git(repo, 'rev-parse', 'main'), d: git(at('d'), 'rev-parse', 'HEAD') };
}

test("inventory answers the worktrees inside `under` as git lists them, and the run's branches with whether each is merged into the base", () => {
  const r = aRun();
  const answer = answerOf(run('inventory', { repo: r.repo, under: r.under, run: 'x', base: 'main' }));
  assert.deepEqual(answer.workspaces, [
    { path: r.at('a'), tip: r.main, branch: 'wf/x/a', removable: 'yes', clean: true, onBranch: true },
    { path: r.at('b'), tip: r.main, branch: 'wf/x/b', removable: 'held', heldBy: 'a person holds it', clean: null, onBranch: true },
    { path: r.at('c'), tip: r.main, removable: 'yes', clean: true, onBranch: true },
    { path: r.at('d'), tip: r.d, removable: 'yes', clean: true, onBranch: false },
    { path: r.at('e'), tip: r.main, branch: 'wf/x/e', removable: 'yes', clean: false, onBranch: true, changes: ['f', 'new.txt'] },
    { path: r.at('g'), tip: r.main, removable: 'yes', clean: false, onBranch: false, changes: ['f'] },
    { path: r.at('p'), tip: r.main, branch: 'wf/x/p', removable: 'gone', clean: null, onBranch: true },
  ]);
  assert.deepEqual(answer.branches, [
    { branch: 'wf/x/a', merged: true },
    { branch: 'wf/x/ahead', merged: false },
    { branch: 'wf/x/b', merged: true },
    { branch: 'wf/x/e', merged: true },
    { branch: 'wf/x/outside', merged: true },
    { branch: 'wf/x/p', merged: true },
  ]);
});

test('inventory reads `under` through its links, as git names a worktree, and never takes `under` itself for one of its worktrees', () => {
  const repo = repository();
  const real = `${repo}-wt`;
  git(repo, 'worktree', 'add', '-q', '-b', 'wf/x/self', path.join(real, 'x'), 'main');
  git(repo, 'worktree', 'add', '-q', '-b', 'wf/x/a', path.join(real, 'x', 'a'));
  const link = `${repo}-link`;
  fs.symlinkSync(real, link);
  const answer = answerOf(run('inventory', { repo, under: path.join(link, 'x'), run: 'x', base: 'main' }));
  assert.deepEqual(
    answer.workspaces.map((w) => w.path),
    [path.join(real, 'x', 'a')],
  );
});

test('inventory answers nothing left of a repository that is no directory: the run is forgotten with no worktree and no branch', () => {
  const gone = path.join(scratch('wf-git-inventory-gone-'), 'repo');
  assert.deepEqual(answerOf(run('inventory', { repo: gone, under: gone, run: 'x', base: 'main' })), {
    workspaces: [],
    branches: [],
  });
});

test('REFUSED as unread, never as nothing to remove: an inventory of a directory git cannot list as a repository', () => {
  const plain = scratch('wf-git-inventory-plain-');
  const outcome = run('inventory', { repo: plain, under: path.join(plain, 'x'), run: 'x', base: 'main' });
  assert.ok(!('answer' in outcome), `no answer, empty or not: ${JSON.stringify(outcome)}`);
  assert.equal(
    unreadOf(outcome),
    'inventory threw before it answered: Command failed: git worktree list --porcelain / ' +
      'fatal: not a git repository (or any of the parent directories): .git',
    'one line: the command, and what git said',
  );
});

test('inventory and remove are unread for a request they cannot read', () => {
  assert.equal(
    unreadOf(run('inventory', { repo: '/', under: '/', base: 'main' })),
    "the request's `run` is missing, where a string is asked",
  );
  assert.equal(
    unreadOf(run('remove', { repo: '/', workspaces: '/w', branches: [] })),
    'the request\'s `workspaces` is "/w", where a list of strings is asked',
  );
});

test('remove takes a clean worktree away, leaves one holding a change in git words and on disk — never forced — prunes what is gone, deletes a branch and keeps one git will not delete', () => {
  const r = aRun();
  const answer = answerOf(run('remove', { repo: r.repo, workspaces: [r.at('a'), r.at('e')], branches: ['wf/x/ahead', 'main'] }));
  assert.deepEqual(answer.removed, [r.at('a')]);
  assert.deepEqual(
    answer.left.map((l) => l.path),
    [r.at('e')],
  );
  assert.match(answer.left[0].said, /contains modified or untracked files, use --force to delete it/);
  assert.ok(fs.existsSync(path.join(r.at('e'), 'new.txt')), 'the change is where it was');
  assert.ok(!fs.existsSync(r.at('a')));
  assert.deepEqual(answer.deleted, ['wf/x/ahead']);
  assert.deepEqual(
    answer.kept.map((k) => k.branch),
    ['main'],
  );
  assert.match(answer.kept[0].said, /main/);
  const listed = git(r.repo, 'worktree', 'list', '--porcelain');
  assert.ok(!listed.includes(r.at('p')), 'the worktree whose directory was gone is pruned from git list');
  assert.equal(git(r.repo, 'branch', '--list', 'wf/x/ahead'), '');
});

test('REFUSED: remove in a repository that is no directory, naming it', () => {
  const gone = path.join(scratch('wf-git-remove-gone-'), 'repo');
  assert.deepEqual(run('remove', { repo: gone, workspaces: [], branches: ['wf/x/a'] }), {
    refused: `${gone} is not a directory, so there is no repository to remove anything from`,
  });
});
