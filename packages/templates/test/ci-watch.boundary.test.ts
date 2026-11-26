/**
 * sdlc's watch on CI (`sdlc/carried/ci-watch.ts`, the program `programs/ci-watch/program.yaml` the daemon keeps running per factory):
 * one pass (`--once`) over a fixture of the factory's unfinished runs, served by a stub `nemia` first on the PATH, against a stub `gh`
 * answering from a fixture (`test/origin.ts`), in a scratch repository whose result branch is the step's. Each case reads what the
 * watcher wrote as the calls of `nemia condition` the stub recorded, and what it did to GitHub as the calls of `gh`.
 *
 * The pure decisions are proved by `contracts/ci-write.contract.ts`; here is only that the watcher reads them from the world and acts
 * on them: green and red at the step's head, a head that is not the step's, a step that has not reached its condition, the one re-run of a
 * red across a restart (read from `run_attempt`), a dispatch, a repository with no CI, a write already served, and `base-ci`.
 *
 * Its subject is a spawned script, git and `gh`: a boundary file.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { CI_URL, type Called, type Rule, ghIn, gitIn } from './origin.ts';

const SCRIPT = path.join(import.meta.dirname, '..', 'sdlc', 'carried', 'ci-watch.ts');

/** The result branch of the run `r-1`. */
const BRANCH = 'wf/r-1/run';

/** A commit of the base the merge is made on, and its merge commit, and the head's: forty hexadecimal digits each. */
const [MERGE, FIRST, SECOND, HEAD_TREE, MERGE_TREE] = ['a', 'b', 'c', 'd', 'e'].map((c) => c.repeat(40));

/** The stub `nemia`: `get` answers the fixture of runs, any other call is recorded. */
const NEMIA = `#!${process.execPath}
const fs = require('node:fs');
const argv = process.argv.slice(2);
if (argv[0] === 'get') {
  process.stdout.write(fs.readFileSync(process.env.NEMIA_RUNS, 'utf8'));
} else {
  fs.appendFileSync(process.env.NEMIA_LOG, JSON.stringify(argv) + '\\n');
}
`;

/** A scratch repository on the result branch, one commit in, and the commit. */
function placed() {
  const repo = scratch('wf-ci-watch-repo-');
  gitIn(repo, 'init', '-q', '-b', BRANCH);
  fs.writeFileSync(path.join(repo, 'a.ts'), 'export const a = 1;\n');
  gitIn(repo, 'add', '-A');
  gitIn(repo, 'commit', '-qm', 'work');
  return { repo, head: gitIn(repo, 'rev-parse', 'HEAD').trim() };
}

/** A check of a served step: passed or not, and the condition it waits on where it waits on one. */
const served = (name: string, passed: boolean, condition?: { name: string; status?: 'True' | 'False' | 'Unknown'; message?: string }) => ({
  name,
  verdict: { result: passed ? 'passed' : 'running' },
  ...(condition
    ? { condition: { name: condition.name, try: 1, status: condition.status ?? null, message: condition.message ?? null } }
    : {}),
});

/** A served step. */
const step = (name: string, repo: string, over: Record<string, unknown>, checks: unknown[]) => ({
  name,
  status: 'checking',
  workspace: repo,
  branch: BRANCH,
  current: { try: 1 },
  check: null,
  checks,
  ...over,
});

/** A served run holding `steps`. */
const runOf = (...steps: unknown[]) => JSON.stringify({ items: [{ metadata: { name: 'r-1' }, status: { steps } }] });

/** The implement step of the run, whose last check waits on `ci`, with `before` standing for what the checks before it did. */
const implement = (
  repo: string,
  over: { before?: boolean; condition?: { status?: 'True' | 'False' | 'Unknown'; message?: string }; status?: string } = {},
) =>
  step('implement', repo, over.status ? { status: over.status } : {}, [
    served('push', over.before ?? true),
    served('ci', false, { name: 'ci', ...over.condition }),
  ]);

