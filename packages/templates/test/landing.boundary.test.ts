/**
 * sdlc's landing, its two acts (`sdlc/workflows/build/landing.ts`, which `quick/` carries byte for byte): the merge of a run's own
 * green pull request on GitHub, which the landing session types once its step is filed, and the receipt the land step's `check:` runs.
 * Driven in a scratch checkout whose `origin` is a bare repository holding the merge GitHub would have made, so the fast-forward is a
 * real fast-forward and a diverged checkout a real refusal, with a stub `gh` first on the PATH that records each call and answers from
 * a fixture (`test/origin.ts`), each a bounded subprocess. The CI context the merge reads is the one `--check <name>` names, since that
 * name is the repository's a factory is applied to, never the script's.
 *
 * The land steps' checks are read off sdlc as a factory gets it — rendered by `nemia factory apply` and the controller on a scratch
 * store — and run as the run runs one (`checkArgv`). On GitHub (`github=true`): the receipt alone, from the run's frozen workflow files,
 * no suite and no e2e, and a refusal where those files are not named. In the checkout, sdlc's default: the local check, on the tree a
 * landing staged, calling no `gh`.
 *
 * The one failure between the landing's two acts has a retry that must survive it: `gh pr merge` goes through, the fast-forward is
 * declined, the step signs off `blocked` with the retry line, a person brings the checkout onto `origin/main` as that refusal names,
 * and the step is run again. GitHub now says MERGED and no pull request of the run is open, so the second run does the fast-forward
 * alone and merges nothing twice; the merge verb reads the world rather than what the last try left, and the receipt takes the merged
 * pull request among whatever the run has rather than insisting on a single one, since a closed one beside it cannot be closed again.
 *
 * Its subject is git, `gh` and a spawned script: a boundary file.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loadWorkflows } from 'agent-orchestrator';
import { LANDING_CHECK_DEADLINE_SECONDS, checkArgv } from 'agent-orchestrator/run';
import { scratch } from './scratch.ts';
import { renderedSdlc } from './template.ts';
import { type Called, type Gh, type Rule, bareOrigin, ghStub, gitIn } from './origin.ts';

/** The template these scripts ship in. */
const SDLC = path.join(import.meta.dirname, '..', 'sdlc');

const BUILD = path.join(SDLC, 'workflows', 'build');

const SCRIPT = path.join(BUILD, 'landing.ts');

/** sdlc as a factory gets it: the factory's rendered tree, and the scratch store it is in. */
type Rendered = { tree: string; store: string };

/** The steps of the rendered tree's `workflow`, read as a start of it in the factory reads them: with the factory's hires. */
function stepsOf(at: Rendered, workflow: string) {
  const { hires } = JSON.parse(fs.readFileSync(path.join(at.tree, 'factory.json'), 'utf8')) as { hires: Record<string, string> };
  const agents = Object.fromEntries(
    Object.entries(hires).flatMap(([step, agent]) => (step.startsWith(`${workflow}/`) ? [[step.slice(workflow.length + 1), agent]] : [])),
  );
  return loadWorkflows(path.join(at.tree, 'workflows', workflow), { home: at.store }, { factory: 'sdlc', workflow, agents });
}

/** The run every fixture here lands, and the branch its result is on. */
const RUN = 'r-1';
const RESULT = `wf/${RUN}/run`;

/** The retry line a refusal that needs a person must print, for the run and the step the environment names. */
const RETRY = `nemia retry ${RUN} land`;

/** A checkout to land in, with the commits a landing reads: the base, the result branch's tip, and the merge origin holds. */
type World = { repo: string; bare: string; base: string; tip: string; merged: string; gh: Gh };

/**
 * A checkout on `main` with a commit, a result branch `wf/r-1/run` — a run's own line of work — one commit ahead, and an `origin`
 * whose `main` holds the merge commit GitHub would have made of the two — so `git merge --ff-only origin/main` is the fast-forward the
 * merge verb ends with. The checkout itself is left on the base at the commit before the merge, as the owner's is when a landing starts.
 */
function world({ extra }: { extra?: string } = {}): World {
  const repo = scratch('wf-land-repo-');
  gitIn(repo, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(repo, 'a.ts'), 'export const a = 1;\n');
  gitIn(repo, 'add', '-A');
  gitIn(repo, 'commit', '-qm', 'base');
  const base = gitIn(repo, 'rev-parse', 'HEAD').trim();
  const bare = bareOrigin(repo);
  gitIn(repo, 'push', '-q', 'origin', 'main');
  gitIn(repo, 'switch', '-q', '-c', RESULT);
  fs.writeFileSync(path.join(repo, 'b.ts'), 'export const b = 2;\n');
  gitIn(repo, 'add', '-A');
  gitIn(repo, 'commit', '-qm', 'the work');
  const tip = gitIn(repo, 'rev-parse', 'HEAD').trim();
  gitIn(repo, 'push', '-q', 'origin', RESULT);
  if (extra) {
    gitIn(repo, 'switch', '-q', '-c', extra, base);
    fs.writeFileSync(path.join(repo, `${extra.replace(/\W/g, '')}.ts`), 'export const c = 3;\n');
    gitIn(repo, 'add', '-A');
    gitIn(repo, 'commit', '-qm', 'another branch');
  }
  gitIn(repo, 'switch', '-q', 'main');
  gitIn(repo, 'merge', '-q', '--no-ff', '--no-edit', RESULT);
  const merged = gitIn(repo, 'rev-parse', 'HEAD').trim();
  gitIn(repo, 'push', '-q', 'origin', 'main');
  gitIn(repo, 'reset', '-q', '--hard', base);
  return { repo, bare, base, tip, merged, gh: ghStub() };
}

/**
 * A part branch `wf/r-1/part-a` off the base, whose one commit is the result's own patch taken again as a commit of its own
 * (`cherry-pick -x`, so its sha differs) — as a lead takes a part into the run's branch — and never an ancestor of the head.
 */
function takenPart(w: World): string {
  const at = gitIn(w.repo, 'symbolic-ref', '--short', 'HEAD').trim();
  gitIn(w.repo, 'switch', '-q', '-c', `wf/${RUN}/part-a`, w.base);
  gitIn(w.repo, 'cherry-pick', '-x', w.tip);
  const tip = gitIn(w.repo, 'rev-parse', 'HEAD').trim();
  gitIn(w.repo, 'switch', '-q', at);
  const ancestor = spawnSync('git', ['merge-base', '--is-ancestor', tip, w.tip], { cwd: w.repo, timeout: 30_000 }).status;
  assert.equal(ancestor, 1, 'the part is taken by its patch alone, never by ancestry');
  return tip;
}

/** One pull request of this run, as `gh pr list --json` gives it; `more` overrides any field of it. */
const listed = (w: World, more: Record<string, unknown> = {}): string =>
  JSON.stringify([
    {
      number: 7,
      url: 'https://github.com/o/r/pull/7',
      state: 'OPEN',
      isDraft: false,
      baseRefName: 'main',
      headRefName: RESULT,
      headRefOid: w.tip,
      mergeable: 'MERGEABLE',
      mergeCommit: null,
      ...more,
    },
  ]);

