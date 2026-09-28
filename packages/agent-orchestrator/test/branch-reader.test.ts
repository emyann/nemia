/**
 * The branch reader (`branchReader` in branches.ts): git's word on a run's result branches — on the base or not (`isShipped`), there or gone,
 * how far ahead — answered from one `for-each-ref` of a repository's branches, where `oneByOne` asks git a process for each question. It
 * must say what `oneByOne` says of every shape a branch can be in, whichever order the branches are asked in, and ask git once for a
 * repository where `oneByOne` asks it twice for each branch.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { scratch } from './scratch.ts';
import { branchReader, branchStandings, headsOf, isShipped, oneByOne, type BranchReader } from '../src/branches.ts';
import { metered } from '../src/tally.ts';
import type { GitRun } from '../src/run.ts';

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
const ROOT = scratch('wf-branch-reader-');

const aRepo = () => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'commit', '-q', '--allow-empty', '-m', 'base');
  return repo;
};
const commitOn = (repo: string, branch: string, from: string, what: string) => {
  git(repo, 'checkout', '-q', '-b', branch, from);
  git(repo, 'commit', '-q', '--allow-empty', '-m', what);
  git(repo, 'checkout', '-q', 'main');
  return git(repo, 'rev-parse', branch);
};
const aRun = (repo: string, fields: Partial<GitRun>): GitRun =>
  ({
    id: `r-${Math.random().toString(36).slice(2, 6)}`,
    workspace: repo,
    brief: 'b',
    workflowDir: '/nowhere',
    createdAt: '2026-09-25T00:00:00Z',
    steps: {},
    repo,
    isolate: true,
    baseRef: git(repo, 'rev-parse', 'main'),
    branch: 'main',
    ...fields,
  }) as GitRun;

/** Every shape a result branch can be in against its run's base, on two base branches, and bases git cannot read. */
const shapes = () => {
  const repo = aRepo();
  const b0 = git(repo, 'rev-parse', 'main');
  commitOn(repo, 'merged', b0, 'merged');
  git(repo, 'merge', '-q', '--no-ff', '-m', 'merge', 'merged');
  commitOn(repo, 'fast', 'main', 'fast');
  git(repo, 'merge', '-q', '--ff-only', 'fast');
  commitOn(repo, 'ahead', b0, 'ahead by one');
  git(repo, 'branch', 'unchanged', b0);
  const goneMerged = commitOn(repo, 'gone-merged', 'main', 'gone, merged');
  git(repo, 'merge', '-q', '--no-ff', '-m', 'merge', 'gone-merged');
  git(repo, 'branch', '-D', 'gone-merged');
  const goneUnmerged = commitOn(repo, 'gone-unmerged', b0, 'gone, never merged');
  git(repo, 'branch', '-D', 'gone-unmerged');
  const b1 = git(repo, 'rev-parse', 'main');
  // Cut at b1 and then moved back to b0, which b1 has: on the base, with nothing past the run's base.
  git(repo, 'branch', 'moved-back', b0);
  // A second base branch, and a branch merged into it alone.
  git(repo, 'branch', 'release', b0);
  commitOn(repo, 'on-release', b0, 'for release');
  git(repo, 'checkout', '-q', 'release');
  git(repo, 'merge', '-q', '--no-ff', '-m', 'merge', 'on-release');
  git(repo, 'checkout', '-q', 'main');
  const tips = { 'gone-merged': goneMerged, 'gone-unmerged': goneUnmerged };
  const all = ['merged', 'fast', 'ahead', 'unchanged', 'gone-merged', 'gone-unmerged', 'gone-untipped', 'moved-back', 'on-release'];
  const runs = [
    aRun(repo, { baseRef: b0, tips }),
    aRun(repo, { baseRef: b1, tips }),
    aRun(repo, { baseRef: b0, branch: 'release', tips }),
    // A commit the repository does not have, and a base branch it does not have: git refuses both, and the reader asks one by one.
    aRun(repo, { baseRef: 'f'.repeat(40), tips }),
    aRun(repo, { baseRef: b0, branch: 'no-such-base', tips }),
  ];
  return { repo, runs, all };
};

const answers = (git: BranchReader, runs: readonly GitRun[], branches: readonly string[]) =>
  runs.map((run) => ({ shipped: branches.map((b) => git.shipped(run, b)), standings: branchStandings(run, branches, git) }));

