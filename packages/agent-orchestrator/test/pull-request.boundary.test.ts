/**
 * The build workflow's pull-request door (`workflows/build/pull-request.ts`): the one act that pushes a run's branch and opens the pull
 * request CI judges. Driven as its three owners drive it — `open` by the engineer's session, `push` and `wait` by the round's check — in
 * a scratch repository whose `origin` is a bare repository, so a push is a real push and a diverged tip a real rejection, with a stub
 * `gh` first on the PATH that records each call and answers from a fixture (`test/origin.ts`), each a bounded subprocess.
 *
 * The wait's two bounds are told apart by `WF_CI_START_SECONDS` and `WF_CI_WAIT_SECONDS`, each read on its own, and the shipped numbers
 * are held against the words of `workflows/build/README.md` and against a round check's own deadline.
 *
 * Its subject is git and a spawned script: a boundary file.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loadWorkflows } from '../src/folder/folder.store.ts';
import { CHECK_DEADLINE_SECONDS } from '../src/check/check.ts';
import { REPO, placesOf } from './team.ts';
import { scratch } from './scratch.ts';
import { CI_URL, GREEN, type Called, type Gh, type Rule, bareOrigin, ghStub, gitIn, listed, passing, rollup, tip } from './origin.ts';

const BUILD = path.join(REPO, 'workflows', 'build');

const SCRIPT = path.join(BUILD, 'pull-request.ts');

/**
 * The retry line a refusal of the wait must print: the run the branch names, and the step `WF_STEP` says — or, with it unset, the
 * constant fallback. The branch cannot say it: a run's line of work is `wf/<run>/run`, which names no step.
 */
const RETRY = 'nemia retry r-1 implement --recheck';

/** A place to push from: a scratch repository on `branch`, its `origin` a bare repository, and a stub `gh` answering `rules`. */
function placed({ branch = 'wf/r-1/run', remote = true } = {}): { repo: string; bare: string | undefined; branch: string; gh: Gh } {
  const repo = scratch('wf-pr-repo-');
  gitIn(repo, 'init', '-q', '-b', branch);
  fs.writeFileSync(path.join(repo, 'a.ts'), 'export const a = 1;\n');
  gitIn(repo, 'add', '-A');
  gitIn(repo, 'commit', '-qm', 'work');
  const bare = remote ? bareOrigin(repo) : undefined;
  return { repo, bare, branch, gh: ghStub(passing(repo)) };
}

type Ran = { code: number | null; out: string; err: string; calls: Called[] };

/** Run the script's `verb` in `at` with `args`, bounded; its exit, its streams and the calls the stub `gh` was given. */
function pr(at: ReturnType<typeof placed>, verb: string, args: string[] = [], more: Record<string, string> = {}): Ran {
  const ran = spawnSync(process.execPath, [SCRIPT, verb, ...args], {
    cwd: at.repo,
    env: {
      PATH: `${at.gh.bin}${path.delimiter}${process.env.PATH ?? ''}`,
      HOME: at.repo,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@t',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@t',
      ...at.gh.env(),
      ...more,
    },
    encoding: 'utf8',
    timeout: 60_000,
  });
  return { code: ran.status, out: ran.stdout, err: ran.stderr, calls: at.gh.calls() };
}

/** The calls of the stub `gh` that begin with `words`. */
const asked = (calls: readonly Called[], ...words: string[]): Called[] =>
  calls.filter((call) => words.every((word, i) => call.argv[i] === word));

/** A file written and committed in `repo`: the commit it made. */
function commit(repo: string, name: string): string {
  fs.writeFileSync(path.join(repo, name), `export const ${name.replace(/\W/g, '')} = 1;\n`);
  gitIn(repo, 'add', '-A');
  gitIn(repo, 'commit', '-qm', name);
  return gitIn(repo, 'rev-parse', 'HEAD').trim();
}

/** A body file to open the pull request with: its path. */
function body(text = 'What this round changed.\n'): string {
  const file = path.join(scratch('wf-pr-files-'), 'pr-body.md');
  fs.writeFileSync(file, text);
  return file;
}

