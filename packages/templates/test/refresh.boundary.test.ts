/**
 * sdlc's landing refresh (`sdlc/carried/refresh.ts`, which the landing program `land.ts` runs for the condition `turn` where the factory
 * names a refresh): a run's branch that lacks its base is brought up to it at the landing, the base merged into it in the run's own
 * worktree, the factory's command run to derive again the files it derives, and the result pushed for CI to judge, never forced; the
 * condition `ci` then waits for CI at that head, and the program merges that head once `landed` is due. Two runs that change the same
 * derived files side by side both land so, with no person sequencing them.
 *
 * The bound the refresh keeps is mechanical: the head it pushes is git's plain merge of the reviewed head and the base, differing from
 * it only in the derived paths, every other difference, every path left unmerged and every command that fails refused with `turn` False,
 * nothing pushed and the run's worktree back where it was. A branch that holds the base, a merge the command changes nothing of, and a
 * run given no command, each pass the turn with the head as it was.
 *
 * Driven as `land.boundary.test.ts` drives the program (`test/land.ts`): one pass over a served run, a scratch checkout on the base, its
 * `origin` a bare repository, a worktree with the run's branch checked out, as a run's own is, and the stub `gh` of `test/origin.ts`. Its
 * subject is git, `gh` and a spawned script: a boundary file.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { gitIn, tip as tipIn } from './origin.ts';
import {
  BASE_RULE,
  DERIVED,
  type Flags,
  type Ran,
  type World,
  asked,
  listed,
  parents,
  pass,
  resultOf,
  served,
  stands,
  world,
} from './land.ts';

/** The run every fixture here lands, and the branch its result is on. */
const RUN = 'r-1';
const RESULT = resultOf(RUN);

/** The commands a fixture gives as the factory's refresh, each touching `marker` where it runs to its end. */
const commands = (w: World) => ({
  cut: `printf 'cut\\n' > ${DERIVED} && git add ${DERIVED} && touch '${w.marker}'`,
  nothing: `touch '${w.marker}'`,
  outside: `printf 'cut\\n' > ${DERIVED} && printf 'x\\n' > a.ts && git add ${DERIVED} a.ts && touch '${w.marker}'`,
  fails: `echo 'cannot cut: fix it' >&2; exit 1`,
  needs: `test -f deps/c.ts && printf 'cut\\n' > ${DERIVED} && git add ${DERIVED} && touch '${w.marker}'`,
});

/** Where a fixture's install touches when it runs to its end. */
const installed = (w: World) => `${w.marker}-install`;

/**
 * The commands a fixture gives as the factory's install: `deps`, which runs only with the merge in progress and installs `c.ts`, a
 * file the moved base alone has, into the ignored `deps/` the `needs` refresh reads; `fails`; and `tracked`, which writes a tracked
 * file.
 */
const installs = (w: World) => ({
  deps: `git rev-parse -q --verify MERGE_HEAD >/dev/null && mkdir -p deps && cp c.ts deps/c.ts && touch '${installed(w)}'`,
  fails: `echo 'cannot install: fix it' >&2; exit 1`,
  tracked: `printf 'x\\n' > a.ts && touch '${installed(w)}'`,
});

/**
 * One pass of the program over the run, the pull request open at its reviewed tip, the factory's `flags` given; `scratch` leaves the
 * branch no worktree.
 */
function turn(w: World, flags: Flags, scratch = false) {
  const { run, tip } = w.runs[RUN];
  if (scratch) gitIn(w.repo, 'worktree', 'remove', '--force', run);
  const runs = [served(RUN, { repo: w.repo, workspace: scratch ? null : run, startedAt: '2026-11-27T10:00:00Z' })];
  const rules = [BASE_RULE, { when: 'pr list', out: JSON.stringify([listed(RUN, tip)]) }];
  return pass(runs, rules, flags);
}

/** The one write of a pass: the condition `turn` of the run, which every case here reads. */
function written(r: Ran) {
  assert.equal(r.code, 0, r.err);
  assert.equal(r.written.length, 1, JSON.stringify(r.written));
  assert.deepEqual([r.written[0].run, r.written[0].step, r.written[0].name], [RUN, 'land', 'turn']);
  return r.written[0];
}

/** What a refusal must have left: `turn` False, nothing pushed, no merge call, and the run's worktree on the reviewed tip, clean. */
function untouched(w: World, r: Ran) {
  assert.equal(written(r).status, 'False');
  assert.match(written(r).message, /nemia retry r-1 land --recheck/);
  assert.equal(tipIn(w.bare, RESULT), w.runs[RUN].tip, 'nothing is pushed');
  assert.equal(asked(r.calls, 'pr', 'merge').length, 0, 'nothing is merged');
  assert.deepEqual(stands(w.runs[RUN].run), { branch: RESULT, head: w.runs[RUN].tip, clean: true, merging: false }, r.err);
}

/** The factory's refresh, its derived paths and its install, as flags. */
const given = (refresh: string, install = '') => ({ refresh, derives: DERIVED, install }) satisfies Flags;

test('a conflict only in a derived file is refreshed and pushed: the base merged in, the file derived again, nothing merged yet', () => {
  const w = world('derived');
  const r = turn(w, given(commands(w).cut));
  const head = tipIn(w.bare, RESULT);
  assert.ok(head && head !== w.runs[RUN].tip, 'the branch is pushed');
  assert.equal(written(r).status, 'True');
  assert.ok(written(r).message.includes(head.slice(0, 12)), 'the turn names the head pushed');
  assert.deepEqual(parents(w.repo, head), [w.runs[RUN].tip, w.moved], 'a merge of the base into the reviewed tip');
  assert.equal(gitIn(w.repo, 'show', `${head}:${DERIVED}`), 'cut\n', "the derived file is the command's");
  assert.equal(gitIn(w.repo, 'diff', '--name-only', w.moved, head, '--', 'c.ts'), '', 'the base is in it whole');
  assert.deepEqual(stands(w.runs[RUN].run), { branch: RESULT, head, clean: true, merging: false }, 'the run worktree sits clean on it');
  assert.equal(asked(r.calls, 'pr', 'merge').length, 0, 'the program merges it once ci is green at it');
});