/** One pass of the watcher on `runs`, answering `rules`, with `more` in its environment: the writes and the calls of `gh`. */
function pass(runs: string, rules: readonly Rule[], more: Record<string, string> = {}, flags = ['--wait-on-ci', 'true']) {
  const bin = scratch('wf-ci-watch-bin-');
  const gh = ghIn(bin, rules);
  fs.writeFileSync(path.join(bin, 'nemia'), NEMIA, { mode: 0o755 });
  const log = path.join(bin, 'conditions.jsonl');
  const file = path.join(bin, 'runs.json');
  fs.writeFileSync(file, runs);
  const ran = spawnSync(process.execPath, [SCRIPT, '--check', 'ci', ...flags, '--once'], {
    env: {
      PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`,
      HOME: bin,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      NEMIA_RUNS: file,
      NEMIA_LOG: log,
      ...gh.env(),
      ...more,
    },
    encoding: 'utf8',
    timeout: 60_000,
  });
  const written = (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean) : []).map((line) => {
    const argv = JSON.parse(line) as string[];
    const at = (flag: string) => argv[argv.indexOf(flag) + 1] ?? '';
    return {
      run: argv[1] ?? '',
      step: argv[2] ?? '',
      name: argv[3] ?? '',
      status: at('--status'),
      message: at('--message'),
      tried: at('--try'),
    };
  });
  return { code: ran.status, err: ran.stderr, written, calls: gh.calls() };
}

/** The calls of `gh` whose words hold `words`. */
const asked = (calls: readonly Called[], words: string) => calls.filter((call) => call.argv.join(' ').includes(words));

/** The pull request the rules answer with: open at `head`, its rollup `rollup`, or whatever `more` says. */
const pull = (head: string, rollup: unknown[], more: Record<string, unknown> = {}) =>
  JSON.stringify([
    {
      number: 7,
      url: 'https://github.com/o/r/pull/7',
      state: 'OPEN',
      baseRefName: 'main',
      headRefName: BRANCH,
      headRefOid: head,
      mergeable: 'MERGEABLE',
      statusCheckRollup: rollup,
      ...more,
    },
  ]);

/** A check entry of the rollup: the context `ci`, at the job `CI_URL` names, in the state `rest` says. */
const entry = (rest: Record<string, unknown>) => ({ name: 'ci', detailsUrl: CI_URL, ...rest });
const GREEN = entry({ status: 'COMPLETED', conclusion: 'SUCCESS' });
const RED = entry({ status: 'COMPLETED', conclusion: 'FAILURE' });

/** The workflow directory of a tree that declares a CI workflow. */
const DECLARED: Rule = { when: 'contents/.github/workflows', out: JSON.stringify([{ name: 'ci.yml' }]) };

test('a green context at the step’s head writes True for the step’s try, and nothing else', () => {
  const { repo, head } = placed();
  const r = pass(runOf(implement(repo)), [{ when: 'pr list', out: pull(head, [GREEN]) }]);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(
    r.written.map((w) => [w.run, w.step, w.name, w.status, w.tried]),
    [['r-1', 'implement', 'ci', 'True', '1']],
  );
  assert.match(r.written[0]?.message ?? '', new RegExp(head.slice(0, 12)));
});

test('a red whose log names a failing line writes False, naming the head, the jobs and the Actions address, with no log line', () => {
  const { repo, head } = placed();
  const r = pass(runOf(implement(repo)), [
    { when: 'pr list', out: pull(head, [RED]) },
    { when: 'actions/jobs/5678/logs', out: '✖ the cache keeps its entries\nAssertionError: expected 1 to equal 2' },
  ]);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.written.length, 1);
  const [said] = r.written;
  assert.equal(said?.status, 'False');
  assert.ok(said?.message.includes(head.slice(0, 12)), 'the head');
  assert.ok(said?.message.includes(CI_URL), 'the Actions address');
  assert.doesNotMatch(said?.message ?? '', /AssertionError/);
  assert.equal(asked(r.calls, 'run rerun').length, 0, 'a red the change made is never re-run');
});

test('a pull request whose head is not the tip of the step’s branch writes nothing', () => {
  const { repo } = placed();
  const r = pass(runOf(implement(repo)), [{ when: 'pr list', out: pull('f'.repeat(40), [GREEN]) }]);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(r.written, []);
});

test('a step that is not checking, or whose checks before the condition have not passed, gets nothing, and GitHub is not read', () => {
  const { repo, head } = placed();
  const rules = [{ when: 'pr list', out: pull(head, [GREEN]) }];
  for (const runs of [runOf(implement(repo, { before: false })), runOf(implement(repo, { status: 'working' }))]) {
    const r = pass(runs, rules);
    assert.equal(r.code, 0, r.err);
    assert.deepEqual(r.written, []);
    assert.deepEqual(r.calls, []);
  }
});

test('a red the logs do not call the change’s is re-run once; the first attempt’s red is no verdict while the re-run is awaited, and a red of the new attempt writes False', () => {
  const { repo, head } = placed();
  const rules = (attempt: number, jobAttempt: number) =>
    [
      { when: 'pr list', out: pull(head, [RED]) },
      { when: 'actions/jobs/5678/logs', out: 'Run npm ci\nnpm error network timeout' },
      { when: 'actions/jobs/5678', out: JSON.stringify({ run_attempt: jobAttempt }) },
      { when: 'actions/runs/1234', out: JSON.stringify({ run_attempt: attempt }) },
    ] satisfies Rule[];
  const first = pass(runOf(implement(repo)), rules(1, 1));
  assert.equal(first.code, 0, first.err);
  assert.equal(asked(first.calls, 'run rerun 1234 --failed').length, 1, 'the failed jobs are re-run');
  assert.deepEqual(
    first.written.map((w) => w.status),
    ['Unknown'],
  );
  const awaiting = pass(runOf(implement(repo)), rules(2, 1));
  assert.equal(awaiting.code, 0, awaiting.err);
  assert.equal(asked(awaiting.calls, 'run rerun').length, 0, 'a run past its first attempt is never re-run again');
  assert.deepEqual(
    awaiting.written.map((w) => w.status),
    ['Unknown'],
    'the red of the first attempt is not a verdict while the re-run has not reported',
  );
  const red = pass(runOf(implement(repo)), rules(2, 2));
  assert.equal(red.code, 0, red.err);
  assert.equal(asked(red.calls, 'run rerun').length, 0);
  assert.deepEqual(
    red.written.map((w) => w.status),
    ['False'],
    'a red of the re-run itself is the verdict',
  );
});

test('a context absent past the stuck bound has the workflow GitHub queued dispatched once; with one dispatched at the head already, it waits', () => {
  const { repo, head } = placed();
  const queued = { databaseId: 9, workflowName: 'ci', status: 'queued', event: 'pull_request', createdAt: '2020-01-01T00:00:00Z' };
  const rules = (listed: unknown[]) =>
    [
      { when: 'pr list', out: pull(head, []) },
      DECLARED,
      { when: 'run list', out: JSON.stringify(listed) },
      { when: 'actions/runs/9/jobs', out: JSON.stringify({ jobs: [{ status: 'queued' }] }) },
      { when: 'actions/runs/9', out: JSON.stringify({ path: '.github/workflows/ci.yml@refs/heads/x' }) },
    ] satisfies Rule[];
  const first = pass(runOf(implement(repo)), rules([queued]));
  assert.equal(first.code, 0, first.err);
  assert.equal(asked(first.calls, `workflow run ci.yml --ref ${BRANCH}`).length, 1);
  assert.deepEqual(
    first.written.map((w) => w.status),
    ['Unknown'],
  );
  const again = pass(runOf(implement(repo)), rules([queued, { ...queued, databaseId: 10, event: 'workflow_dispatch' }]));
  assert.equal(asked(again.calls, 'workflow run').length, 0, 'never a second dispatch');
  assert.deepEqual(
    again.written.map((w) => w.status),
    ['Unknown'],
  );
});

test('a head and a base that declare no CI workflow have True written within one pass, saying the local check judged it', () => {
  const { repo, head } = placed();
  const r = pass(runOf(implement(repo)), [
    { when: 'pr list', out: pull(head, []) },
    { when: 'contents/.github/workflows', status: 1, err: 'gh: Not Found (HTTP 404)' },
  ]);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(
    r.written.map((w) => w.status),
    ['True'],
  );
  assert.match(r.written[0]?.message ?? '', /local check judged it/);
});

test('an Unknown already served with the same words writes nothing', () => {
  const { repo, head } = placed();
  const rules: Rule[] = [{ when: 'pr list', out: pull(head, [entry({ status: 'IN_PROGRESS' })]) }];
  const first = pass(runOf(implement(repo)), rules);
  assert.equal(first.written.length, 1, first.err);
  const [said] = first.written;
  const second = pass(runOf(implement(repo, { condition: { status: 'Unknown', message: said?.message } })), rules);
  assert.equal(second.code, 0, second.err);
  assert.deepEqual(second.written, []);
});

test('a condition already True or False for the try is left alone', () => {
  const { repo, head } = placed();
  for (const status of ['True', 'False'] as const) {
    const r = pass(runOf(implement(repo, { condition: { status, message: 'decided' } })), [{ when: 'pr list', out: pull(head, [RED]) }]);
    assert.deepEqual(r.written, [], status);
  }
});

/** The land step of the run, in `repo`, on the base: the condition `ci`, the receipt that passed, then the condition `base-ci`. */
const landing = (repo: string, receipt = true) =>
  step('land', repo, { branch: 'main' }, [
    served('ci', true, { name: 'ci', status: 'True', message: 'green' }),
    served('receipt', receipt),
    served('base-ci', false, { name: 'base-ci' }),
  ]);

/** The run whose implement step ended on the result branch and whose land step is `land`. */
const landed = (repo: string, land: unknown) => runOf(step('implement', repo, { status: 'done' }, []), land);

/** The rules of a run whose pull request merged as `MERGE` onto `main`, with the context at the merge given by `runs`. */
const merged = (runs: unknown[], trees: [string, string] = [MERGE_TREE, HEAD_TREE]) =>
  [
    {
      when: 'pr list',
      out: pull(SECOND, [], { state: 'MERGED', mergeCommit: { oid: MERGE } }),
    },
    { when: `commits/${MERGE}/check-runs`, out: JSON.stringify({ check_runs: runs }) },
    { when: `commits/${MERGE}/status`, out: JSON.stringify({ statuses: [] }) },
    { when: `commits/${MERGE}`, out: JSON.stringify({ parents: [{ sha: FIRST }, { sha: SECOND }], commit: { tree: { sha: trees[0] } } }) },
    { when: `commits/${SECOND}`, out: JSON.stringify({ commit: { tree: { sha: trees[1] } } }) },
    { when: 'commits/main', out: JSON.stringify({ sha: MERGE }) },
    DECLARED,
    { when: 'actions/runs/1234', out: JSON.stringify({ run_attempt: 2 }) },
  ] satisfies Rule[];

const atMerge = (conclusion: string) => ({ name: 'ci', status: 'completed', conclusion, html_url: CI_URL });

test('base-ci: green at the merge commit writes True; red after a re-run writes False; the land step fails as a red check does', () => {
  const { repo } = placed();
  const green = pass(landed(repo, landing(repo)), merged([atMerge('success')]));
  assert.equal(green.code, 0, green.err);
  assert.deepEqual(
    green.written.map((w) => [w.step, w.name, w.status]),
    [['land', 'base-ci', 'True']],
  );
  const red = pass(landed(repo, landing(repo)), merged([atMerge('failure')]));
  assert.deepEqual(
    red.written.map((w) => [w.name, w.status]),
    [['base-ci', 'False']],
  );
  assert.match(red.written[0]?.message ?? '', /turned the base branch red/);
  assert.equal(asked(red.calls, 'run rerun').length, 0, 'a run past its first attempt is not re-run again');
});

test('base-ci: a red on its first attempt is re-run once and written Unknown', () => {
  const { repo } = placed();
  const rules = merged([atMerge('failure')]).map((rule) =>
    rule.when === 'actions/runs/1234' ? { ...rule, out: JSON.stringify({ run_attempt: 1 }) } : rule,
  );
  const r = pass(landed(repo, landing(repo)), rules);
  assert.equal(asked(r.calls, 'run rerun 1234 --failed').length, 1);
  assert.deepEqual(
    r.written.map((w) => w.status),
    ['Unknown'],
  );
});

test('base-ci: --wait-on-ci false writes True with no gh call, and a merge whose tree is the head’s needs no wait', () => {
  const { repo } = placed();
  const off = pass(landed(repo, landing(repo)), merged([]), {}, ['--wait-on-ci', 'false']);
  assert.deepEqual(
    off.written.map((w) => w.status),
    ['True'],
  );
  assert.deepEqual(off.calls, [], 'GitHub is not read');
  const same = pass(landed(repo, landing(repo)), merged([], [HEAD_TREE, HEAD_TREE]));
  assert.deepEqual(
    same.written.map((w) => w.status),
    ['True'],
  );
  assert.match(same.written[0]?.message ?? '', /same tree/);
});

test('the land step’s ci condition, once the pull request is merged, writes True', () => {
  const { repo } = placed();
  const land = step('land', repo, { branch: 'main' }, [
    served('ci', false, { name: 'ci' }),
    served('receipt', false),
    served('base-ci', false, { name: 'base-ci' }),
  ]);
  const r = pass(landed(repo, land), merged([]));
  assert.deepEqual(
    r.written.map((w) => [w.name, w.status]),
    [['ci', 'True']],
  );
});
