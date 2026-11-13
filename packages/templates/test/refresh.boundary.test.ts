/**
 * sdlc's landing refresh (`sdlc/carried/refresh.ts`, which `landing.ts merge` runs where it is given the factory's `--refresh`): a
 * run's branch that lacks its base is brought up to it at the landing, the base merged into it in the run's own worktree, the
 * factory's command run to derive again the files `--derives` names, and the result pushed for CI to judge, never forced; the land
 * step's check, `landing.ts receipt`, then merges that head once CI is green at it. Two runs that change the same derived files side by
 * side both land so, with no person sequencing them.
 *
 * The bound the refresh keeps is mechanical: the head it pushes is git's plain merge of the reviewed head and the base, differing from
 * it only in the derived paths, every other difference, every path left unmerged and every command that fails refused with nothing
 * pushed and the run's worktree back where it was. A branch that holds the base, a merge the command changes nothing of, and a merge
 * given no command, each lands as before the refresh.
 *
 * Driven as `landing.boundary.test.ts` drives the landing (`test/land.ts`): a scratch checkout on the base, its `origin` a bare
 * repository, a worktree with the run's branch checked out, as a run's own is, and the stub `gh` of `test/origin.ts`, which a wrapper
 * here makes move the bare's base onto the merge GitHub would have made when it is asked to merge. Its subject is git, `gh` and a
 * spawned script: a boundary file.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { type Gh, type Rule, bareOrigin, ghStub, gitIn, tip as tipIn } from './origin.ts';
import { type Ran, asked, body, landIn, stands } from './land.ts';

/** The run every fixture here lands, and the branch its result is on. */
const RUN = 'r-1';
const RESULT = `wf/${RUN}/run`;

/** The file the factory's command derives, both sides of a fixture changing it apart. */
const DERIVED = 'derived.json';

/**
 * How a fixture's base moved after the branch forked: `derived`, a change to the derived file alone that conflicts with the branch's;
 * `other`, that and a conflict in a file no command derives; `clean`, a file the branch did not touch; `held`, not at all.
 */
type Moved = 'derived' | 'other' | 'clean' | 'held';

/**
 * A checkout to land in: the owner's, on the base; its bare `origin`; the run's worktree, with the result branch checked out (none
 * where `worktree` is false); the base the branch forked from, the branch's tip the review read, and the base as it moved; the stub
 * `gh`; the land step's files folder; and the path the commands touch when they run.
 */
type World = {
  repo: string;
  bare: string;
  run: string | undefined;
  base: string;
  tip: string;
  moved: string;
  gh: Gh;
  files: string;
  marker: string;
};

/** Commit `files` in `repo` with `subject`: its sha. */
function commit(repo: string, files: Record<string, string>, subject: string): string {
  for (const [file, text] of Object.entries(files)) fs.writeFileSync(path.join(repo, file), text);
  gitIn(repo, 'add', '-A');
  gitIn(repo, 'commit', '-qm', subject);
  return gitIn(repo, 'rev-parse', 'HEAD').trim();
}

/** A checkout whose base moved after the run's branch forked from it, as `moved` says, the branch pushed and its worktree added. */
function world(moved: Moved, { worktree = true }: { worktree?: boolean } = {}): World {
  const repo = scratch('wf-refresh-repo-');
  gitIn(repo, 'init', '-q', '-b', 'main');
  const base = commit(repo, { 'a.ts': 'export const a = 1;\n', [DERIVED]: '{ "v": 0 }\n', 'other.txt': 'zero\n' }, 'base');
  const bare = bareOrigin(repo);
  gitIn(repo, 'push', '-q', 'origin', 'main');
  gitIn(repo, 'switch', '-q', '-c', RESULT);
  const tip = commit(repo, { 'b.ts': 'export const b = 2;\n', [DERIVED]: '{ "v": 1 }\n', 'other.txt': 'branch\n' }, 'the work');
  gitIn(repo, 'push', '-q', 'origin', RESULT);
  gitIn(repo, 'switch', '-q', 'main');
  const changes: Record<Moved, Record<string, string>> = {
    derived: { 'c.ts': 'export const c = 3;\n', [DERIVED]: '{ "v": 2 }\n' },
    other: { [DERIVED]: '{ "v": 2 }\n', 'other.txt': 'main\n' },
    clean: { 'c.ts': 'export const c = 3;\n' },
    held: {},
  };
  const after = moved === 'held' ? base : commit(repo, changes[moved], 'another landing');
  gitIn(repo, 'push', '-q', 'origin', 'main');
  const run = worktree ? path.join(scratch('wf-refresh-run-'), 'run') : undefined;
  if (run) gitIn(repo, 'worktree', 'add', '-q', run, RESULT);
  const marker = path.join(scratch('wf-refresh-marker-'), 'ran');
  return { repo, bare, run, base, tip, moved: after, gh: ghStub(), files: scratch('wf-refresh-files-'), marker };
}