test("open pushes the run's branch and creates the pull request with the title and body it was given, never a draft", () => {
  const at = placed();
  at.gh.answers([
    { when: 'auth status' },
    { when: 'repo view', out: JSON.stringify({ defaultBranchRef: { name: 'main' } }) },
    { when: 'pr list', out: '[]' },
    { when: 'pr create', out: 'https://github.com/o/r/pull/7' },
  ]);
  const file = body();
  const r = pr(at, 'open', ['--title', "A run's change is a pull request", '--body-file', file]);
  assert.equal(r.code, 0, r.err);
  assert.equal(tip(at.bare!, at.branch), gitIn(at.repo, 'rev-parse', 'HEAD').trim(), 'the branch is on origin at HEAD');
  const created = asked(r.calls, 'pr', 'create');
  assert.equal(created.length, 1, JSON.stringify(r.calls));
  assert.deepEqual(created[0].argv, [
    'pr',
    'create',
    '--base',
    'main',
    '--head',
    'wf/r-1/run',
    '--title',
    "A run's change is a pull request",
    '--body-file',
    file,
  ]);
  assert.ok(!r.calls.some((call) => call.argv.includes('--draft')), 'never a draft');
  assert.equal(asked(r.calls, 'pr', 'edit').length, 0);
  assert.match(r.out, /wf pr: https:\/\/github\.com\/o\/r\/pull\/7/);
});

test('open on a branch whose pull request is already open updates its title and body, and creates no second one', () => {
  const at = placed();
  const file = body('A second round.\n');
  const r = pr(at, 'open', ['--title', 'The same card', '--body-file', file]);
  assert.equal(r.code, 0, r.err);
  assert.equal(asked(r.calls, 'pr', 'create').length, 0, 'never a second pull request');
  assert.deepEqual(asked(r.calls, 'pr', 'edit')[0].argv, ['pr', 'edit', '7', '--title', 'The same card', '--body-file', file]);
  assert.match(r.out, /wf pr: https:\/\/github\.com\/o\/r\/pull\/7/);
});

test('REFUSED: open with no title or no body file, and a verb the script has not; nothing is pushed', () => {
  const at = placed();
  for (const args of [[], ['--title', 'x'], ['--body-file', body()], ['--title', 'x', '--draft', 'y']]) {
    const r = pr(at, 'open', args);
    assert.equal(r.code, 1, args.join(' '));
    assert.equal(tip(at.bare!, at.branch), null, 'nothing is pushed');
  }
  const unknown = pr(at, 'merge');
  assert.equal(unknown.code, 1);
  assert.match(unknown.err, /`merge` is no verb: give open, push or wait/);
  assert.deepEqual(unknown.calls, []);
});