test('with no worktree holding the branch, the refresh takes a scratch one and removes it after', () => {
  const w = world('derived');
  const r = turn(w, given(commands(w).cut), true);
  assert.equal(written(r).status, 'True');
  assert.deepEqual(parents(w.repo, tipIn(w.bare, RESULT)!), [w.runs[RUN].tip, w.moved]);
  assert.equal(gitIn(w.repo, 'worktree', 'list', '--porcelain').match(/^worktree /gm)?.length, 1, 'the scratch worktree is gone');
});

test('a branch that holds the base is not refreshed: the command is not run, and the turn is given', () => {
  const w = world('held');
  const r = turn(w, given(commands(w).cut));
  assert.equal(written(r).status, 'True');
  assert.ok(!fs.existsSync(w.marker), 'the command is not run');
  assert.equal(tipIn(w.bare, RESULT), w.runs[RUN].tip);
});

test('a clean merge the command changes nothing of pushes nothing: the trial is taken back and the head stands', () => {
  const w = world('clean');
  const r = turn(w, given(commands(w).nothing));
  assert.equal(written(r).status, 'True');
  assert.ok(fs.existsSync(w.marker), 'the command ran');
  assert.equal(tipIn(w.bare, RESULT), w.runs[RUN].tip, 'nothing is pushed');
  assert.deepEqual(stands(w.runs[RUN].run), { branch: RESULT, head: w.runs[RUN].tip, clean: true, merging: false });
});

test('REFUSED: a conflict outside the derived paths, a command that writes outside them, and one that fails; nothing pushed', () => {
  const other = world('other');
  untouched(other, turn(other, given(commands(other).cut)));
  const outside = world('derived');
  untouched(outside, turn(outside, given(commands(outside).outside)));
  const fails = world('derived');
  const r = turn(fails, given(commands(fails).fails));
  untouched(fails, r);
  assert.ok(written(r).message.includes('cannot cut: fix it'), `the command's stderr is quoted:\n${written(r).message}`);
});

test("the factory's install runs on the merged tree before the refresh, which reads what it installed", () => {
  const w = world('derived');
  const r = turn(w, given(commands(w).needs, installs(w).deps));
  assert.equal(written(r).status, 'True');
  assert.ok(fs.existsSync(installed(w)) && fs.existsSync(w.marker), 'the install and the refresh both ran');
  const head = tipIn(w.bare, RESULT);
  assert.deepEqual(parents(w.repo, head!), [w.runs[RUN].tip, w.moved], 'a merge of the base into the reviewed tip');
  assert.deepEqual(stands(w.runs[RUN].run), { branch: RESULT, head, clean: true, merging: false });
});

test('with no worktree holding the branch, the install runs in the scratch one, removed after', () => {
  const w = world('derived');
  const r = turn(w, given(commands(w).needs, installs(w).deps), true);
  assert.equal(written(r).status, 'True');
  assert.deepEqual(parents(w.repo, tipIn(w.bare, RESULT)!), [w.runs[RUN].tip, w.moved]);
  assert.equal(gitIn(w.repo, 'worktree', 'list', '--porcelain').match(/^worktree /gm)?.length, 1, 'the scratch worktree is gone');
});

test('a branch that holds the base runs no install, and the turn is given', () => {
  const w = world('held');
  const r = turn(w, given(commands(w).cut, installs(w).deps));
  assert.equal(written(r).status, 'True');
  assert.ok(!fs.existsSync(installed(w)), 'the install is not run');
});

test('REFUSED: an install that fails runs no refresh, and one that writes a tracked file; nothing pushed', () => {
  const fails = world('derived');
  const r = turn(fails, given(commands(fails).cut, installs(fails).fails));
  untouched(fails, r);
  assert.ok(written(r).message.includes('cannot install: fix it'), `the install's stderr is quoted:\n${written(r).message}`);
  assert.ok(!fs.existsSync(fails.marker), 'the refresh is not run');
  const tracked = world('derived');
  untouched(tracked, turn(tracked, given(commands(tracked).cut, installs(tracked).tracked)));
  assert.ok(fs.existsSync(installed(tracked)), 'the install ran');
});

test('REFUSED: a run worktree with uncommitted changes, before anything is merged into it', () => {
  const w = world('derived');
  fs.writeFileSync(path.join(w.runs[RUN].run, 'a.ts'), 'export const a = 9;\n');
  const r = turn(w, given(commands(w).cut));
  assert.equal(written(r).status, 'False');
  assert.ok(written(r).message.includes(w.runs[RUN].run), `the worktree is named:\n${written(r).message}`);
  assert.ok(!fs.existsSync(w.marker), 'the command is not run');
  assert.equal(tipIn(w.bare, RESULT), w.runs[RUN].tip);
  assert.deepEqual(
    stands(w.runs[RUN].run),
    { branch: RESULT, head: w.runs[RUN].tip, clean: false, merging: false },
    "the person's change is left",
  );
});

test('a factory that names no refresh is given the turn with the command never run, whatever the base did', () => {
  const w = world('derived');
  const r = turn(w, given(''));
  assert.equal(written(r).status, 'True');
  assert.ok(!fs.existsSync(w.marker));
  assert.equal(tipIn(w.bare, RESULT), w.runs[RUN].tip);
});
