/**
 * The git place's `standing` (`place/git/scripts/standing.ts`), run through `runPlaceVerb` against scratch repositories: every head of the
 * repository, and for each branch asked of whether it is on its base, whether it holds work past its run's base, how far ahead it is,
 * a gone branch judged by the tip its run recorded, and its refusals. Its two fallbacks are made to answer by a `git` planted on `PATH`:
 * one that refuses `%(ahead-behind:…)` as a git older than 2.41 does, and a `baseRef` git cannot read. Git runs with no user or system
 * configuration and a fixed identity.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { runPlaceVerb } from '../src/runner.ts';
import type { PlaceOutcome } from '../src/runner.ts';
import { shippedOver } from '../src/branches/branches.ts';
import { scratch } from './scratch.ts';

/** The git place the package ships. */
const GIT_SKILL = path.join(import.meta.dirname, '..', 'place', 'git');

/** The environment git and the script run in: this process's, without its git variables, with no configuration read and one identity. */
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

/** A commit on the branch `dir` has checked out, of `file` written with `text`. */
function commit(dir: string, file: string, text: string): string {
  fs.writeFileSync(path.join(dir, file), text);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', file);
  return git(dir, 'rev-parse', 'HEAD');
}

/** A commit no repository has. */
const NOWHERE = 'f'.repeat(40);

/**
 * A repository on `main`, cut at `cut`: `wf/r/a` merged into it, `wf/r/b` not, `wf/r/e` cut after the merge with nothing of its own,
 * `wf/r/g` merged and deleted at `gone`.
 */
function repository() {
  const dir = scratch('wf-standing-');
  git(dir, 'init', '-q', '-b', 'main');
  const cut = commit(dir, 'base.txt', 'base\n');
  for (const [branch, file] of [
    ['wf/r/a', 'a.txt'],
    ['wf/r/b', 'b.txt'],
    ['wf/r/g', 'g.txt'],
  ]) {
    git(dir, 'switch', '-q', '-c', branch, cut);
    commit(dir, file, `${file}\n`);
  }
  const gone = git(dir, 'rev-parse', 'wf/r/g');
  git(dir, 'switch', '-q', 'main');
  git(dir, 'merge', '-q', '--no-ff', '-m', 'land a', 'wf/r/a');
  git(dir, 'merge', '-q', '--no-ff', '-m', 'land g', 'wf/r/g');
  git(dir, 'branch', '-q', '-D', 'wf/r/g');
  const landed = git(dir, 'rev-parse', 'main');
  git(dir, 'branch', 'wf/r/e', landed);
  return { dir, cut, gone, landed };
}

/** `standing` of the git place, in `env`, its request as given: one the contract's type refuses is how a malformed request is sent. */
const standing = (asked: object, env: NodeJS.ProcessEnv = ENV): PlaceOutcome<'standing'> =>
  runPlaceVerb(GIT_SKILL, 'standing', asked as never, { env });

/** The answer of an outcome, or a failure naming what it was instead. */
function answerOf(outcome: PlaceOutcome<'standing'>) {
  assert.ok('answer' in outcome, `an answer expected, got ${JSON.stringify(outcome)}`);
  return outcome.answer;
}

/** The branches asked of `repository()`'s `dir`, each against the commit its run was cut at. */
function asked({ cut, gone, landed }: ReturnType<typeof repository>) {
  return [
    { branch: 'wf/r/a', baseRef: cut },
    { branch: 'wf/r/b', baseRef: cut },
    { branch: 'wf/r/e', baseRef: landed },
    { branch: 'wf/r/g', tip: gone, baseRef: cut },
    { branch: 'wf/r/never', baseRef: cut },
    { branch: 'wf/r/lost', tip: NOWHERE, baseRef: cut },
  ];
}