/** A head's checks holding one `ci` entry in the state `rest` says. */
const checks = (rest: Record<string, unknown>, ...others: Record<string, unknown>[]): string =>
  JSON.stringify({ statusCheckRollup: [{ name: 'ci', ...rest }, ...others] });

/** A `ci` that passed. */
const GREEN = checks({ status: 'COMPLETED', conclusion: 'SUCCESS' });

/** The rules under which the merge verb passes: one open, green, mergeable pull request at the result branch's tip. */
const mergeable = (w: World, more: Record<string, unknown> = {}): Rule[] => [
  { when: 'auth status' },
  { when: 'repo view', out: JSON.stringify({ defaultBranchRef: { name: 'main' } }) },
  { when: 'pr list', out: listed(w, more) },
  { when: 'pr view', out: GREEN },
  { when: 'pr merge', out: 'Merged pull request #7' },
];

/** Where a person reads a job of the merge commit's CI, as GitHub's REST API gives a check run's `html_url`. */
const JOB_URL = 'https://github.com/o/r/actions/runs/1/job/2';

/** A check run named `name` as GitHub's REST API gives one, lower-case: completed with `conclusion`, or `status` where it is not over. */
const checkRun = (name: string, conclusion: string | null, status = 'completed', url = JOB_URL): Record<string, unknown> => ({
  name,
  status,
  conclusion,
  html_url: url,
  details_url: url,
  started_at: '2026-11-05T10:00:00Z',
});

/** A commit's combined status where every check is a check run: `pending`, with no context in it — no verdict at all. */
const NO_STATUSES = JSON.stringify({ state: 'pending', total_count: 0, statuses: [] });

/** The rules answering the CI of commit `sha`: its check runs `runs` (one answer, or `outs` for a poll) and its combined status. */
const ciAt = (sha: string, runs: Record<string, unknown>[] | Record<string, unknown>[][], status = NO_STATUSES): Rule[] => [
  Array.isArray(runs[0])
    ? { when: `commits/${sha}/check-runs`, outs: (runs as Record<string, unknown>[][]).map((r) => JSON.stringify({ check_runs: r })) }
    : { when: `commits/${sha}/check-runs`, out: JSON.stringify({ total_count: runs.length, check_runs: runs }) },
  { when: `commits/${sha}/status`, out: status },
];

/** The base's tip as `gh api repos/{owner}/{repo}/commits/main` gives it. */
const tipIs = (sha: string): Rule => ({ when: 'commits/main', out: JSON.stringify({ sha }) });

/** The rules under which the receipt passes: the same pull request, merged as the commit origin's main holds, `ci` green on it. */
const landed = (w: World, more: Record<string, unknown> = {}): Rule[] => [
  { when: 'auth status' },
  { when: 'repo view', out: JSON.stringify({ defaultBranchRef: { name: 'main' } }) },
  { when: 'pr list', out: listed(w, { state: 'MERGED', mergeCommit: { oid: w.merged }, ...more }) },
  ...ciAt(w.merged, [checkRun('ci', 'success')]),
];

/** `landed`, its merge commit's CI answered by `first` instead: rules put first win. */
const landedWith = (w: World, ...first: Rule[]): Rule[] => [...first, ...landed(w)];

/** The receipt's arguments: the run, the CI context `ci`, and whether it waits on it at the merge commit. */
const receiptArgs = (wait = 'true', check = 'ci'): string[] => ['--run', RUN, '--check', check, '--wait-on-ci', wait];

/** The calls that read a commit's check runs: the wait on CI at the merge, or at the base's tip. */
const waited = (calls: readonly Called[], at = ''): Called[] =>
  calls.filter((call) => call.argv.some((word) => word.includes(`${at}/check-runs`)));

/** The wait's knobs at nothing: every bound of the receipt's wait at nothing, so a pending or an absent `ci` is refused at once. */
const NO_WAIT = { WF_CI_START_SECONDS: '0', WF_CI_WAIT_SECONDS: '0', WF_CI_POLL_SECONDS: '0' };

/** A checkout the merge verb has landed on, its receipt's answers still to write. */
function afterMerge(): World {
  const w = world();
  w.gh.answers(mergeable(w));
  assert.equal(land(w, 'merge', args()).code, 0);
  return w;
}

type Ran = { code: number | null; out: string; err: string; calls: Called[] };

/** Run the script's `verb` in `w` with `args`, bounded; its exit, its streams and the calls the stub `gh` was given. */
function land(w: World, verb: string, args: string[] = [], more: Record<string, string> = {}): Ran {
  const ran = spawnSync(process.execPath, [SCRIPT, verb, ...args], {
    cwd: w.repo,
    env: {
      PATH: `${w.gh.bin}${path.delimiter}${process.env.PATH ?? ''}`,
      HOME: w.repo,
      WF_STEP: 'land',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@t',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@t',
      ...w.gh.env(),
      ...more,
    },
    encoding: 'utf8',
    timeout: 60_000,
  });
  return { code: ran.status, out: ran.stdout, err: ran.stderr, calls: w.gh.calls() };
}

/** The calls of the stub `gh` that begin with `words`. */
const asked = (calls: readonly Called[], ...words: string[]): Called[] =>
  calls.filter((call) => words.every((word, i) => call.argv[i] === word));

/** A file holding the merge commit's body: its path. */
function body(text = 'What landed, and why.\n\nRun r-1: 1 commit.\n'): string {
  const file = path.join(scratch('wf-land-files-'), 'merge-body.md');
  fs.writeFileSync(file, text);
  return file;
}

/** The merge verb's arguments, with the body in a file of its own, reading the CI context `check`. */
const args = (file = body(), subject = "Land a run's change through its pull request", check = 'ci'): string[] => [
  '--run',
  RUN,
  '--subject',
  subject,
  '--body-file',
  file,
  '--check',
  check,
];

/** Where the checkout stands: the branch it is on, its HEAD, whether it is clean, and whether a merge is in progress. */
const stands = (repo: string): { branch: string; head: string; clean: boolean; merging: boolean } => ({
  branch: gitIn(repo, 'symbolic-ref', '--short', 'HEAD').trim(),
  head: gitIn(repo, 'rev-parse', 'HEAD').trim(),
  clean: gitIn(repo, 'status', '--porcelain', '--untracked-files=no').trim() === '',
  merging: fs.existsSync(path.join(repo, '.git', 'MERGE_HEAD')),
});