test('the reader says what git says one question at a time, of every shape a branch can be in, in either order, primed or not', () => {
  const { repo, runs, all } = shapes();
  const expected = answers(oneByOne, runs, all);
  // The fixture has each answer: a yes with work, a yes with none, a no, gone, and ahead.
  const said = new Set(expected.flatMap((a) => a.shipped.map(String)));
  assert.deepEqual([...said].sort(), ['false', 'true', 'unchanged']);
  assert.ok(
    expected.some((a) => a.standings.some((s) => s.where === 'gone')) &&
      expected.some((a) => a.standings.some((s) => s.where === 'ahead' && s.commits === 1)),
  );
  assert.deepEqual(
    runs.map((run) => all.map((b) => isShipped(run, b))),
    expected.map((a) => a.shipped),
    'oneByOne is isShipped',
  );

  const lazy = branchReader();
  assert.deepEqual(answers(lazy, runs, all), expected, 'unprimed');
  const primed = branchReader();
  primed.prime(runs);
  assert.deepEqual(answers(primed, runs, all), expected, 'primed');
  const reversed = branchReader();
  reversed.prime([...runs].reverse());
  const backwards = [...all].reverse();
  assert.deepEqual(
    answers(reversed, [...runs].reverse(), backwards),
    answers(oneByOne, [...runs].reverse(), backwards),
    'in the opposite order',
  );
  // And the heads a memo keys the answers by are git's.
  assert.deepEqual(Object.fromEntries(primed.heads(repo)), headsOf(repo));
  assert.deepEqual(Object.fromEntries(branchReader().heads(repo)), headsOf(repo));
  assert.deepEqual(Object.fromEntries(oneByOne.heads(repo)), headsOf(repo));
  assert.ok(Object.keys(headsOf(repo)).includes('ahead'));
});

test('a primed reader asks git once for a repository, where one question at a time asks it twice for each branch', async () => {
  const repo = aRepo();
  const runs: GitRun[] = [];
  for (let k = 0; k < 20; k++) {
    const baseRef = git(repo, 'rev-parse', 'main');
    commitOn(repo, `wf/r-${k}`, 'main', `run ${k}`);
    git(repo, 'merge', '-q', '--no-ff', '-m', 'merge', `wf/r-${k}`);
    runs.push(aRun(repo, { baseRef }));
  }
  const branches = (k: number) => [`wf/r-${k}`];
  const spawned = async (reader: BranchReader) => {
    const { value, tallies } = await metered(async () => {
      reader.prime(runs);
      return runs.map((run, k) => branchStandings(run, branches(k), reader));
    });
    return { value, git: tallies!.kinds.git.spawned };
  };
  const one = await spawned(oneByOne);
  const read = await spawned(branchReader());
  assert.deepEqual(read.value, one.value);
  assert.ok(one.value.every(([s]) => s!.where === 'on'));
  assert.equal(one.git, 40, "twice for each branch: within the base branch, and within the run's base");
  assert.equal(read.git, 1, 'one for-each-ref for the repository');
});

test('a base git cannot read costs the reader one more listing, not a process for each branch', async () => {
  const repo = aRepo();
  const runs: GitRun[] = [];
  for (let k = 0; k < 10; k++) {
    const baseRef = git(repo, 'rev-parse', 'main');
    commitOn(repo, `wf/r-${k}`, 'main', `run ${k}`);
    git(repo, 'merge', '-q', '--no-ff', '-m', 'merge', `wf/r-${k}`);
    runs.push(aRun(repo, { baseRef }));
  }
  const gone = aRun(repo, { baseRef: 'e'.repeat(40) });
  const all = [...runs, gone];
  const { value, tallies } = await metered(async () => {
    const reader = branchReader();
    reader.prime(all);
    return all.map((run, k) => branchStandings(run, [`wf/r-${Math.min(k, 9)}`], reader));
  });
  assert.deepEqual(
    value,
    all.map((run, k) => branchStandings(run, [`wf/r-${Math.min(k, 9)}`], oneByOne)),
  );
  // The listing git refused, the commits it can read, the listing again without the one it cannot, and that run's own question.
  assert.equal(tallies!.kinds.git.spawned, 4);
});

test('a primed reader lists a repository on the first question about it, and one nothing is asked about costs no process', async () => {
  const [one, other] = [aRepo(), aRepo()];
  const runs = [aRun(one, {}), aRun(other, {})];
  const { value, tallies } = await metered(async () => {
    const reader = branchReader();
    reader.prime(runs);
    return reader.has(one, 'main');
  });
  assert.equal(value, true);
  assert.equal(tallies!.kinds.git.spawned, 1, 'the repository asked about, and not the other');
  const idle = await metered(async () => {
    branchReader().prime(runs);
  });
  assert.equal(idle.tallies!.kinds.git.spawned, 0);
});

test('a base branch the repository does not have costs two more listings, and the heads are still read', async () => {
  const repo = aRepo();
  const baseRef = git(repo, 'rev-parse', 'main');
  commitOn(repo, 'wf/r-0', 'main', 'run');
  const runs = [aRun(repo, { baseRef }), aRun(repo, { baseRef, branch: 'no-such-base' })];
  const { value, tallies } = await metered(async () => {
    const reader = branchReader();
    reader.prime(runs);
    return { standings: runs.map((run) => branchStandings(run, ['wf/r-0'], reader)), heads: Object.fromEntries(reader.heads(repo)) };
  });
  assert.deepEqual(
    value.standings,
    runs.map((run) => branchStandings(run, ['wf/r-0'], oneByOne)),
  );
  assert.deepEqual(value.heads, headsOf(repo));
  // The listing git refused, the branches alone, the listing again without the base it cannot read, and that run's own questions.
  const own = await metered(async () => branchStandings(runs[1]!, ['wf/r-0'], oneByOne));
  assert.equal(tallies!.kinds.git.spawned, 3 + own.tallies!.kinds.git.spawned);
});