/** What `standing` answers of `asked(repo)`, whichever way git is asked. */
const STOOD = [
  { branch: 'wf/r/a', onBase: 'yes', pastBase: true, ahead: 0 },
  { branch: 'wf/r/b', onBase: 'no', pastBase: null, ahead: 1 },
  { branch: 'wf/r/e', onBase: 'yes', pastBase: false, ahead: 0 },
  { branch: 'wf/r/g', tip: null, onBase: 'yes', pastBase: true, ahead: null },
  { branch: 'wf/r/never', tip: null, onBase: 'unknown', pastBase: null, ahead: null },
  { branch: 'wf/r/lost', tip: null, onBase: 'unknown', pastBase: null, ahead: null },
];

/** `STOOD` with each branch's tip as `dir` has it. */
const stood = (dir: string) => STOOD.map((s) => ({ tip: 'tip' in s ? s.tip : git(dir, 'rev-parse', s.branch), ...s }));

/**
 * A `git` on a `PATH` of its own, which writes each call's arguments as a line of `calls` and refuses a `for-each-ref` format that
 * names `refuse`, as git does a field it does not know, before handing the rest to the git this process finds.
 */
function plantedGit(refuse: string) {
  const bin = scratch('wf-standing-git-');
  const calls = path.join(bin, 'calls');
  const real = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
  fs.writeFileSync(
    path.join(bin, 'git'),
    [
      '#!/bin/sh',
      `printf '%s\\n' "$*" >> '${calls}'`,
      `case "$*" in *for-each-ref*${refuse}*) echo "fatal: unknown field name: ${refuse}" >&2; exit 128;; esac`,
      `exec '${real}' "$@"`,
    ].join('\n'),
    { mode: 0o755 },
  );
  const env = { ...ENV, PATH: `${bin}${path.delimiter}${ENV.PATH ?? ''}` };
  const said = (): string[] => (fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').trim().split('\n') : []);
  return { env, said };
}

test('standing answers every head, and where each branch stands: on its base or not, past its base, how far ahead', () => {
  const repo = repository();
  const answer = answerOf(standing({ repo: repo.dir, base: 'main', branches: asked(repo) }));
  assert.deepEqual(answer.branches, stood(repo.dir));
  assert.deepEqual(answer.heads, {
    main: repo.landed,
    'wf/r/a': git(repo.dir, 'rev-parse', 'wf/r/a'),
    'wf/r/b': git(repo.dir, 'rev-parse', 'wf/r/b'),
    'wf/r/e': repo.landed,
  });
});

test('standing reads every branch git has in one listing: no process per branch where git lists their distances', () => {
  const repo = repository();
  const planted = plantedGit('no-such-field');
  const asks = asked(repo).filter((a) => !a.tip && a.branch !== 'wf/r/never');
  assert.deepEqual(answerOf(standing({ repo: repo.dir, base: 'main', branches: asks }, planted.env)).branches.length, 3);
  assert.deepEqual(
    planted.said().map((line) => line.split(' ')[0]),
    ['for-each-ref'],
  );
});

test('standing on a git older than 2.41, which lists no distance, asks each branch one by one and answers the same', () => {
  const repo = repository();
  const planted = plantedGit('ahead-behind');
  const answer = answerOf(standing({ repo: repo.dir, base: 'main', branches: asked(repo) }, planted.env));
  assert.deepEqual(answer.branches, stood(repo.dir));
  assert.ok(
    planted.said().some((line) => line.startsWith('merge-base --is-ancestor')),
    planted.said().join('\n'),
  );
});

test('standing against a baseRef git cannot read lists the rest with their distances, and says pastBase null of that one', () => {
  const repo = repository();
  const planted = plantedGit('no-such-field');
  const asks = [
    { branch: 'wf/r/a', baseRef: NOWHERE },
    { branch: 'wf/r/b', baseRef: repo.cut },
    { branch: 'wf/r/e', baseRef: repo.landed },
  ];
  const answer = answerOf(standing({ repo: repo.dir, base: 'main', branches: asks }, planted.env));
  assert.deepEqual(
    answer.branches.map((b) => [b.branch, b.onBase, b.pastBase, b.ahead]),
    [
      ['wf/r/a', 'yes', null, 0],
      ['wf/r/b', 'no', null, 1],
      ['wf/r/e', 'yes', false, 0],
    ],
  );
  const listings = planted.said().filter((line) => line.startsWith('for-each-ref'));
  assert.equal(listings.length, 3, planted.said().join('\n'));
  assert.ok(listings[2].includes(`ahead-behind:${repo.landed}`) && !listings[2].includes(NOWHERE), listings[2]);
  assert.ok(!planted.said().some((line) => line.startsWith('rev-list --count')), planted.said().join('\n'));
});

test('standing asked of no branch answers the heads alone, whatever the base', () => {
  const repo = repository();
  const answer = answerOf(standing({ repo: repo.dir, base: 'no-such-base', branches: [] }));
  assert.deepEqual(answer.branches, []);
  assert.equal(answer.heads['wf/r/b'], git(repo.dir, 'rev-parse', 'wf/r/b'));
});

/** Whether `commit` is within `base` in `dir`, as git's `merge-base --is-ancestor` says: `yes`, `no` (its exit 1), or `unknown`. */
function within(dir: string, commit: string, base: string): 'yes' | 'no' | 'unknown' {
  try {
    git(dir, 'merge-base', '--is-ancestor', commit, base);
    return 'yes';
  } catch (err) {
    return (err as { status?: number }).status === 1 ? 'no' : 'unknown';
  }
}

/**
 * Whether `branch`, cut at `baseRef`, is shipped onto `main`, asked of git one question at a time: on `main` by its name, or gone and its
 * recorded `tip` on `main`; `true` with work past `baseRef`, `unchanged` with none.
 */
function shippedByGit(dir: string, { branch, tip, baseRef }: { branch: string; tip?: string; baseRef: string }) {
  const landed = (commit: string) => (within(dir, commit, baseRef) === 'no' ? true : 'unchanged');
  const onBase = within(dir, branch, 'main');
  if (onBase === 'yes') return landed(branch);
  if (onBase === 'no' || !tip) return false;
  return within(dir, tip, 'main') === 'yes' ? landed(tip) : false;
}

test('a branch is shipped by its standing exactly when git asked one question at a time says so, a gone one never merged included', () => {
  const repo = repository();
  git(repo.dir, 'switch', '-q', '-c', 'wf/r/u', repo.cut);
  const unmerged = commit(repo.dir, 'u.txt', 'u\n');
  git(repo.dir, 'switch', '-q', 'main');
  git(repo.dir, 'branch', '-q', '-D', 'wf/r/u');
  const branches = [...asked(repo), { branch: 'wf/r/u', tip: unmerged, baseRef: repo.cut }];
  const answer = answerOf(standing({ repo: repo.dir, base: 'main', branches }));
  const said = branches.map((_, i) => shippedOver(answer.branches[i]));
  assert.deepEqual(said, [true, false, 'unchanged', true, false, false, false]);
  assert.deepEqual(
    said,
    branches.map((a) => shippedByGit(repo.dir, a)),
  );
});

test('REFUSED: standing of no repository, and against a base git cannot read; unread for a request with no list of branches', () => {
  const repo = repository();
  const gone = path.join(repo.dir, 'gone');
  assert.deepEqual(standing({ repo: gone, base: 'main', branches: [] }), {
    refused: `git cannot list the branches of ${gone}: it is no git repository, or git cannot read it`,
  });
  assert.deepEqual(standing({ repo: repo.dir, base: 'no-such-base', branches: asked(repo) }), {
    refused: `git cannot read no-such-base in ${repo.dir}, the base the branches are asked of: is it a branch of that repository?`,
  });
  const unread = standing({ repo: repo.dir, base: 'main', branches: 'wf/r/a' });
  assert.ok('unread' in unread, JSON.stringify(unread));
  assert.equal(unread.unread.said, 'the request\'s `branches` is "wf/r/a", where a list of branches is asked');
});