test("merge merges the run's own green pull request with a merge commit at the head the review read, and fast-forwards the checkout", () => {
  const w = world();
  w.gh.answers(mergeable(w));
  const file = body();
  const r = land(w, 'merge', args(file));
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(asked(r.calls, 'pr', 'merge')[0].argv, [
    'pr',
    'merge',
    '7',
    '--merge',
    '--match-head-commit',
    w.tip,
    '--subject',
    "Land a run's change through its pull request",
    '--body-file',
    file,
  ]);
  assert.ok(
    !r.calls.some((call) => call.argv.includes('--delete-branch')),
    `never --delete-branch: the repository auto-deletes the head branch\n${JSON.stringify(r.calls)}`,
  );
  assert.ok(!r.calls.some((call) => call.argv.includes('--squash') || call.argv.includes('--rebase')), 'a merge commit, never a squash');
  assert.deepEqual(stands(w.repo), { branch: 'main', head: w.merged, clean: true, merging: false }, 'main is fast-forwarded onto it');
  assert.match(r.out, /nemia land: #7 merged at [0-9a-f]{12} with a merge commit/);
  assert.match(r.out, /nemia land: `main` here is fast-forwarded to [0-9a-f]{12}/);
});

test('receipt passes on the landing the merge made: merged, a merge commit, the checkout clean on it, no branch left out, ci green at the merge', () => {
  const w = world();
  w.gh.answers(mergeable(w));
  assert.equal(land(w, 'merge', args()).code, 0);
  const merges = asked(w.gh.calls(), 'pr', 'merge').length;
  w.gh.answers(landed(w));
  const r = land(w, 'receipt', receiptArgs());
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /nemia land: #7 is merged as [0-9a-f]{12}, a merge commit/);
  assert.match(r.out, /every commit of `wf\/r-1\/` on HEAD, by its patch/);
  assert.equal(asked(r.calls, 'pr', 'merge').length, merges, 'the receipt merges nothing of its own');
  assert.equal(waited(r.calls, `commits/${w.merged}`).length, 1, 'it read the CI of the merge commit');
  assert.ok(r.out.includes(`\`ci\` passed on \`main\` at ${w.merged.slice(0, 12)}`), r.out);
});

test('REFUSED: a verb the script has not, and a merge with no subject, no body file, or a body file that is missing or empty', () => {
  const w = world();
  w.gh.answers(mergeable(w));
  const unknown = land(w, 'land');
  assert.equal(unknown.code, 1);
  assert.match(unknown.err, /`land` is no verb: give merge or receipt/);
  assert.deepEqual(unknown.calls, []);

  const file = body();
  for (const given of [
    ['--run', RUN, '--check', 'ci'],
    ['--run', RUN, '--subject', 'x', '--check', 'ci'],
    ['--run', RUN, '--body-file', file, '--check', 'ci'],
    ['--run', RUN, '--subject', 'x', '--body-file', file, '--check', 'ci', '--delete-branch', 'y'],
  ]) {
    const r = land(w, 'merge', given);
    assert.equal(r.code, 1, given.join(' '));
    assert.equal(asked(r.calls, 'pr', 'merge').length, 0, 'nothing is merged');
  }
  const missing = land(w, 'merge', args(path.join(scratch('wf-land-none-'), 'gone.md')));
  assert.equal(missing.code, 1, missing.out);
  assert.ok(missing.err.includes('gone.md` is not a file'), missing.err);
  assert.match(missing.err, /\$WF_STEP_FILES/);

  const empty = land(w, 'merge', args(body('   \n')));
  assert.equal(empty.code, 1, empty.out);
  assert.match(empty.err, /is empty, and main's history says what landed and why/);
  assert.equal(asked(empty.calls, 'pr', 'merge').length, 0);
});

test('REFUSED: a dirty checkout and a merge in progress, before anything calls gh; and a checkout not on the base, before anything is merged', () => {
  const dirty = world();
  dirty.gh.answers(mergeable(dirty));
  fs.writeFileSync(path.join(dirty.repo, 'a.ts'), 'export const a = 99;\n');
  const r = land(dirty, 'merge', args());
  assert.equal(r.code, 1, r.out);
  assert.ok(r.err.includes('this checkout has uncommitted changes'), r.err);
  assert.ok(r.err.includes('a.ts'), 'and names what is uncommitted');
  assert.deepEqual(r.calls, [], 'gh is not called at all');

  const midway = world();
  midway.gh.answers(mergeable(midway));
  gitIn(midway.repo, 'switch', '-q', '-c', 'theirs', midway.base);
  fs.writeFileSync(path.join(midway.repo, 'b.ts'), 'export const b = 9;\n');
  gitIn(midway.repo, 'add', '-A');
  gitIn(midway.repo, 'commit', '-qm', 'conflicting');
  gitIn(midway.repo, 'switch', '-q', 'main');
  spawnSync('git', ['-C', midway.repo, 'merge', '--no-commit', '--no-ff', RESULT], { encoding: 'utf8' });
  spawnSync('git', ['-C', midway.repo, 'merge', '--no-commit', '--no-ff', 'theirs'], { encoding: 'utf8' });
  const merging = land(midway, 'merge', args());
  assert.equal(merging.code, 1, merging.out);
  assert.match(merging.err, /a merge is already in progress in this checkout/);
  assert.match(merging.err, /git merge --abort/);
  assert.deepEqual(merging.calls, [], 'gh is not called at all');

  const elsewhere = world();
  elsewhere.gh.answers(mergeable(elsewhere));
  gitIn(elsewhere.repo, 'switch', '-q', '-c', 'side');
  const off = land(elsewhere, 'merge', args());
  assert.equal(off.code, 1, off.out);
  assert.match(off.err, /this checkout is on `side`, not on the base branch `main`/);
  assert.match(off.err, /git switch main/);
  assert.equal(asked(off.calls, 'pr', 'merge').length, 0, 'nothing is merged');
});

test('REFUSED: a draft pull request, one based on another branch, and one whose head is not the result branch here', () => {
  const draft = world();
  draft.gh.answers(mergeable(draft, { isDraft: true }));
  const d = land(draft, 'merge', args());
  assert.equal(d.code, 1, d.out);
  assert.match(d.err, /#7 is a draft/);
  assert.match(d.err, /gh pr ready 7/);
  assert.equal(asked(d.calls, 'pr', 'merge').length, 0);

  const based = world();
  based.gh.answers(mergeable(based, { baseRefName: 'release' }));
  const b = land(based, 'merge', args());
  assert.equal(b.code, 1, b.out);
  assert.match(b.err, /#7 is based on `release`, not on the base branch `main`/);
  assert.match(b.err, /gh pr edit 7 --base main/);
  assert.ok(b.err.includes('gh api -X PATCH repos/{owner}/{repo}/pulls/7 -f base=main'), b.err);

  const moved = world();
  moved.gh.answers(mergeable(moved, { headRefOid: moved.base }));
  const m = land(moved, 'merge', args());
  assert.equal(m.code, 1, m.out);
  assert.ok(m.err.includes(`#7 has ${moved.base.slice(0, 12)} as its head and \`${RESULT}\` is at ${moved.tip.slice(0, 12)} here`), m.err);
  assert.match(m.err, /the commit that would land is not the one the review read/);
  assert.equal(asked(m.calls, 'pr', 'merge').length, 0);
  assert.equal(stands(moved.repo).head, moved.base, 'the checkout is untouched');
});

test('REFUSED: a mergeable GitHub does not call MERGEABLE — conflicting, unknown, or none at all', () => {
  for (const mergeableAs of ['CONFLICTING', 'UNKNOWN', undefined]) {
    const w = world();
    w.gh.answers(mergeable(w, { mergeable: mergeableAs }));
    const r = land(w, 'merge', args());
    assert.equal(r.code, 1, `${mergeableAs}: ${r.out}`);
    assert.ok(r.err.includes(`is \`${mergeableAs ?? 'unknown'}\`, not \`MERGEABLE\``), r.err);
    assert.equal(asked(r.calls, 'pr', 'merge').length, 0, 'nothing is merged');
  }
});

test('REFUSED: a ci that is red, one still running, and a head no ci judged at all; nothing is merged', () => {
  const red = world();
  red.gh.answers([
    ...mergeable(red).filter((rule) => rule.when !== 'pr view'),
    { when: 'pr view', out: checks({ status: 'COMPLETED', conclusion: 'FAILURE' }) },
  ]);
  const r = land(red, 'merge', args());
  assert.equal(r.code, 1, r.out);
  assert.match(r.err, /`ci` for #7 is failure/);
  assert.match(r.err, /only a green pull request lands/);
  assert.equal(asked(r.calls, 'pr', 'merge').length, 0);

  const running = world();
  running.gh.answers([
    ...mergeable(running).filter((rule) => rule.when !== 'pr view'),
    { when: 'pr view', out: checks({ status: 'IN_PROGRESS' }) },
  ]);
  const p = land(running, 'merge', args());
  assert.equal(p.code, 1, p.out);
  assert.match(p.err, /`ci` for #7 is without a verdict/);
  assert.equal(asked(p.calls, 'pr', 'merge').length, 0);

  const none = world();
  none.gh.answers([
    ...mergeable(none).filter((rule) => rule.when !== 'pr view'),
    { when: 'pr view', out: JSON.stringify({ statusCheckRollup: [{ name: 'lint', status: 'COMPLETED', conclusion: 'SUCCESS' }] }) },
  ]);
  const a = land(none, 'merge', args());
  assert.equal(a.code, 1, a.out);
  assert.match(a.err, /no `ci` context was reported for #7 at [0-9a-f]{12}/);
  assert.match(a.err, /nothing has judged the commit that would land/);
  assert.equal(asked(a.calls, 'pr', 'merge').length, 0);
});

test('merge reads the CI context --check names and no other: a green `ci` is no verdict for `--check gate`, a green `gate` is', () => {
  const ciAlone = world();
  ciAlone.gh.answers(mergeable(ciAlone));
  const refused = land(ciAlone, 'merge', args(body(), 'x', 'gate'));
  assert.equal(refused.code, 1, refused.out);
  assert.match(refused.err, /no `gate` context was reported for #7/);
  assert.equal(asked(refused.calls, 'pr', 'merge').length, 0, 'nothing is merged');

  const gated = world();
  gated.gh.answers([
    ...mergeable(gated).filter((rule) => rule.when !== 'pr view'),
    {
      when: 'pr view',
      out: checks({ status: 'COMPLETED', conclusion: 'FAILURE' }, { name: 'gate', status: 'COMPLETED', conclusion: 'SUCCESS' }),
    },
  ]);
  const passed = land(gated, 'merge', args(body(), 'x', 'gate'));
  assert.equal(passed.code, 0, passed.err);
  assert.equal(asked(passed.calls, 'pr', 'merge').length, 1, 'a red `ci` beside a green `gate` is not what --check gate reads');
});

test('REFUSED: a merge with no --check, or a --check with no name, before anything calls gh', () => {
  const w = world();
  w.gh.answers(mergeable(w));
  for (const given of [args().slice(0, -2), args().slice(0, -1)]) {
    const r = land(w, 'merge', given);
    assert.equal(r.code, 1, r.out);
    assert.ok(r.err.startsWith('nemia land: '), `a refusal of the script's, not a crash:\n${r.err}`);
    assert.match(r.err, /--check/, 'naming the flag');
    assert.deepEqual(r.calls, [], 'gh is not called at all');
  }
});

test('REFUSED: a result branch of the run with a commit whose patch the head does not hold; one whose patches it holds is taken', () => {
  const w = world({ extra: `wf/${RUN}/review` });
  takenPart(w);
  const extra = gitIn(w.repo, 'rev-parse', `wf/${RUN}/review`).trim();
  w.gh.answers(mergeable(w));
  const r = land(w, 'merge', args());
  assert.equal(r.code, 1, r.out);
  assert.ok(r.err.includes(`would leave out \`wf/r-1/review\` (${extra.slice(0, 12)})`), r.err);
  assert.ok(!r.err.includes('part-a'), 'a branch whose every patch is on the head is not left out');
  assert.equal(asked(r.calls, 'pr', 'merge').length, 0, 'nothing is merged');

  gitIn(w.repo, 'branch', '-D', `wf/${RUN}/review`);
  w.gh.answers(mergeable(w));
  const taken = land(w, 'merge', args());
  assert.equal(taken.code, 0, taken.err);
  assert.equal(asked(taken.calls, 'pr', 'merge').length, 1, 'the part taken by its patch lands with the rest');
});

test('REFUSED: a run with no result branch in this checkout, named with the fetch a person types', () => {
  const w = world();
  w.gh.answers(mergeable(w));
  const r = land(w, 'merge', ['--run', 'r-9', '--subject', 'x', '--body-file', body(), '--check', 'ci']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.err, /this checkout has no branch under `wf\/r-9\/`/);
  assert.deepEqual(r.calls, [], 'gh is not called at all');
});

test('REFUSED: a fast-forward git declines after GitHub merged, leaving the checkout on the base with no merge in progress', () => {
  const w = world();
  w.gh.answers(mergeable(w));
  fs.writeFileSync(path.join(w.repo, 'mine.ts'), 'export const mine = 1;\n');
  gitIn(w.repo, 'add', '-A');
  gitIn(w.repo, 'commit', '-qm', 'a commit of the checkout that origin does not have');
  const diverged = gitIn(w.repo, 'rev-parse', 'HEAD').trim();
  const r = land(w, 'merge', args());
  assert.equal(r.code, 1, r.out);
  assert.ok(r.err.includes('#7 is merged on GitHub'), r.err);
  assert.ok(r.err.includes('`git merge --ff-only origin/main` was declined'), r.err);
  assert.match(r.err, /a landing never merges in a person's checkout/);
  assert.ok(r.err.includes(RETRY), r.err);
  assert.deepEqual(stands(w.repo), { branch: 'main', head: diverged, clean: true, merging: false }, 'left as it was found');
  assert.equal(asked(r.calls, 'pr', 'merge').length, 1, 'GitHub was asked once, and the refusal says so');
});

test('REFUSED: a gh pr merge GitHub declines; nothing is fast-forwarded and the refusal names the retry line', () => {
  const w = world();
  w.gh.answers([
    ...mergeable(w).filter((rule) => rule.when !== 'pr merge'),
    { when: 'pr merge', status: 1, err: 'Pull request #7 is not mergeable: the head commit has changed' },
  ]);
  const r = land(w, 'merge', args());
  assert.equal(r.code, 1, r.out);
  assert.match(r.err, /GitHub declined to merge #7 at [0-9a-f]{12}/);
  assert.match(r.err, /Nothing landed and this checkout is untouched/);
  assert.ok(r.err.includes(RETRY), r.err);
  assert.equal(stands(w.repo).head, w.base, 'the checkout is on the commit it was');
});

test('REFUSED: no open pull request of the run, and two of them, each naming what a person does', () => {
  const w = world();
  w.gh.answers([...mergeable(w).filter((rule) => rule.when !== 'pr list'), { when: 'pr list', out: '[]' }]);
  const r = land(w, 'merge', args());
  assert.equal(r.code, 1, r.out);
  assert.ok(r.err.includes('no open pull request has a branch of `wf/r-1/`'), r.err);
  assert.match(r.err, /gh pr reopen <number>/);

  const other = world({ extra: `wf/${RUN}/review` });
  const two = JSON.parse(listed(other)) as Record<string, unknown>[];
  other.gh.answers([
    ...mergeable(other).filter((rule) => rule.when !== 'pr list'),
    { when: 'pr list', out: JSON.stringify([...two, { ...two[0], number: 8, headRefName: `wf/${RUN}/review` }]) },
  ]);
  const both = land(other, 'merge', args());
  assert.equal(both.code, 1, both.out);
  assert.ok(both.err.includes('2 open pull requests have a branch of `wf/r-1/`'), both.err);
  assert.ok(both.err.includes('(#7, #8)'), both.err);
  assert.match(both.err, /gh pr close <number>/);
  assert.equal(asked(both.calls, 'pr', 'merge').length, 0);
});

test("REFUSED: a pull request of another run's branch is no landing of this one", () => {
  const w = world();
  const mine = JSON.parse(listed(w)) as Record<string, unknown>[];
  w.gh.answers([
    ...mergeable(w).filter((rule) => rule.when !== 'pr list'),
    { when: 'pr list', out: JSON.stringify([{ ...mine[0], headRefName: 'wf/r-2/implement' }]) },
  ]);
  const r = land(w, 'merge', args());
  assert.equal(r.code, 1, r.out);
  assert.ok(r.err.includes('no open pull request has a branch of `wf/r-1/`'), r.err);
  assert.equal(asked(r.calls, 'pr', 'merge').length, 0);
});

test('REFUSED: a receipt whose pull request is not merged, or merged as a commit with one parent', () => {
  const w = world();
  w.gh.answers(mergeable(w));
  assert.equal(land(w, 'merge', args()).code, 0);

  for (const state of ['OPEN', 'CLOSED']) {
    w.gh.answers(landed(w, { state }));
    const r = land(w, 'receipt', receiptArgs());
    assert.equal(r.code, 1, `${state}: ${r.out}`);
    assert.match(r.err, /no pull request of `wf\/r-1\/` is merged/);
    assert.ok(r.err.includes(`#7 is \`${state.toLowerCase()}\``), r.err);
    assert.match(r.err, /landing\.ts merge --run r-1 --subject … --body-file …/);
    assert.match(r.err, /--body-file … --check <name>/);
    assert.deepEqual(waited(r.calls), [], 'a receipt that refuses waits on nothing');
  }

  w.gh.answers([...landed(w).filter((rule) => rule.when !== 'pr list'), { when: 'pr list', out: '[]' }]);
  const none = land(w, 'receipt', receiptArgs());
  assert.equal(none.code, 1, none.out);
  assert.ok(none.err.includes('no pull request of `wf/r-1/` is merged'), none.err);
  assert.ok(none.err.includes('nothing of this run landed'), none.err);
  assert.match(none.err, /landing\.ts merge --run r-1 --subject … --body-file …/);
  assert.match(none.err, /--body-file … --check <name>/);

  w.gh.answers(landed(w, { mergeCommit: { oid: w.tip } }));
  const squashed = land(w, 'receipt', receiptArgs());
  assert.equal(squashed.code, 1, squashed.out);
  assert.match(squashed.err, /which has 1 parent and not the two a merge commit has/);
  assert.match(squashed.err, /it was squashed or rebased/);
  assert.deepEqual(waited(squashed.calls), [], 'a receipt that refuses waits on nothing');

  w.gh.answers(landed(w, { mergeCommit: null }));
  const nameless = land(w, 'receipt', receiptArgs());
  assert.equal(nameless.code, 1, nameless.out);
  assert.match(nameless.err, /is merged but names no merge commit/);
});

test('REFUSED: a receipt in a checkout the fast-forward did not reach, one that is dirty, and one a branch of the run is not in', () => {
  const behind = world();
  behind.gh.answers(landed(behind));
  const r = land(behind, 'receipt', receiptArgs());
  assert.equal(r.code, 1, r.out);
  assert.ok(r.err.includes("the merge of #7, is not reachable from this checkout's HEAD"), r.err);
  assert.ok(r.err.includes('the fast-forward did not happen'), r.err);
  assert.match(r.err, /git fetch origin && git merge --ff-only origin\/main/);
  assert.deepEqual(waited(r.calls), [], 'a receipt that refuses waits on nothing');

  const dirty = world();
  dirty.gh.answers(mergeable(dirty));
  assert.equal(land(dirty, 'merge', args()).code, 0);
  fs.writeFileSync(path.join(dirty.repo, 'a.ts'), 'export const a = 42;\n');
  dirty.gh.answers(landed(dirty));
  const d = land(dirty, 'receipt', receiptArgs());
  assert.equal(d.code, 1, d.out);
  assert.match(d.err, /this checkout has uncommitted changes/);
  assert.deepEqual(waited(d.calls), [], 'a receipt that refuses waits on nothing');

  const left = world();
  left.gh.answers(mergeable(left));
  assert.equal(land(left, 'merge', args()).code, 0);
  gitIn(left.repo, 'branch', `wf/${RUN}/review`, left.base);
  fs.writeFileSync(path.join(left.repo, 'c.ts'), 'export const c = 3;\n');
  gitIn(left.repo, 'add', '-A');
  gitIn(left.repo, 'commit', '-qm', 'work off the base');
  gitIn(left.repo, 'branch', '-f', `wf/${RUN}/review`, 'HEAD');
  gitIn(left.repo, 'reset', '-q', '--hard', 'HEAD~1');
  takenPart(left);
  left.gh.answers(landed(left));
  const l = land(left, 'receipt', receiptArgs());
  assert.equal(l.code, 1, l.out);
  assert.ok(l.err.startsWith('nemia land: `wf/r-1/review` ('), l.err);
  assert.ok(!l.err.includes('part-a'), 'a branch whose every patch is on HEAD is not left out');
  assert.match(l.err, /the run would record a landing that left it out/);
  assert.deepEqual(waited(l.calls), [], 'a receipt that refuses waits on nothing');

  gitIn(left.repo, 'branch', '-D', `wf/${RUN}/review`);
  left.gh.answers(landed(left));
  const taken = land(left, 'receipt', receiptArgs());
  assert.equal(taken.code, 0, taken.err);
});

test('merge after a fast-forward it was declined merges nothing a second time: it reads the pull request merged and fast-forwards alone', () => {
  const w = world();
  w.gh.answers(mergeable(w));
  fs.writeFileSync(path.join(w.repo, 'mine.ts'), 'export const mine = 1;\n');
  gitIn(w.repo, 'add', '-A');
  gitIn(w.repo, 'commit', '-qm', 'a commit of the checkout that origin does not have');
  const declined = land(w, 'merge', args());
  assert.equal(declined.code, 1, declined.out);
  assert.match(declined.err, /was declined here/);
  assert.ok(declined.err.includes('fast-forwards it alone'), declined.err);
  assert.ok(declined.err.includes('being merged already'), declined.err);
  assert.ok(declined.err.includes(RETRY), 'and names the line that runs it again');
  assert.match(declined.err, /git log origin\/main\.\.HEAD/);
  assert.equal(asked(declined.calls, 'pr', 'merge').length, 1, 'GitHub merged it once');

  gitIn(w.repo, 'reset', '-q', '--hard', 'HEAD~1');
  w.gh.answers(landed(w));
  const again = land(w, 'merge', args());
  assert.equal(again.code, 0, again.err);
  assert.equal(asked(again.calls, 'pr', 'merge').length, 1, 'nothing is merged a second time');
  assert.match(again.out, /nemia land: #7 was merged already, at [0-9a-f]{12}: nothing is merged a second time/);
  assert.match(again.out, /nemia land: `main` here is fast-forwarded to [0-9a-f]{12}/);
  assert.deepEqual(stands(w.repo), { branch: 'main', head: w.merged, clean: true, merging: false });

  const receipt = land(w, 'receipt', receiptArgs());
  assert.equal(receipt.code, 0, receipt.err);
});

test('the receipt takes the merged pull request among the ones the run has: a closed one beside it is no refusal, two merged ones are', () => {
  const w = world();
  w.gh.answers(mergeable(w));
  assert.equal(land(w, 'merge', args()).code, 0);
  const merged = JSON.parse(listed(w, { state: 'MERGED', mergeCommit: { oid: w.merged } })) as Record<string, unknown>[];
  const closed = { ...merged[0], number: 8, url: 'https://github.com/o/r/pull/8', state: 'CLOSED', mergeCommit: null };

  w.gh.answers([...landed(w).filter((rule) => rule.when !== 'pr list'), { when: 'pr list', out: JSON.stringify([closed, ...merged]) }]);
  const beside = land(w, 'receipt', receiptArgs());
  assert.equal(beside.code, 0, `a closed pull request beside the merged one is no refusal: it cannot be closed again\n${beside.err}`);
  assert.match(beside.out, /nemia land: #7 is merged as [0-9a-f]{12}, a merge commit/);

  w.gh.answers([
    ...landed(w).filter((rule) => rule.when !== 'pr list'),
    { when: 'pr list', out: JSON.stringify([...merged, { ...merged[0], number: 8, url: 'https://github.com/o/r/pull/8' }]) },
  ]);
  const both = land(w, 'receipt', receiptArgs());
  assert.equal(both.code, 1, both.out);
  assert.match(both.err, /2 pull requests of `wf\/r-1\/` are merged \(#7, #8\)/);
  assert.match(both.err, /is a person's to say/);
});

test('REFUSED: a merge of a run that has one pull request merged and another still open, which of them landed being nobody to guess', () => {
  const w = world();
  const merged = JSON.parse(listed(w, { state: 'MERGED', mergeCommit: { oid: w.merged } })) as Record<string, unknown>[];
  const open = JSON.parse(listed(w, { number: 8, url: 'https://github.com/o/r/pull/8' })) as Record<string, unknown>[];
  w.gh.answers([...mergeable(w).filter((rule) => rule.when !== 'pr list'), { when: 'pr list', out: JSON.stringify([...merged, ...open]) }]);
  const r = land(w, 'merge', args());
  assert.equal(r.code, 1, r.out);
  assert.match(r.err, /#7 of this run is merged already and #8 is still open/);
  assert.match(r.err, /gh pr close <number>/);
  assert.match(r.err, /Nothing is merged here/);
  assert.equal(asked(r.calls, 'pr', 'merge').length, 0);
  assert.equal(stands(w.repo).head, w.base, 'and the checkout is untouched');
});

test('REFUSED: a receipt whose merge turned the base red, naming the jobs that did not pass; the merge stands', () => {
  const w = afterMerge();
  const cancelled = checkRun('e2e', 'cancelled');
  w.gh.answers(
    landedWith(
      w,
      ...ciAt(w.merged, [
        checkRun('ci', 'failure', 'completed', 'https://github.com/o/r/actions/runs/1/job/9'),
        cancelled,
        checkRun('lint', 'success'),
      ]),
      tipIs(w.merged),
    ),
  );
  const r = land(w, 'receipt', receiptArgs());
  assert.equal(r.code, 1, r.out);
  assert.ok(r.err.startsWith('nemia land: '), r.err);
  assert.ok(r.err.includes('`main`'), r.err);
  assert.match(r.err, /red/);
  assert.ok(r.err.includes(w.merged.slice(0, 12)), 'naming the merge commit');
  assert.ok(r.err.includes(`e2e: CANCELLED ${JOB_URL}`), `the cancelled job with its URL:\n${r.err}`);
  assert.ok(!r.err.includes('lint:'), 'a job that passed is not named');
  assert.match(r.err, /merge stands/);
  assert.ok(r.err.includes(RETRY), r.err);
  assert.deepEqual(
    r.calls.filter((call) => call.argv.some((word) => word.includes('/compare/'))),
    [],
    'a tip that is the merge itself is compared with nothing',
  );
});

test('the receipt waits on ci at the merge commit: still running past the bound is refused, and a poll that turns green passes', () => {
  const w = afterMerge();
  w.gh.answers(landedWith(w, ...ciAt(w.merged, [checkRun('ci', null, 'in_progress')])));
  const running = land(w, 'receipt', receiptArgs(), NO_WAIT);
  assert.equal(running.code, 1, running.out);
  assert.match(running.err, /still in_progress after 0 s/);
  assert.ok(running.err.includes(JOB_URL), running.err);
  assert.match(running.err, /merge stands/);
  assert.ok(running.err.includes(RETRY), running.err);

  w.gh.answers(
    landedWith(
      w,
      ...ciAt(w.merged, [[checkRun('ci', null, 'queued')], [checkRun('ci', null, 'in_progress')], [checkRun('ci', 'success')]]),
    ),
  );
  const before = waited(w.gh.calls()).length;
  const turned = land(w, 'receipt', receiptArgs(), { WF_CI_POLL_SECONDS: '0' });
  assert.equal(turned.code, 0, turned.err);
  assert.ok(waited(turned.calls).length - before >= 2, 'it read the merge commit again while ci ran');
  assert.ok(turned.out.includes('`ci` passed on `main`'), turned.out);
});

test('REFUSED: a receipt whose ci is never reported at the merge commit names landingWaitsOnCi; a combined `pending` with no context is no verdict', () => {
  const w = afterMerge();
  w.gh.answers(landedWith(w, ...ciAt(w.merged, [checkRun('lint', 'success')], NO_STATUSES)));
  const r = land(w, 'receipt', receiptArgs(), { WF_CI_START_SECONDS: '0', WF_CI_POLL_SECONDS: '0' });
  assert.equal(r.code, 1, r.out);
  assert.match(r.err, /no `ci` was reported/);
  assert.match(r.err, /landingWaitsOnCi=false/);
  assert.ok(r.err.includes(RETRY), r.err);
});

test('a ci that waits on other jobs has the whole bound while one runs: red when it comes, and past the bound it names what still runs', () => {
  const w = afterMerge();
  const slow = (conclusion: string | null, status = 'completed'): Record<string, unknown> =>
    checkRun('slow', conclusion, status, 'https://github.com/o/r/actions/runs/1/job/5');
  w.gh.answers(
    landedWith(w, ...ciAt(w.merged, [[slow(null, 'in_progress')], [slow('failure'), checkRun('ci', 'failure')]]), tipIs(w.merged)),
  );
  const red = land(w, 'receipt', receiptArgs(), { WF_CI_START_SECONDS: '0', WF_CI_POLL_SECONDS: '0' });
  assert.equal(red.code, 1, red.out);
  assert.doesNotMatch(red.err, /no `ci` was reported/, 'not read as a ci that never runs on a push');
  assert.match(red.err, /red/);
  assert.ok(red.err.includes('slow: FAILURE https://github.com/o/r/actions/runs/1/job/5'), red.err);
  assert.ok(red.err.includes(RETRY), red.err);

  w.gh.answers(landedWith(w, ...ciAt(w.merged, [slow(null, 'in_progress')])));
  const running = land(w, 'receipt', receiptArgs(), NO_WAIT);
  assert.equal(running.code, 1, running.out);
  assert.match(running.err, /no `ci` was reported/);
  assert.ok(running.err.includes('slow: in_progress https://github.com/o/r/actions/runs/1/job/5'), running.err);
  assert.ok(running.err.includes(RETRY), running.err);
});

test('the receipt reads a status context as it reads a check run: a red one is refused, a green one passes', () => {
  const statuses = (state: string): string =>
    JSON.stringify({ state, statuses: [{ context: 'ci', state, target_url: 'https://ci.example/build/3' }] });
  const w = afterMerge();
  w.gh.answers(landedWith(w, ...ciAt(w.merged, [], statuses('failure')), tipIs(w.merged)));
  const red = land(w, 'receipt', receiptArgs());
  assert.equal(red.code, 1, red.out);
  assert.ok(red.err.includes('ci: FAILURE https://ci.example/build/3'), red.err);
  assert.ok(red.err.includes(RETRY), red.err);

  w.gh.answers(landedWith(w, ...ciAt(w.merged, [], statuses('success'))));
  const green = land(w, 'receipt', receiptArgs());
  assert.equal(green.code, 0, green.err);
});

test("a receipt red at the merge passes where the base's tip holds it and is green there; a tip red, running or diverged is refused", () => {
  const TIP = 'f'.repeat(40);
  const fixed = (w: World, compared: string, ...atTip: Record<string, unknown>[]): Rule[] =>
    landedWith(
      w,
      ...ciAt(w.merged, [checkRun('ci', 'failure')]),
      tipIs(TIP),
      { when: `compare/${w.merged}...${TIP}`, out: JSON.stringify({ status: compared }) },
      ...ciAt(TIP, atTip),
    );
  const w = afterMerge();
  for (const compared of ['ahead', 'identical']) {
    w.gh.answers(fixed(w, compared, checkRun('ci', 'success')));
    const r = land(w, 'receipt', receiptArgs());
    assert.equal(r.code, 0, `${compared}: ${r.err}`);
    assert.ok(r.out.includes(w.merged.slice(0, 12)) && r.out.includes(TIP.slice(0, 12)), r.out);
    assert.match(r.out, /red on `main` at the merge/);
  }
  for (const [why, compared, atTip] of [
    ['red at the tip', 'ahead', checkRun('ci', 'failure')],
    ['running at the tip', 'ahead', checkRun('ci', null, 'in_progress')],
    ['a tip that does not hold the merge', 'diverged', checkRun('ci', 'success')],
  ] as const) {
    w.gh.answers(fixed(w, compared, atTip));
    const r = land(w, 'receipt', receiptArgs());
    assert.equal(r.code, 1, `${why}: ${r.out}`);
    assert.match(r.err, /merge stands/, why);
    assert.ok(r.err.includes(RETRY), why);
  }
  w.gh.answers(landedWith(w, ...ciAt(w.merged, [checkRun('ci', 'failure')]), { when: 'commits/main', status: 1, err: 'HTTP 502' }));
  const unread = land(w, 'receipt', receiptArgs());
  assert.equal(unread.code, 1, `a tip that cannot be read is the red refusal: ${unread.out}`);
  assert.match(unread.err, /merge stands/);
});

test('a receipt told not to wait on ci reads no check, saying so by landingWaitsOnCi; a --wait-on-ci of neither, or none, is refused before gh', () => {
  const w = afterMerge();
  w.gh.answers(landed(w));
  const r = land(w, 'receipt', receiptArgs('false'));
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(waited(r.calls), [], 'no check of the merge commit is read');
  assert.match(r.out, /landingWaitsOnCi/);
  assert.match(r.out, /#7 is merged as [0-9a-f]{12}, a merge commit/, 'the three facts are proven all the same');

  for (const given of [receiptArgs('maybe'), ['--run', RUN, '--wait-on-ci', 'true'], ['--run', RUN, '--check', 'ci'], ['--run', RUN]]) {
    const calls = w.gh.calls().length;
    const refused = land(w, 'receipt', given);
    assert.equal(refused.code, 1, given.join(' '));
    assert.ok(refused.err.startsWith('nemia land: '), refused.err);
    assert.equal(refused.calls.length, calls, `gh is not called at all: ${given.join(' ')}`);
  }
});

test("the receipt's wait fits the landing check's deadline: the start bound under the whole, and the whole 300 s under the deadline", () => {
  const source = fs.readFileSync(SCRIPT, 'utf8');
  const end = source.indexOf('function ciAt(');
  assert.ok(end > 0, 'landing.ts has its ciAt');
  const head = source.slice(0, end);
  const bound = (name: string): number => {
    const found = new RegExp(`const ${name} = ([\\d_]+);`).exec(head);
    assert.ok(found, `landing.ts declares ${name} before ciAt`);
    return Number(found[1].replaceAll('_', ''));
  };
  assert.ok(bound('START_SECONDS') < bound('WHOLE_SECONDS'));
  assert.ok(
    LANDING_CHECK_DEADLINE_SECONDS - bound('WHOLE_SECONDS') >= 300,
    `the landing check's deadline is ${LANDING_CHECK_DEADLINE_SECONDS} s, the wait's ${bound('WHOLE_SECONDS')} s`,
  );
});

test("both land steps' checks, rendered on GitHub, are the receipt alone, run from the run's frozen workflow files, and run no suite and no e2e", async () => {
  const at = await renderedSdlc(['github=true']);
  for (const workflow of ['build', 'quick']) {
    const step = stepsOf(at, workflow).find((s) => s.name === 'land');
    assert.equal(typeof step?.check, 'string', `sdlc's ${workflow} has a land step with a check`);
    const frozen = step!.check!;
    assert.ok(
      frozen.startsWith(
        'if [ "true" = true ]; then { if [ -n "${WF_WORKFLOW_FILES:-}" ]; then node "$WF_WORKFLOW_FILES/landing.ts" receipt --run "$WF_RUN" --check "ci" --wait-on-ci "true";',
      ),
      `on GitHub, the receipt is run from the run's frozen workflow files first:\n${frozen}`,
    );
    assert.ok(frozen.includes('landing.ts" receipt --run "$WF_RUN"'), `and run on the run the check names:\n${frozen}`);
    assert.doesNotMatch(frozen, /\$WF_BASE_REF/, 'a workspace: base step is given no base ref');
    assert.doesNotMatch(frozen, /turbo run test|npm test/, "the suite is ci's, on the head the review read");
    assert.doesNotMatch(frozen, /npm run e2e/, 'and so is the whole e2e');
    assert.doesNotMatch(frozen, /--delete-branch/, "and the head branch is GitHub's to delete");

    const w = world();
    w.gh.answers(mergeable(w));
    assert.equal(land(w, 'merge', args()).code, 0);
    w.gh.answers(landed(w));
    const check = (more: Record<string, string>) => {
      const [cmd, ...argv] = checkArgv(frozen);
      const ran = spawnSync(cmd, argv, {
        cwd: w.repo,
        env: {
          PATH: `${w.gh.bin}${path.delimiter}${process.env.PATH ?? ''}`,
          HOME: w.repo,
          WF_RUN: RUN,
          WF_STEP: 'land',
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_CONFIG_NOSYSTEM: '1',
          ...w.gh.env(),
          ...more,
        },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 120_000,
      });
      return { code: ran.status, out: ran.stdout, err: ran.stderr };
    };
    const calls = w.gh.calls().length;
    const unset = check({});
    assert.notEqual(
      unset.code,
      0,
      `with no frozen workflow files named the check refuses, never reads the receipt from elsewhere:\n${unset.out}`,
    );
    assert.match(unset.err, /WF_WORKFLOW_FILES/, 'naming the variable');
    assert.equal(w.gh.calls().length, calls, 'and no receipt ran');
    const passed = check({ WF_WORKFLOW_FILES: path.join(at.tree, 'workflows', workflow) });
    assert.equal(passed.code, 0, passed.err);
    assert.match(passed.out, /nemia land: #7 is merged as [0-9a-f]{12}, a merge commit/, 'the receipt, from the frozen files');
    assert.ok(waited(w.gh.calls(), `commits/${w.merged}`).length > 0, 'and its wait on ci at the merge commit');
  }

  const unwaited = await renderedSdlc(['github=true', 'landingWaitsOnCi=false']);
  for (const workflow of ['build', 'quick']) {
    const frozen = stepsOf(unwaited, workflow).find((s) => s.name === 'land')?.check ?? '';
    assert.ok(frozen.includes('receipt --run "$WF_RUN" --check "ci" --wait-on-ci "false";'), `${workflow}: ${frozen}`);
  }
});

/** A `local-check` in `bin` that logs to `log`, refuses a tree that lacks the result branch's file, and otherwise exits `exit`. */
function localCheckStub(bin: string, log: string, exit: number): void {
  fs.writeFileSync(
    path.join(bin, 'local-check'),
    `#!/bin/sh\nprintf 'local-check\\n' >> '${log}'\n[ -f from-branch.ts ] || exit 9\nexit ${exit}\n`,
    { mode: 0o755 },
  );
}

test("REFUSED at shipped defaults: both land steps' checks run the local check on the tree the landing staged, from no frozen file, and call no gh", async () => {
  const at = await renderedSdlc(['localCheck=local-check']);
  for (const workflow of ['build', 'quick']) {
    const check = stepsOf(at, workflow).find((s) => s.name === 'land')?.check;
    assert.equal(typeof check, 'string', `sdlc's ${workflow} has a land step with a check`);
    const repo = scratch('wf-land-local-');
    gitIn(repo, 'init', '-q', '-b', 'main');
    fs.writeFileSync(path.join(repo, 'a.ts'), 'export const a = 1;\n');
    gitIn(repo, 'add', '-A');
    gitIn(repo, 'commit', '-qm', 'base');
    gitIn(repo, 'switch', '-q', '-c', RESULT);
    fs.writeFileSync(path.join(repo, 'from-branch.ts'), 'export const b = 2;\n');
    gitIn(repo, 'add', '-A');
    gitIn(repo, 'commit', '-qm', 'the work');
    gitIn(repo, 'switch', '-q', 'main');
    const bin = scratch('wf-land-local-bin-');
    const log = path.join(bin, 'said.log');
    const stub = (exit: number): void => localCheckStub(bin, log, exit);
    fs.writeFileSync(path.join(bin, 'gh'), `#!/bin/sh\nprintf 'gh %s\\n' "$*" >> '${log}'\nexit 1\n`, { mode: 0o755 });
    const said = (): string[] => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean) : []);
    const run = () => {
      fs.rmSync(log, { force: true });
      const [cmd, ...argv] = checkArgv(check!);
      const ran = spawnSync(cmd, argv, {
        cwd: repo,
        env: { PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`, HOME: repo, WF_RUN: RUN, WF_STEP: 'land' },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 120_000,
      });
      return { code: ran.status, out: ran.stdout, err: ran.stderr, said: said() };
    };

    stub(0);
    const unstaged = run();
    assert.notEqual(unstaged.code, 0, `${workflow}: with nothing staged, the tree lacks the work and the local check refuses it`);
    gitIn(repo, 'merge', '--no-ff', '--no-commit', RESULT);
    const passed = run();
    assert.equal(passed.code, 0, `${workflow}: ${passed.out}${passed.err}`);
    assert.deepEqual(passed.said, ['local-check'], `${workflow}: the local check ran once on the merged tree, and no gh`);
    stub(3);
    const red = run();
    assert.notEqual(red.code, 0, `${workflow}: a local check that fails on the merged tree refuses the landing`);
    assert.deepEqual(red.said, ['local-check']);
  }
});