/** The commands a fixture gives as the factory's refresh, each touching `marker` where it runs to its end. */
const commands = (w: World) => ({
  cut: `printf 'cut\\n' > ${DERIVED} && git add ${DERIVED} && touch '${w.marker}'`,
  nothing: `touch '${w.marker}'`,
  outside: `printf 'cut\\n' > ${DERIVED} && printf 'x\\n' > a.ts && git add ${DERIVED} a.ts && touch '${w.marker}'`,
  fails: `echo 'cannot cut: fix it' >&2; exit 1`,
});

/** One open pull request of this run at `head`, as `gh pr list --json` gives it, GitHub calling it `mergeable`. */
const listed = (head: string, mergeable: string, more: Record<string, unknown> = {}): Record<string, unknown> => ({
  number: 7,
  url: 'https://github.com/o/r/pull/7',
  state: 'OPEN',
  isDraft: false,
  baseRefName: 'main',
  headRefName: RESULT,
  headRefOid: head,
  mergeable,
  mergeCommit: null,
  ...more,
});

/** The rules the merge verb reads: the base, the one open pull request at the reviewed tip, and `ci` green at it. */
const opened = (w: World, mergeable = 'CONFLICTING'): Rule[] => [
  { when: 'auth status' },
  { when: 'repo view', out: JSON.stringify({ defaultBranchRef: { name: 'main' } }) },
  { when: 'pr list', out: JSON.stringify([listed(w.tip, mergeable)]) },
  { when: 'pr view', out: JSON.stringify({ statusCheckRollup: [{ name: 'ci', status: 'COMPLETED', conclusion: 'SUCCESS' }] }) },
  { when: 'pr merge', out: 'Merged pull request #7' },
];

/** The subject the merge is given, which the receipt's merge of a refreshed head takes again. */
const SUBJECT = "Land a run's change through its pull request";

/** The merge verb's arguments: the factory's refresh `refresh` and its derived paths `derives`. */
const mergeArgs = (w: World, refresh: string, derives = DERIVED): string[] => [
  '--run',
  RUN,
  '--subject',
  SUBJECT,
  '--body-file',
  body(undefined, w.files),
  '--check',
  'ci',
  '--refresh',
  refresh,
  '--derives',
  derives,
];

/** Run `verb` in the owner's checkout, its step's files folder named both ways a land step and its check are given it. */
const land = (w: World, verb: string, args: string[], more: Record<string, string> = {}) =>
  landIn(w.repo, w.gh, verb, args, { WF_STEP_FILES: w.files, WF_ARTIFACTS: w.files, ...more });

/** The parents of `sha` in `repo`. */
const parents = (repo: string, sha: string): string[] => gitIn(repo, 'rev-list', '--parents', '-n', '1', sha).trim().split(' ').slice(1);

/** What a refusal must have left: nothing pushed, no merge call, and the run's worktree on the reviewed tip, clean, with no merge. */
function untouched(w: World, r: Ran): void {
  assert.equal(r.code, 1, r.err);
  assert.equal(tipIn(w.bare, RESULT), w.tip, 'nothing is pushed');
  assert.equal(asked(r.calls, 'pr', 'merge').length, 0, 'nothing is merged');
  if (w.run) assert.deepEqual(stands(w.run), { branch: RESULT, head: w.tip, clean: true, merging: false }, r.err);
  assert.ok(!fs.existsSync(path.join(w.files, 'refreshed.json')), 'nothing is recorded for the check');
}

test('a conflict only in a derived file is refreshed and pushed: the base merged in, the file derived again, nothing merged yet', () => {
  const w = world('derived');
  w.gh.answers(opened(w));
  const r = land(w, 'merge', mergeArgs(w, commands(w).cut));
  assert.equal(r.code, 0, r.err);
  const head = tipIn(w.bare, RESULT);
  assert.ok(head && head !== w.tip, 'the branch is pushed');
  assert.deepEqual(parents(w.repo, head), [w.tip, w.moved], 'a merge of the base into the reviewed tip');
  assert.equal(gitIn(w.repo, 'show', `${head}:${DERIVED}`), 'cut\n', "the derived file is the command's");
  assert.equal(gitIn(w.repo, 'diff', '--name-only', w.moved, head, '--', 'c.ts'), '', 'the base is in it whole');
  assert.deepEqual(stands(w.run!), { branch: RESULT, head, clean: true, merging: false }, 'the run worktree sits clean on it');
  const record = JSON.parse(fs.readFileSync(path.join(w.files, 'refreshed.json'), 'utf8')) as Record<string, unknown>;
  assert.deepEqual([record.pr, record.head, record.reviewed, record.subject], [7, head, w.tip, SUBJECT]);
  assert.equal(asked(r.calls, 'pr', 'merge').length, 0, 'the check merges it, once ci is green at it');
});

