/**
 * The git place's `make` (`place/git/verbs/make.ts`), asked of `gitPlace` against scratch repositories: a worktree cut, one
 * already there taken up, a fan-in's merges clean and conflicting, and what `.worktreeinclude` copies and refuses — with the one parse of
 * that file, which `open` and `make` share (`worktreeInclude` in `place/git/git.ts`). Git runs with no user or system configuration and
 * a fixed identity, so a machine's hooks, default branch or signing change nothing here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { gitPlace } from '../place/git/place.ts';
import type { Made, PlaceOutcome } from '../src/runner.ts';
import { worktreeInclude } from '../place/git/git.ts';
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

/** A new repository on `main` with one commit of `f`, `g` and a `.gitignore` that ignores `.env.local` and `config/local/`. */
function repository(): string {
  const dir = scratch('wf-git-make-');
  git(dir, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(dir, 'f'), 'base\n');
  fs.writeFileSync(path.join(dir, 'g'), 'base\n');
  fs.writeFileSync(path.join(dir, '.gitignore'), '.env.local\nconfig/local/\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'base');
  return dir;
}

/** A branch `name` off main with `file` set to `text` in one commit, main checked out again; its tip. */
function branched(dir: string, name: string, file: string, text: string): string {
  git(dir, 'switch', '-q', '-c', name);
  fs.writeFileSync(path.join(dir, file), text);
  git(dir, 'commit', '-q', '-am', `${name} sets ${file}`);
  const tip = git(dir, 'rev-parse', 'HEAD');
  git(dir, 'switch', '-q', 'main');
  return tip;
}

/** Where a step's worktree is asked for: a folder of its own outside the repository, not made yet. */
const atOf = (step: string): string => path.join(scratch('wf-git-make-at-'), 'worktrees', 'r-1', step);

/** `make` of the git place, in `ENV`, its request as given. */
const make = (request: object): PlaceOutcome<'make'> => gitPlace({ env: ENV }).askNow('make', request as never);

/** The answer of an outcome, or a failure naming what it was instead. */
function madeOf(outcome: PlaceOutcome<'make'>): Made {
  assert.ok('answer' in outcome, `an answer expected, got ${JSON.stringify(outcome)}`);
  return outcome.answer;
}

test('make cuts a worktree at `at` on a new branch from `from`, and answers it with nothing merged and nothing to say', () => {
  const repo = repository();
  const tip = branched(repo, 'wf/r-1/a', 'f', 'a\n');
  const at = atOf('b');
  assert.deepEqual(madeOf(make({ repo, at, name: 'wf/r-1/b', from: 'wf/r-1/a', also: [] })), {
    workspace: at,
    branch: 'wf/r-1/b',
    conflicts: [],
    notes: [],
  });
  assert.equal(git(at, 'rev-parse', 'HEAD'), tip, "the new branch is at `from`'s tip");
  assert.equal(git(at, 'rev-parse', '--abbrev-ref', 'HEAD'), 'wf/r-1/b');
});

test('make takes up a worktree already at `at` on `name` where it stands, its commit kept, as a pass that died before filing left it; again on a second make', () => {
  const repo = repository();
  const at = atOf('a');
  git(repo, 'worktree', 'add', '-q', '-b', 'wf/r-1/a', at, 'main');
  fs.writeFileSync(path.join(at, 'f'), 'worked\n');
  git(at, 'commit', '-q', '-am', 'work');
  const head = git(at, 'rev-parse', 'HEAD');
  const asked = { repo, at, name: 'wf/r-1/a', from: 'main', also: [] };
  assert.deepEqual(madeOf(make(asked)), { workspace: at, branch: 'wf/r-1/a', conflicts: [], notes: [] });
  assert.deepEqual(madeOf(make(asked)), { workspace: at, branch: 'wf/r-1/a', conflicts: [], notes: [] });
  assert.equal(git(at, 'rev-parse', 'HEAD'), head, 'nothing cut again, nothing reset');
});

test('REFUSED: make on a repository that is no directory, on an `at` holding a worktree on another branch, and on a `from` git does not have', () => {
  const repo = repository();
  const nowhere = path.join(scratch('wf-git-make-plain-'), 'nowhere');
  assert.deepEqual(make({ repo: nowhere, at: atOf('a'), name: 'wf/r-1/a', from: 'main', also: [] }), {
    refused: `${nowhere} is not a directory, so no workspace can be cut from it`,
  });
  const at = atOf('a');
  git(repo, 'worktree', 'add', '-q', '-b', 'other', at, 'main');
  assert.deepEqual(make({ repo, at, name: 'wf/r-1/a', from: 'main', also: [] }), {
    refused: `${at} holds a worktree on other, not on wf/r-1/a: remove it with git worktree remove, then let the run cut it again`,
  });
  const fresh = atOf('b');
  const outcome = make({ repo, at: fresh, name: 'wf/r-1/b', from: 'no-such-branch', also: [] });
  assert.ok('refused' in outcome, JSON.stringify(outcome));
  const cut = 'could not be cut on wf/r-1/b from no-such-branch: ';
  assert.ok(outcome.refused.includes(cut), outcome.refused);
  assert.ok(outcome.refused.slice(outcome.refused.indexOf(cut) + cut.length).includes('no-such-branch'), "and git's own words name it");
});

test('make is unread for a request whose `also` is no list of strings', () => {
  const outcome = make({ repo: repository(), at: atOf('a'), name: 'wf/r-1/a', from: 'main' });
  assert.ok('unread' in outcome, JSON.stringify(outcome));
  assert.equal(outcome.unread.said, "the request's `also` is missing, where a list of strings is asked");
});

test("a fan-in's merges: clean, they answer no conflict; conflicting, the markers are left and the paths answered, by a take-up of that tree too", () => {
  const repo = repository();
  branched(repo, 'wf/r-1/a', 'f', 'a\n');
  branched(repo, 'wf/r-1/b', 'g', 'b\n');
  branched(repo, 'wf/r-1/c', 'f', 'c\n');
  const clean = atOf('merge');
  assert.deepEqual(madeOf(make({ repo, at: clean, name: 'wf/r-1/merge', from: 'wf/r-1/a', also: ['wf/r-1/b'] })), {
    workspace: clean,
    branch: 'wf/r-1/merge',
    conflicts: [],
    notes: [],
  });
  assert.equal(fs.readFileSync(path.join(clean, 'g'), 'utf8'), 'b\n', 'the other branch is merged in');
  assert.equal(git(clean, 'status', '--porcelain'), '', 'and committed');

  const torn = atOf('torn');
  const asked = { repo, at: torn, name: 'wf/r-1/torn', from: 'wf/r-1/a', also: ['wf/r-1/c', 'wf/r-1/b'] };
  const made = madeOf(make(asked));
  assert.deepEqual(made.conflicts, ['f']);
  assert.deepEqual(made.notes, [], 'a merge that conflicts is the step’s work, not a note');
  assert.match(fs.readFileSync(path.join(torn, 'f'), 'utf8'), /^<<<<<<< /m, 'the markers are left');
  assert.deepEqual(madeOf(make(asked)).conflicts, ['f'], 'a take-up of the torn tree answers the same paths');
});

test('a merge of a branch git does not have is a note, not a conflict', () => {
  const repo = repository();
  const at = atOf('merge');
  const made = madeOf(make({ repo, at, name: 'wf/r-1/merge', from: 'main', also: ['wf/r-1/gone'] }));
  assert.deepEqual(made.conflicts, []);
  assert.equal(made.notes.length, 1);
  assert.match(made.notes[0], /^merge: wf\/r-1\/gone was not merged — .*wf\/r-1\/gone/);
});

test('make copies what .worktreeinclude lists and git ignores, never over a file there; a tracked file, a path out of the repository and .git are refused, by name', () => {
  const repo = repository();
  fs.writeFileSync(path.join(repo, '.env.local'), 'TOKEN=main\n');
  fs.mkdirSync(path.join(repo, 'config/local/deeper'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'config/local/deeper/a.json'), '{}\n');
  const outside = scratch('wf-git-make-outside-');
  fs.symlinkSync(outside, path.join(repo, 'escape'));
  fs.appendFileSync(path.join(repo, '.gitignore'), 'escape\n');
  fs.writeFileSync(
    path.join(repo, '.worktreeinclude'),
    ['/.env.local', 'config/local/', 'f', 'escape', 'missing.txt', '.git', '.git/config', 'node_modules', ''].join('\n'),
  );
  const at = atOf('a');
  git(repo, 'worktree', 'add', '-q', '-b', 'wf/r-1/a', at, 'main');
  fs.writeFileSync(path.join(at, '.env.local'), 'TOKEN=mine\n');
  const dotGit = fs.readFileSync(path.join(at, '.git'), 'utf8');

  const made = madeOf(make({ repo, at, name: 'wf/r-1/a', from: 'main', also: [] }));
  assert.deepEqual(made.notes, [
    '.worktreeinclude: skipped missing.txt — not in the main checkout',
    `.worktreeinclude: refused ".git" is git's own`,
    `.worktreeinclude: refused ".git/config" is git's own`,
    '.worktreeinclude: refused "f" is not gitignored — the hand-off would commit it',
    '.worktreeinclude: refused "escape" leads outside the repository',
  ]);
  assert.equal(fs.readFileSync(path.join(at, 'config/local/deeper/a.json'), 'utf8'), '{}\n', 'a listed directory arrives, whole');
  assert.equal(fs.readFileSync(path.join(at, '.env.local'), 'utf8'), 'TOKEN=mine\n', 'a file already there is never overwritten');
  assert.equal(fs.readFileSync(path.join(at, 'f'), 'utf8'), 'base\n', 'a tracked file is not copied over');
  assert.equal(fs.readFileSync(path.join(at, '.git'), 'utf8'), dotGit, "the worktree's .git file is git's, untouched");
  assert.ok(!fs.existsSync(path.join(at, 'escape')), 'nor a link that leads out');
  assert.ok(!fs.existsSync(path.join(at, 'node_modules')), 'nor a node_modules, which the orchestrator makes');
  assert.equal(git(at, 'status', '--porcelain'), '', 'so the cut leaves nothing for the hand-off to commit');
});

test('a .worktreeinclude that is no file is a note of make, which cuts all the same', () => {
  const repo = repository();
  fs.mkdirSync(path.join(repo, '.worktreeinclude'));
  const at = atOf('a');
  assert.deepEqual(madeOf(make({ repo, at, name: 'wf/r-1/a', from: 'main', also: [] })).notes, [
    `.worktreeinclude: not read — ${path.join(repo, '.worktreeinclude')} is not a file`,
  ]);
  assert.ok(fs.existsSync(path.join(at, 'f')));
});

test(".worktreeinclude: paths to copy, a leading / anchored at the root as gitignore's is, node_modules set aside, and every line outside the repository refused by name", () => {
  const text = [
    '# what a worktree needs',
    '',
    '.env.local',
    'config/local/',
    './tools/cache.json',
    '  spaced.txt  ',
    '.env.local',
    '/.env.local',
    'node_modules',
    'apps/web/node_modules',
    '../x',
    'a/../../y',
    '/etc/hosts',
    '/../z',
    'C:\\secrets',
    '.',
    '/',
    '.git',
    '.git/hooks',
  ].join('\n');
  assert.deepEqual(
    worktreeInclude(text),
    {
      copy: ['.env.local', 'config/local', 'tools/cache.json', 'spaced.txt', 'etc/hosts'],
      provisioned: ['node_modules', 'apps/web/node_modules'],
      refused: [
        { line: '../x', why: 'is outside the repository' },
        { line: 'a/../../y', why: 'is outside the repository' },
        { line: '/../z', why: 'is outside the repository' },
        { line: 'C:\\secrets', why: 'is absolute' },
        { line: '.', why: 'is the repository itself' },
        { line: '/', why: 'is the repository itself' },
        { line: '.git', why: "is git's own" },
        { line: '.git/hooks', why: "is git's own" },
      ],
    },
    "a leading / is the repository's root, as in a .gitignore",
  );
});