test("REFUSED: a HEAD that is on no run's branch, or on the remote's default branch; nothing is pushed and no gh is called", () => {
  for (const branch of ['main', 'feature/x', 'wf/r-1']) {
    const at = placed({ branch });
    const r = pr(at, 'push');
    assert.equal(r.code, 1, branch);
    assert.match(r.err, /not a run's `wf\/<run>\/<leaf>`/);
    assert.match(r.err, /git switch wf\/<run>\/run/);
    assert.equal(tip(at.bare!, branch), null, 'nothing is pushed');
    assert.deepEqual(r.calls, [], 'no gh is called');
  }
  const named = placed();
  named.gh.answers([{ when: 'auth status' }, { when: 'repo view', out: JSON.stringify({ defaultBranchRef: { name: 'wf/r-1/run' } }) }]);
  const base = pr(named, 'push');
  assert.equal(base.code, 1, base.out);
  assert.match(base.err, /HEAD is on `wf\/r-1\/run`, the remote's default branch, and this script never pushes the base/);
  assert.equal(tip(named.bare!, 'wf/r-1/run'), null, 'nothing is pushed');
});

test('REFUSED: no origin remote, no gh on the PATH, and a gh that is not authenticated, each naming what to type', () => {
  const none = placed({ remote: false });
  const r = pr(none, 'push');
  assert.equal(r.code, 1, r.out);
  assert.match(r.err, /has no `origin` remote/);
  assert.match(r.err, /git remote -v/);
  assert.deepEqual(r.calls, [], 'the remote is read before gh');

  const at = placed();
  at.gh.answers([{ when: 'auth status', status: 1, err: 'You are not logged into any GitHub hosts.' }, ...passing(at.repo)]);
  const unauthed = pr(at, 'push');
  assert.equal(unauthed.code, 1, unauthed.out);
  assert.match(unauthed.err, /is not authenticated here: run `gh auth login`/);
  assert.equal(tip(at.bare!, at.branch), null, 'nothing is pushed');

  const gitAlone = scratch('wf-pr-nogh-');
  fs.symlinkSync(execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim(), path.join(gitAlone, 'git'));
  const missing = spawnSync(process.execPath, [SCRIPT, 'push'], {
    cwd: at.repo,
    env: { PATH: gitAlone, HOME: at.repo, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
    encoding: 'utf8',
    timeout: 60_000,
  });
  assert.equal(missing.status, 1, missing.stdout);
  assert.match(missing.stderr, /no `gh` on the PATH/);
  assert.match(missing.stderr, /gh auth login/);
});

test('REFUSED, never forced: a tip on origin that HEAD does not hold; origin keeps it, and the refusal names the merge', () => {
  const at = placed();
  gitIn(at.repo, 'push', '-q', 'origin', at.branch);
  const theirs = commit(at.repo, 'theirs.ts');
  gitIn(at.repo, 'push', '-q', 'origin', at.branch);
  gitIn(at.repo, 'reset', '-q', '--hard', 'HEAD~1');
  const mine = commit(at.repo, 'mine.ts');
  at.gh.answers(passing(at.repo));
  const r = pr(at, 'push');
  assert.equal(r.code, 1, r.out);
  assert.match(r.err, /was rejected, and this script never forces a push/);
  assert.match(r.err, /git merge main-worktree\/HEAD/);
  assert.equal(tip(at.bare!, at.branch), theirs, "origin's tip is the one it had");
  assert.notEqual(mine, theirs);
});

test('REFUSED: a draft pull request, or one based on another branch than the remote default; a draft names gh pr ready', () => {
  const at = placed();
  const head = gitIn(at.repo, 'rev-parse', 'HEAD').trim();
  at.gh.answers([...passing(at.repo).filter((rule) => rule.when !== 'pr list'), { when: 'pr list', out: listed(head, { isDraft: true }) }]);
  const draft = pr(at, 'open', ['--title', 'x', '--body-file', body()]);
  assert.equal(draft.code, 1, draft.out);
  assert.match(draft.err, /#7 is a draft/);
  assert.match(draft.err, /gh pr ready 7/);
  assert.equal(tip(at.bare!, at.branch), null, 'no push follows a draft');
  assert.equal(asked(draft.calls, 'pr', 'edit').length, 0);

  const other = placed();
  const at2 = gitIn(other.repo, 'rev-parse', 'HEAD').trim();
  other.gh.answers([
    ...passing(other.repo).filter((rule) => rule.when !== 'pr list'),
    { when: 'pr list', out: listed(at2, { baseRefName: 'release' }) },
  ]);
  const based = pr(other, 'open', ['--title', 'x', '--body-file', body()]);
  assert.equal(based.code, 1, based.out);
  assert.match(based.err, /#7 is based on `release`, not on the remote's default branch `main`/);
  assert.match(based.err, /gh pr edit 7 --base main/);
});

test('REFUSED: two open pull requests for one branch, naming the close a person types', () => {
  const at = placed();
  const head = gitIn(at.repo, 'rev-parse', 'HEAD').trim();
  const two = JSON.stringify([
    { number: 7, url: 'https://github.com/o/r/pull/7', isDraft: false, baseRefName: 'main', headRefOid: head },
    { number: 8, url: 'https://github.com/o/r/pull/8', isDraft: false, baseRefName: 'main', headRefOid: head },
  ]);
  at.gh.answers([...passing(at.repo).filter((rule) => rule.when !== 'pr list'), { when: 'pr list', out: two }]);
  const r = pr(at, 'push');
  assert.equal(r.code, 1, r.out);
  assert.match(r.err, /2 open pull requests have wf\/r-1\/run as its head \(#7, #8\)/);
  assert.match(r.err, /gh pr close <number>/);
});

test("push pushes the hand-off commit and proves the pull request's head is the commit the check judges", () => {
  const at = placed();
  const handed = commit(at.repo, 'handed-off.ts');
  at.gh.answers(passing(at.repo));
  const r = pr(at, 'push');
  assert.equal(r.code, 0, r.err);
  assert.equal(tip(at.bare!, at.branch), handed, 'the hand-off commit is on origin');
  assert.match(r.out, new RegExp(`wf pr: #7 is at ${handed.slice(0, 12)}, the commit this check judges`));
});

test('REFUSED: a pull request whose head is another commit, and none open at all; each names the open line', () => {
  const at = placed();
  const was = gitIn(at.repo, 'rev-parse', 'HEAD').trim();
  at.gh.answers(passing(at.repo));
  const now = commit(at.repo, 'later.ts');
  const stale = pr(at, 'push');
  assert.equal(stale.code, 1, stale.out);
  assert.ok(stale.err.includes(`#7 has ${was.slice(0, 12)} as its head and this workspace is on ${now.slice(0, 12)}`), stale.err);
  assert.match(stale.err, /CI's verdict would be for another commit than the one this check judges/);
  assert.match(stale.err, /node pull-request\.ts open --title "<the card's line>" --body-file "\$WF_STEP_FILES\/pr-body\.md"/);

  const none = placed();
  none.gh.answers([...passing(none.repo).filter((rule) => rule.when !== 'pr list'), { when: 'pr list', out: '[]' }]);
  const unopened = pr(none, 'push');
  assert.equal(unopened.code, 1, unopened.out);
  assert.match(unopened.err, /no open pull request has wf\/r-1\/run as its head, and CI judges a pull request's head/);
  assert.match(unopened.err, /node pull-request\.ts open --title "<the card's line>" --body-file "\$WF_STEP_FILES\/pr-body\.md"/);
});

test('wait polls the ci context until it has a verdict, and passes on a green one', () => {
  const at = placed();
  const pending: Rule = { when: 'pr view', outs: [rollup({ status: 'QUEUED' }), rollup({ status: 'IN_PROGRESS' }), GREEN] };
  at.gh.answers([...passing(at.repo).filter((rule) => rule.when !== 'pr view'), pending]);
  const r = pr(at, 'wait', [], { WF_CI_POLL_SECONDS: '0' });
  assert.equal(r.code, 0, r.err);
  assert.equal(asked(r.calls, 'pr', 'view').length, 3, 'it polled until the verdict');
  assert.match(r.out, /wf ci: `ci` passed on/);
  assert.equal(tip(at.bare!, at.branch), null, 'the wait pushes nothing');
});

test('REFUSED: a red ci, with the Actions URL, the failing jobs, a tail of the failing log and the retry line', () => {
  const at = placed();
  const log = ['a.test.ts', 'not ok 1 - a thing', 'the end'].join('\n');
  at.gh.answers([
    ...passing(at.repo).filter((rule) => rule.when !== 'pr view'),
    {
      when: 'pr view',
      out: rollup(
        { status: 'COMPLETED', conclusion: 'FAILURE' },
        { name: 'test agent-orchestrator on node 22', status: 'COMPLETED', conclusion: 'FAILURE', detailsUrl: CI_URL },
        { name: 'lint', status: 'COMPLETED', conclusion: 'SUCCESS', detailsUrl: CI_URL },
      ),
    },
    { when: 'run view', out: log },
  ]);
  const r = pr(at, 'wait', [], { WF_CI_POLL_SECONDS: '0', WF_STEP: 'implement' });
  assert.equal(r.code, 1, r.out);
  assert.match(r.err, /`ci` for #7 is failure, so this round is red where it is judged/);
  assert.ok(r.err.includes(`The Actions URL: ${CI_URL}`), r.err);
  assert.match(r.err, /the jobs that did not pass:/);
  assert.match(r.err, /test agent-orchestrator on node 22: FAILURE/);
  assert.ok(!r.err.includes('  lint: '), `a job that passed is not named:\n${r.err}`);
  assert.match(r.err, /gh run view 1234 --log-failed/);
  assert.match(r.err, /not ok 1 - a thing/);
  assert.ok(r.err.includes(RETRY), r.err);
  assert.deepEqual(asked(r.calls, 'run', 'view')[0].argv, ['run', 'view', '1234', '--log-failed']);

  for (const conclusion of ['CANCELLED', 'SKIPPED', 'TIMED_OUT']) {
    const other = placed();
    other.gh.answers([
      ...passing(other.repo).filter((rule) => rule.when !== 'pr view'),
      { when: 'pr view', out: rollup({ status: 'COMPLETED', conclusion }) },
    ]);
    const refused = pr(other, 'wait', [], { WF_CI_POLL_SECONDS: '0' });
    assert.equal(refused.code, 1, `${conclusion}: ${refused.out}`);
    assert.ok(refused.err.includes(conclusion.toLowerCase()), refused.err);
    assert.ok(refused.err.includes(RETRY), refused.err);
  }
});

test('the retry line a red ci prints names the step the check is of, which the branch no longer says: `WF_STEP`, or the fallback without it', () => {
  const red = (more: Record<string, string>) => {
    const at = placed();
    at.gh.answers([
      ...passing(at.repo).filter((rule) => rule.when !== 'pr view'),
      { when: 'pr view', out: rollup({ status: 'COMPLETED', conclusion: 'FAILURE' }) },
      { when: 'run view', out: 'boom' },
    ]);
    const r = pr(at, 'wait', [], { WF_CI_POLL_SECONDS: '0', ...more });
    assert.equal(r.code, 1, r.out);
    return r.err;
  };
  assert.ok(red({ WF_STEP: 'review' }).includes('nemia retry r-1 review --recheck'), "the check's own step, as the run set it");
  assert.ok(red({}).includes(RETRY), 'and the fallback with WF_STEP unset: `implement`, the pushing step of both build and quick');
  assert.ok(!red({}).includes('nemia retry r-1 run --recheck'), "never the branch's leaf, which names no step a person could retry");
});

test('REFUSED: no ci context within the bound, and a ci still pending at its end, each by the name of the context', () => {
  const at = placed();
  at.gh.answers([
    ...passing(at.repo).filter((rule) => rule.when !== 'pr view'),
    { when: 'pr view', out: JSON.stringify({ statusCheckRollup: [{ name: 'lint', status: 'COMPLETED', conclusion: 'SUCCESS' }] }) },
  ]);
  const absent = pr(at, 'wait', [], { WF_CI_WAIT_SECONDS: '0', WF_CI_POLL_SECONDS: '0' });
  assert.equal(absent.code, 1, absent.out);
  assert.match(absent.err, /no `ci` context was reported for #7 within 0 s/);
  assert.ok(absent.err.includes('https://github.com/o/r/pull/7/checks'), absent.err);
  assert.ok(absent.err.includes(RETRY), absent.err);

  const slow = placed();
  slow.gh.answers([
    ...passing(slow.repo).filter((rule) => rule.when !== 'pr view'),
    { when: 'pr view', out: rollup({ status: 'IN_PROGRESS' }) },
  ]);
  const unfinished = pr(slow, 'wait', [], { WF_CI_WAIT_SECONDS: '0', WF_CI_POLL_SECONDS: '0' });
  assert.equal(unfinished.code, 1, unfinished.out);
  assert.match(unfinished.err, /`ci` for #7 was still in_progress after 0 s/);
  assert.ok(unfinished.err.includes(CI_URL), unfinished.err);
  assert.ok(unfinished.err.includes(RETRY), unfinished.err);
});

test("build's implement check pushes through the script before the typecheck, waits on CI last, and runs no suite and no e2e itself", () => {
  const check = loadWorkflows(BUILD, placesOf(BUILD)).find((step) => step.name === 'implement')?.check;
  assert.equal(typeof check, 'string', 'workflows/build has an implement step with a check');
  const frozen = check as string;
  const clauses = [...frozen.matchAll(/node\s+"\$\w+\/([\w-]+\.ts)"\s+(check|push|wait)?/g)].map(([, script, verb]) =>
    verb ? `${script} ${verb}` : script,
  );
  assert.deepEqual(clauses, ['pictures.ts', 'probe.ts check', 'pull-request.ts push', 'mutants.ts', 'pull-request.ts wait']);
  assert.ok(
    frozen.indexOf('pull-request.ts" push') < frozen.indexOf('npm run typecheck'),
    `the push is before the typecheck, so CI's wall time overlaps the local gates:\n${frozen}`,
  );
  assert.doesNotMatch(frozen, /npm test/, "the suite is CI's now, on the pushed commit");
  assert.doesNotMatch(frozen, /npm run e2e/, 'and so is the whole e2e');
  for (const verb of ['push', 'wait']) {
    const clause = clauseOf(frozen, verb);
    assert.ok(
      clause.includes('git show "$WF_BASE_REF:workflows/build/pull-request.ts"'),
      `${verb} reads the script from the run's base, in its own clause:\n${clause}`,
    );
    assert.match(clause, /mktemp -d/, `${verb} reads it into a directory of its own:\n${clause}`);
  }
});

/**
 * The clause of the frozen check `frozen` that runs the pull-request script's `verb`: from the `{` that opens it to the `node … <verb>`
 * that ends it, so what the clause holds is read against that verb alone and not against another's.
 */
function clauseOf(frozen: string, verb: string): string {
  const ends = frozen.indexOf(`/pull-request.ts" ${verb}`);
  assert.ok(ends > 0, `the check runs the script's ${verb}:\n${frozen}`);
  const opens = frozen.lastIndexOf('{ if [ -n "${WF_BASE_REF:-}" ]', ends);
  assert.ok(opens >= 0, `the ${verb} clause opens on the base:\n${frozen}`);
  return frozen.slice(opens, ends);
}

test('the wait tells its two bounds apart: the start is its own, and what is left of the check deadline bounds the whole', () => {
  const at = placed();
  at.gh.answers([
    ...passing(at.repo).filter((rule) => rule.when !== 'pr view'),
    { when: 'pr view', out: JSON.stringify({ statusCheckRollup: [{ name: 'lint', status: 'COMPLETED', conclusion: 'SUCCESS' }] }) },
  ]);
  const absent = pr(at, 'wait', [], { WF_CI_START_SECONDS: '0', WF_CI_WAIT_SECONDS: '5', WF_CI_POLL_SECONDS: '0' });
  assert.equal(absent.code, 1, absent.out);
  assert.match(
    absent.err,
    /no `ci` context was reported for #7 within 0 s/,
    'a `ci` that was never reported is refused on the start bound, not on the whole',
  );

  const slow = placed();
  slow.gh.answers([
    ...passing(slow.repo).filter((rule) => rule.when !== 'pr view'),
    { when: 'pr view', outs: [JSON.stringify({ statusCheckRollup: [] }), rollup({ status: 'IN_PROGRESS' }), GREEN] },
  ]);
  const late = pr(slow, 'wait', [], { WF_CI_START_SECONDS: '600', WF_CI_WAIT_SECONDS: '600', WF_CI_POLL_SECONDS: '0' });
  assert.equal(late.code, 0, late.err);
  assert.equal(asked(late.calls, 'pr', 'view').length, 3, 'a `ci` that has not been reported yet is waited for, within the start bound');

  const started = placed();
  started.gh.answers([
    ...passing(started.repo).filter((rule) => rule.when !== 'pr view'),
    { when: 'pr view', out: rollup({ status: 'IN_PROGRESS' }) },
  ]);
  const unfinished = pr(started, 'wait', [], { WF_CI_START_SECONDS: '600', WF_CI_WAIT_SECONDS: '0', WF_CI_POLL_SECONDS: '0' });
  assert.equal(unfinished.code, 1, unfinished.out);
  assert.match(unfinished.err, /was still in_progress after 0 s/, 'a `ci` that started is bounded by the whole, not by the start');
});

/** The number the script's constant `name` holds, read from its shipped text; it must be there. */
function shippedSeconds(name: 'START_SECONDS' | 'WHOLE_SECONDS'): number {
  const found = new RegExp(`const\\s+${name}\\s*=\\s*(\\d+);`).exec(fs.readFileSync(SCRIPT, 'utf8'));
  assert.ok(found, `pull-request.ts declares ${name}`);
  return Number(found[1]);
}

test("the wait's two bounds are the numbers the README states, and both fit under a round check's own deadline", () => {
  const start = shippedSeconds('START_SECONDS');
  const whole = shippedSeconds('WHOLE_SECONDS');
  assert.ok(start < whole, `the start bound ${start} is within the whole ${whole}: the wait has two stages`);
  const readme = fs.readFileSync(path.join(BUILD, 'README.md'), 'utf8');
  assert.match(readme, new RegExp(`${start}\\s*s\\s+for\\s+it\\s+to\\s+start`), "build's README states the start bound");
  assert.match(readme, new RegExp(`${whole}\\s*s\\s+whole`), "build's README states the whole bound");
  assert.ok(
    CHECK_DEADLINE_SECONDS - whole >= 900,
    `the round check's deadline is ${CHECK_DEADLINE_SECONDS} s and the wait takes up to ${whole} s of it: the clauses before it — the ` +
      'pictures, the probe, the push, the typecheck, the lint and every mutant — have what is left, and 900 s is the least that is ' +
      'honest. Re-measure the deadline (src/check/check.ts) before you raise the wait.',
  );
});