test('with no worktree holding the branch, the refresh takes a scratch one and removes it after', () => {
  const w = world('derived', { worktree: false });
  w.gh.answers(opened(w));
  const r = land(w, 'merge', mergeArgs(w, commands(w).cut));
  assert.equal(r.code, 0, r.err);
  const head = tipIn(w.bare, RESULT);
  assert.deepEqual(parents(w.repo, head!), [w.tip, w.moved]);
  assert.equal(gitIn(w.repo, 'worktree', 'list', '--porcelain').match(/^worktree /gm)?.length, 1, 'the scratch worktree is gone');
});

test("a branch that holds the base is not refreshed: the command is not run, and the merge is today's", () => {
  const w = world('held');
  w.gh.answers(opened(w, 'MERGEABLE'));
  const r = land(w, 'merge', mergeArgs(w, commands(w).cut));
  assert.equal(r.code, 0, r.err);
  assert.ok(!fs.existsSync(w.marker), 'the command is not run');
  assert.equal(asked(r.calls, 'pr', 'merge')[0]?.argv[5], w.tip, 'merged at the reviewed tip');
  assert.equal(tipIn(w.bare, RESULT), w.tip);
});

test("a clean merge the command changes nothing of pushes nothing: the trial is taken back and the merge is today's", () => {
  const w = world('clean');
  w.gh.answers(opened(w, 'MERGEABLE'));
  const r = land(w, 'merge', mergeArgs(w, commands(w).nothing));
  assert.equal(r.code, 0, r.err);
  assert.ok(fs.existsSync(w.marker), 'the command ran');
  assert.equal(tipIn(w.bare, RESULT), w.tip, 'nothing is pushed');
  assert.equal(asked(r.calls, 'pr', 'merge')[0]?.argv[5], w.tip, 'merged at the reviewed tip');
  assert.deepEqual(stands(w.run!), { branch: RESULT, head: w.tip, clean: true, merging: false });
});

test('REFUSED: a conflict outside the derived paths, a command that writes outside them, and one that fails; nothing pushed', () => {
  const other = world('other');
  other.gh.answers(opened(other));
  untouched(other, land(other, 'merge', mergeArgs(other, commands(other).cut)));
  const outside = world('derived');
  outside.gh.answers(opened(outside));
  untouched(outside, land(outside, 'merge', mergeArgs(outside, commands(outside).outside)));
  const fails = world('derived');
  fails.gh.answers(opened(fails));
  const r = land(fails, 'merge', mergeArgs(fails, commands(fails).fails));
  untouched(fails, r);
  assert.ok(r.err.includes('cannot cut: fix it'), `the command's stderr is quoted:\n${r.err}`);
});

test('REFUSED: a run worktree with uncommitted changes, before anything is merged into it', () => {
  const w = world('derived');
  w.gh.answers(opened(w));
  fs.writeFileSync(path.join(w.run!, 'a.ts'), 'export const a = 9;\n');
  const r = land(w, 'merge', mergeArgs(w, commands(w).cut));
  assert.equal(r.code, 1, r.err);
  assert.ok(r.err.includes(w.run!), `the worktree is named:\n${r.err}`);
  assert.ok(!fs.existsSync(w.marker), 'the command is not run');
  assert.equal(tipIn(w.bare, RESULT), w.tip);
  assert.deepEqual(stands(w.run!), { branch: RESULT, head: w.tip, clean: false, merging: false }, "the person's change is left");
});

test("REFUSED: a refresh and derived paths given empty are today's merge, refusing a CONFLICTING pull request", () => {
  const w = world('derived');
  w.gh.answers(opened(w));
  untouched(w, land(w, 'merge', mergeArgs(w, '', '')));
  assert.ok(!fs.existsSync(w.marker));
});

/**
 * A world refreshed by the merge verb, and the merge GitHub would make of its pushed head: a commit with the head's tree whose first
 * parent is the base, put in the bare under a ref no fetch reads, and moved onto its `main` by a wrapper of the stub `gh` when it is
 * asked to merge. The stub's log is emptied, so the receipt's polls count from its first call.
 */
function refreshed(): World & { head: string; merge: string } {
  const w = world('derived');
  w.gh.answers(opened(w));
  assert.equal(land(w, 'merge', mergeArgs(w, commands(w).cut)).code, 0);
  const head = tipIn(w.bare, RESULT)!;
  const merge = gitIn(w.repo, 'commit-tree', `${head}^{tree}`, '-p', w.moved, '-p', head, '-m', SUBJECT).trim();
  gitIn(w.repo, 'push', '-q', 'origin', `${merge}:refs/fixture/merge`);
  fs.renameSync(path.join(w.gh.bin, 'gh'), path.join(w.gh.bin, 'gh-stub'));
  fs.writeFileSync(
    path.join(w.gh.bin, 'gh'),
    `#!/bin/sh\ncase " $* " in *" pr merge "*) git -C '${w.bare}' update-ref refs/heads/main '${merge}' || exit 1 ;; esac\n` +
      `exec "$(dirname "$0")/gh-stub" "$@"\n`,
    { mode: 0o755 },
  );
  fs.rmSync(w.gh.log, { force: true });
  return { ...w, head, merge };
}

/** The receipt's rules for a refreshed head: open at it, then merged as `merge`, its `ci` read over REST as `runs`, one poll each. */
const receiptRules = (w: World & { head: string; merge: string }, runs: string[]): Rule[] => [
  { when: 'auth status' },
  { when: 'repo view', out: JSON.stringify({ defaultBranchRef: { name: 'main' } }) },
  {
    when: 'pr list',
    outs: [
      JSON.stringify([listed(w.head, 'MERGEABLE')]),
      JSON.stringify([listed(w.head, 'MERGEABLE', { state: 'MERGED', mergeCommit: { oid: w.merge } })]),
    ],
  },
  {
    when: `commits/${w.head}/check-runs`,
    outs: runs.map((conclusion) =>
      JSON.stringify({
        check_runs: [{ name: 'ci', status: conclusion ? 'completed' : 'in_progress', conclusion: conclusion || null }],
      }),
    ),
  },
  { when: `commits/${w.head}/status`, out: JSON.stringify({ state: 'pending', total_count: 0, statuses: [] }) },
  { when: 'pr merge', out: 'Merged pull request #7' },
];

/** The receipt's arguments, waiting on `ci` at the merge, with polls at no interval. */
const receipt = (w: World) => land(w, 'receipt', ['--run', RUN, '--check', 'ci', '--wait-on-ci', 'true'], { WF_CI_POLL_SECONDS: '0' });

test('the receipt merges a refreshed head once ci is green at it, fast-forwards, and does not wait again on the same tree', () => {
  const w = refreshed();
  w.gh.answers(receiptRules(w, ['', 'success']));
  const r = receipt(w);
  assert.equal(r.code, 0, r.err);
  const merges = asked(r.calls, 'pr', 'merge');
  assert.equal(merges.length, 1);
  assert.deepEqual(merges[0].argv.slice(0, 8), ['pr', 'merge', '7', '--merge', '--match-head-commit', w.head, '--subject', SUBJECT]);
  assert.deepEqual(stands(w.repo), { branch: 'main', head: w.merge, clean: true, merging: false }, 'main is fast-forwarded');
  assert.equal(r.calls.filter((call) => call.argv.join(' ').includes(`commits/${w.merge}/`)).length, 0, 'no second wait');
  assert.match(r.out, /same tree/);
});

test('REFUSED: a receipt whose refreshed head is red merges nothing and names the send-back', () => {
  const w = refreshed();
  w.gh.answers(receiptRules(w, ['failure']));
  const r = receipt(w);
  assert.equal(r.code, 1, r.err);
  assert.equal(asked(r.calls, 'pr', 'merge').length, 0);
  assert.equal(tipIn(w.bare, 'main'), w.moved);
  assert.match(r.err, /nemia retry r-1 review --message/);
});

test('REFUSED: a receipt whose base moved past the refreshed head merges nothing and names the land retry', () => {
  const w = refreshed();
  const later = gitIn(w.repo, 'commit-tree', `${w.moved}^{tree}`, '-p', w.moved, '-m', 'a later landing').trim();
  gitIn(w.repo, 'push', '-q', 'origin', `${later}:refs/heads/main`);
  w.gh.answers(receiptRules(w, ['success']));
  const r = receipt(w);
  assert.equal(r.code, 1, r.err);
  assert.equal(asked(r.calls, 'pr', 'merge').length, 0);
  assert.equal(tipIn(w.bare, 'main'), later);
  assert.match(r.err, /nemia retry r-1 land/);
});
