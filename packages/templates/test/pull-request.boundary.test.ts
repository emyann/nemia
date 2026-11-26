/**
 * sdlc's pull-request door (`sdlc/carried/pull-request.ts`, which `build` and `quick` both run): the one act that pushes a
 * run's branch and the check on the pull request CI judges. Driven as its owners drive it — `branch` by the engineer's session, `push` and
 * `declares-ci` by the round's checks — in a scratch repository whose `origin` is a bare repository, so a push is a real push
 * and a diverged tip a real rejection, with a stub `gh` first on the PATH that records each call and answers from a fixture
 * (`test/origin.ts`), each a bounded subprocess. No verb waits on CI: the watch is `ci-watch.boundary.test.ts`'s. Build's implement check
 * is read off sdlc as a factory gets it, rendered by `nemia factory apply` and the controller on a scratch store, on GitHub with its round
 * check and its CI context set as parameters, and each clause that runs the script is run as the run runs a check (`checkArgv`); at
 * sdlc's default, in the checkout, it is run whole, and pushes nothing.
 *
 * Its subject is git and a spawned script: a boundary file.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loadWorkflows } from 'agent-orchestrator';
import { checkArgv } from 'agent-orchestrator/run';
import { scratch } from 'test-kit/scratch';
import { copyOf, rendered } from './template.ts';
import { type Called, type Rule, bareOrigin, ghStub, gitIn, listed, passing, rollup, tip } from './origin.ts';

/** The template these scripts ship in. */
const SDLC = path.join(import.meta.dirname, '..', 'sdlc');

/** The carried folder, where the script and the helpers it shares with the landing are kept once. */
const CARRIED = path.join(SDLC, 'carried');

const SCRIPT = path.join(CARRIED, 'pull-request.ts');

/** sdlc as a factory gets it: the factory's rendered tree, and the scratch store it is in. */
type Rendered = { tree: string; store: string };

/** The steps of the rendered tree's `workflow`, read as a start of it in the factory reads them: with the factory's hires. */
/**
 * A step's checks as one shell line, each joined to the one before it by `&&`: the order the pass runs sdlc's chained checks in, each
 * filed only once the one above it passed, so the line refuses where the first refusing check would; the step's `check:` where it has one.
 */
const chainOf = (step: { check?: string; checks?: readonly { run?: string | undefined }[] } | undefined) =>
  step?.checks ? step.checks.flatMap((c) => c.run ?? []).join(' && ') : step?.check;

function stepsOf(at: Rendered, workflow: string) {
  const { hires } = JSON.parse(fs.readFileSync(path.join(at.tree, 'factory.json'), 'utf8')) as { hires: Record<string, string> };
  const agents = Object.fromEntries(
    Object.entries(hires).flatMap(([step, agent]) => (step.startsWith(`${workflow}/`) ? [[step.slice(workflow.length + 1), agent]] : [])),
  );
  return loadWorkflows(path.join(at.tree, 'workflows', workflow), { home: at.store }, { factory: 'sdlc', workflow, agents });
}

/**
 * sdlc rendered the three ways the implement checks and notes are read here, applied on one scratch store and rendered by one `nemia
 * up` (`rendered`), the first test that asks rendering them: on GitHub with a round check, a CI context and label rules of its own; on
 * GitHub with the label rules alone; and in the checkout with a stub's name for its local check.
 */
let rendering: Promise<Record<'round' | 'labelled' | 'local', Rendered>> | undefined;
const renders = () =>
  (rendering ??= (async () => {
    const all = await rendered([
      {
        name: 'round',
        template: copyOf(SDLC),
        sets: ['github=true', 'roundCheck=round-check --all', 'ciCheck=gate', `pullRequestLabels=${RULES}`],
      },
      { name: 'labelled', template: copyOf(SDLC), sets: ['github=true', `pullRequestLabels=${RULES}`] },
      { name: 'local', template: copyOf(SDLC), sets: ['localCheck=local-check'] },
    ]);
    const treeOf = (name: 'round' | 'labelled' | 'local') => {
      const at = all[name];
      assert.ok(at?.tree, `${name} was rendered: ${JSON.stringify(at?.conditions)}`);
      return { tree: at.tree, store: at.store };
    };
    return { round: treeOf('round'), labelled: treeOf('labelled'), local: treeOf('local') };
  })());

/**
 * What a refusal no change to the branch answers exits with: the code build's and quick's `implement` name in their
 * `checkFailurePolicy:` (`PERSONS_EXIT`, `sdlc/carried/exec.ts`), so the run files no try on it and waits on the person. A refusal the
 * work answers exits 1.
 */
const PERSONS = 78;

/** The line a person's refusal ended with before its exit said it: no refusal prints it now. */
const TAGGED = /not the work/;

/** A place to push from: a scratch repository on `branch`, its `origin` a bare repository, and a stub `gh` answering `rules`. */
function placed({ branch = 'wf/r-1/run', remote = true } = {}) {
  const repo = scratch('wf-pr-repo-');
  gitIn(repo, 'init', '-q', '-b', branch);
  fs.writeFileSync(path.join(repo, 'a.ts'), 'export const a = 1;\n');
  gitIn(repo, 'add', '-A');
  gitIn(repo, 'commit', '-qm', 'work');
  const bare = remote ? bareOrigin(repo) : undefined;
  return { repo, bare, branch, gh: ghStub(passing(repo)) };
}

/** Run the script's `verb` in `at` with `args`, bounded; its exit, its streams and the calls the stub `gh` was given. */
function pr(at: ReturnType<typeof placed>, verb: string, args: string[] = [], more: Record<string, string> = {}) {
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
const asked = (calls: readonly Called[], ...words: string[]) => calls.filter((call) => words.every((word, i) => call.argv[i] === word));

/** A file written and committed in `repo`: the commit it made. */
function commit(repo: string, name: string) {
  fs.writeFileSync(path.join(repo, name), `export const ${name.replace(/\W/g, '')} = 1;\n`);
  gitIn(repo, 'add', '-A');
  gitIn(repo, 'commit', '-qm', name);
  return gitIn(repo, 'rev-parse', 'HEAD').trim();
}

/** `origin` given the default branch `main` a clone would show, as `git ls-remote --symref origin HEAD` reads it. */
function withMain(at: ReturnType<typeof placed>) {
  gitIn(at.repo, 'push', '-q', 'origin', 'HEAD:refs/heads/main');
  return at;
}

test("branch pushes the run's branch, never forced, with no gh on the PATH, and prints the repository, head, base and commit the server's tools take", () => {
  const at = withMain(placed());
  const gitAlone = scratch('wf-pr-nogh-');
  fs.symlinkSync(execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim(), path.join(gitAlone, 'git'));
  const ran = spawnSync(process.execPath, [SCRIPT, 'branch'], {
    cwd: at.repo,
    env: { PATH: gitAlone, HOME: at.repo, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
    encoding: 'utf8',
    timeout: 60_000,
  });
  assert.equal(ran.status, 0, ran.stderr);
  assert.equal(tip(at.bare!, at.branch), gitIn(at.repo, 'rev-parse', 'HEAD').trim(), 'the branch is on origin at HEAD');
  const sha = gitIn(at.repo, 'rev-parse', 'HEAD').trim();
  for (const line of ['head wf/r-1/run', 'base main', `commit ${sha}`, 'repository '])
    assert.ok(ran.stdout.includes(`nemia pr: ${line}`), ran.stdout);
});

test("branch prints `owner/repo` of a GitHub-shaped origin address, as the server's tools take them", () => {
  const at = withMain(placed());
  const shaped = path.join(scratch('wf-origin-named-'), 'o', 'r.git');
  fs.mkdirSync(path.dirname(shaped), { recursive: true });
  fs.renameSync(at.bare!, shaped);
  gitIn(at.repo, 'remote', 'set-url', 'origin', shaped);
  const r = pr(at, 'branch');
  assert.equal(r.code, 0, r.err);
  assert.ok(r.out.includes('nemia pr: repository o/r\n'), r.out);
});

test('REFUSED: branch given an argument, on the remote default branch, or on no run branch, and a verb the script has not; nothing is pushed', () => {
  const at = withMain(placed());
  const given = pr(at, 'branch', ['--title', 'x']);
  assert.equal(given.code, 1);
  assert.ok(given.err.includes('pull-request.ts" branch'), given.err);
  assert.equal(tip(at.bare!, at.branch), null, 'nothing is pushed');
  const onBase = placed();
  gitIn(onBase.repo, 'push', '-q', 'origin', 'HEAD:refs/heads/wf/r-1/run');
  execFileSync('git', ['-C', onBase.bare!, 'symbolic-ref', 'HEAD', 'refs/heads/wf/r-1/run']);
  const base = pr(onBase, 'branch');
  assert.equal(base.code, 1);
  assert.ok(base.err.includes("HEAD is on `wf/r-1/run`, the remote's default branch"), base.err);
  const outside = placed({ branch: 'feature/x' });
  const off = pr(outside, 'branch');
  assert.equal(off.code, 1);
  assert.match(off.err, /not a run's `wf\/<run>\/<leaf>`/);
  assert.deepEqual(off.calls, [], 'no gh is called');
  const unknown = pr(at, 'merge');
  assert.equal(unknown.code, 1);
  assert.match(unknown.err, /`merge` is no verb: give branch, push, wait or declares-ci/);
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
  assert.ok(base.err.includes("HEAD is on `wf/r-1/run`, the remote's default branch"), base.err);
  assert.ok(base.err.includes('git switch wf/r-1/run'), base.err);
  assert.equal(tip(named.bare!, 'wf/r-1/run'), null, 'nothing is pushed');
});

test('REFUSED: no origin remote, no gh on the PATH, and a gh that is not authenticated, each naming what to type', () => {
  const none = placed({ remote: false });
  const r = pr(none, 'push');
  assert.equal(r.code, PERSONS, r.out);
  assert.match(r.err, /has no `origin` remote/);
  assert.match(r.err, /git remote -v/);
  assert.doesNotMatch(r.err, TAGGED, 'a person adds the remote');
  assert.deepEqual(r.calls, [], 'the remote is read before gh');

  const at = placed();
  at.gh.answers([{ when: 'auth status', status: 1, err: 'You are not logged into any GitHub hosts.' }, ...passing(at.repo)]);
  const unauthed = pr(at, 'push');
  assert.equal(unauthed.code, PERSONS, unauthed.out);
  assert.match(unauthed.err, /is not authenticated here: run `gh auth login`/);
  assert.doesNotMatch(unauthed.err, TAGGED, 'a person logs gh in');
  assert.equal(tip(at.bare!, at.branch), null, 'nothing is pushed');

  const gitAlone = scratch('wf-pr-nogh-');
  fs.symlinkSync(execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim(), path.join(gitAlone, 'git'));
  const missing = spawnSync(process.execPath, [SCRIPT, 'push'], {
    cwd: at.repo,
    env: { PATH: gitAlone, HOME: at.repo, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
    encoding: 'utf8',
    timeout: 60_000,
  });
  assert.equal(missing.status, PERSONS, 'a person installs gh');
  assert.match(missing.stderr, /no `gh` on the PATH/);
  assert.match(missing.stderr, /gh auth login/);
  assert.doesNotMatch(missing.stderr, TAGGED, 'the exit says whose it is, no line does');
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
  assert.notEqual(r.code, PERSONS, 'the merge that answers it is the work');
  assert.equal(tip(at.bare!, at.branch), theirs, "origin's tip is the one it had");
  assert.notEqual(mine, theirs);
});

test('REFUSED: a draft pull request, or one based on another branch than the remote default; a draft names gh pr ready', () => {
  const at = placed();
  const head = gitIn(at.repo, 'rev-parse', 'HEAD').trim();
  at.gh.answers([...passing(at.repo).filter((rule) => rule.when !== 'pr list'), { when: 'pr list', out: listed(head, { isDraft: true }) }]);
  const draft = pr(at, 'push');
  assert.equal(draft.code, PERSONS, draft.out);
  assert.match(draft.err, /#7 is a draft/);
  assert.match(draft.err, /gh pr ready 7/);
  assert.doesNotMatch(draft.err, TAGGED, 'a person marks it ready');
  assert.equal(asked(draft.calls, 'api').length, 0);

  const other = placed();
  const at2 = gitIn(other.repo, 'rev-parse', 'HEAD').trim();
  other.gh.answers([
    ...passing(other.repo).filter((rule) => rule.when !== 'pr list'),
    { when: 'pr list', out: listed(at2, { baseRefName: 'release' }) },
  ]);
  const based = pr(other, 'push');
  assert.equal(based.code, PERSONS, based.out);
  assert.ok(based.err.includes('#7 is based on `release`'), based.err);
  assert.ok(based.err.includes("the remote's default branch `main`"), based.err);
  assert.match(based.err, /gh pr edit 7 --base main/);
  assert.doesNotMatch(based.err, TAGGED, 'a person moves its base');
  assert.ok(based.err.includes('gh api -X PATCH repos/{owner}/{repo}/pulls/7 -f base=main'), based.err);
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
  assert.equal(r.code, PERSONS, r.out);
  assert.ok(r.err.includes('2 open pull requests have wf/r-1/run'), r.err);
  assert.ok(r.err.includes('(#7, #8)'), r.err);
  assert.match(r.err, /gh pr close <number>/);
  assert.doesNotMatch(r.err, TAGGED, 'a person closes one');
});

test("push pushes the hand-off commit and proves the pull request's head is the commit the check judges", () => {
  const at = placed();
  const handed = commit(at.repo, 'handed-off.ts');
  at.gh.answers(passing(at.repo));
  const r = pr(at, 'push');
  assert.equal(r.code, 0, r.err);
  assert.equal(tip(at.bare!, at.branch), handed, 'the hand-off commit is on origin');
  assert.match(r.out, new RegExp(`nemia pr: #7 is at ${handed.slice(0, 12)}, the commit this check judges`));
});

test("push reads the pull request's head again for a bounded few seconds, since GitHub moves it a moment after the push", () => {
  const at = placed();
  const was = gitIn(at.repo, 'rev-parse', 'HEAD').trim();
  const pushed = commit(at.repo, 'handed-off.ts');
  at.gh.answers([
    ...passing(at.repo).filter((rule) => rule.when !== 'pr list'),
    { when: 'pr list', outs: [listed(was), listed(was), listed(pushed)] },
  ]);
  const r = pr(at, 'push', [], { WF_PR_HEAD_SECONDS: '600', WF_PR_HEAD_POLL_SECONDS: '0' });
  assert.equal(r.code, 0, r.err);
  assert.equal(asked(r.calls, 'pr', 'list').length, 3, 'it read the head again until GitHub had caught up with the push');
  assert.match(r.out, new RegExp(`nemia pr: #7 is at ${pushed.slice(0, 12)}, the commit this check judges`));
  assert.equal(tip(at.bare!, at.branch), pushed, 'and the branch was pushed once, before the reads');
  assert.equal(r.calls.filter((call) => call.argv[0] === 'pr' && call.argv[1] === 'create').length, 0);
});

test('REFUSED: a pull request whose head is another commit, and none open at all; each names the branch line and the create through the server', () => {
  const at = placed();
  const was = gitIn(at.repo, 'rev-parse', 'HEAD').trim();
  at.gh.answers(passing(at.repo));
  const now = commit(at.repo, 'later.ts');
  const stale = pr(at, 'push', [], { WF_PR_HEAD_SECONDS: '0' });
  assert.equal(stale.code, 1, stale.out);
  assert.ok(stale.err.includes(`#7 has ${was.slice(0, 12)} as its head and this workspace is on ${now.slice(0, 12)}`), stale.err);
  assert.match(stale.err, /0 s after the push/, 'a head elsewhere for the bound is refused, saying how long');
  assert.ok(stale.err.includes('pull-request.ts" branch'), stale.err);
  assert.ok(stale.err.includes('create_pull_request'), stale.err);
  assert.notEqual(stale.code, PERSONS, 'the open through the server that answers it is the work');

  const none = placed();
  none.gh.answers([...passing(none.repo).filter((rule) => rule.when !== 'pr list'), { when: 'pr list', out: '[]' }]);
  const unopened = pr(none, 'push');
  assert.equal(unopened.code, 1, unopened.out);
  assert.ok(unopened.err.includes('no open pull request has wf/r-1/run as its head'), unopened.err);
  assert.ok(unopened.err.includes('pull-request.ts" branch'), unopened.err);
  assert.ok(unopened.err.includes('create_pull_request'), unopened.err);
  assert.notEqual(unopened.code, PERSONS, 'the open through the server that answers it is the work');
});

/** The rules a factory's `pullRequestLabels` gives `push --labels`, in the tests below: two values of one key, each its own label. */
const RULES = 'work=fix:fix work=cleanup:internal';

/** The repository's labels, as `gh api --paginate …/labels --jq .[].name` prints them: one name a line. */
const REPO_LABELS: Rule = { when: 'repos/{owner}/{repo}/labels', out: 'fix\ninternal\nbug' };

/**
 * A place whose one open pull request is at HEAD carrying `labels`, in a repository holding `repo` (`REPO_LABELS` by default): the
 * rules under which `push --labels` reads what it has to set.
 */
function labelled(labels: string[], repo: Rule = REPO_LABELS) {
  const at = placed();
  const head = gitIn(at.repo, 'rev-parse', 'HEAD').trim();
  at.gh.answers([
    repo,
    ...passing(at.repo).filter((rule) => rule.when !== 'pr list'),
    { when: 'pr list', out: listed(head, { labels: labels.map((name) => ({ name })) }) },
  ]);
  return at;
}

/** The calls that add or remove a label of the pull request, through REST. */
const labelCalls = (calls: readonly Called[]) => calls.filter((call) => call.argv.some((arg) => /\/issues\/\d+\/labels/.test(arg)));

test("push --labels adds the label the rules give the run's labels, through REST and never gh pr edit, and says what it set", () => {
  const at = labelled([]);
  const r = pr(at, 'push', ['--labels', RULES], { WF_LABELS: JSON.stringify({ work: 'cleanup', area: 'api' }) });
  assert.equal(r.code, 0, r.err);
  assert.equal(tip(at.bare!, at.branch), gitIn(at.repo, 'rev-parse', 'HEAD').trim(), 'the branch is pushed');
  assert.deepEqual(
    labelCalls(r.calls).map((call) => call.argv),
    [['api', '-X', 'POST', 'repos/{owner}/{repo}/issues/7/labels', '-f', 'labels[]=internal']],
  );
  assert.equal(asked(r.calls, 'pr', 'edit').length, 0, 'never `gh pr edit`, whose GraphQL query GitHub refuses');
  assert.ok(
    asked(r.calls, 'api').some(
      (call) => call.argv.includes('--paginate') && call.argv.some((arg) => arg.startsWith('repos/{owner}/{repo}/labels')),
    ),
    `the repository's labels are read every page:\n${JSON.stringify(r.calls)}`,
  );
  assert.match(r.out, /nemia pr: .*internal/);
});

test('push --labels follows a relabelled run: the label its rules no longer give goes, the one they give comes, a label no rule gives stays', () => {
  const at = labelled(['fix', 'bug']);
  const r = pr(at, 'push', ['--labels', RULES], { WF_LABELS: JSON.stringify({ work: 'cleanup' }) });
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(
    labelCalls(r.calls).map((call) => call.argv),
    [
      ['api', '-X', 'POST', 'repos/{owner}/{repo}/issues/7/labels', '-f', 'labels[]=internal'],
      ['api', '-X', 'DELETE', 'repos/{owner}/{repo}/issues/7/labels/fix'],
    ],
    '`bug`, which no rule can give, is left alone',
  );

  const already = labelled(['internal']);
  const settled = pr(already, 'push', ['--labels', RULES], { WF_LABELS: JSON.stringify({ work: 'cleanup' }) });
  assert.equal(settled.code, 0, settled.err);
  assert.deepEqual(labelCalls(settled.calls), [], 'a pull request that already carries what the rules give is not called again');
});

test('push with --labels "", with no --labels, or with no WF_LABELS from the run, makes no label call', () => {
  for (const [args, more] of [
    [['--labels', ''], { WF_LABELS: JSON.stringify({ work: 'fix' }) }],
    [[], { WF_LABELS: JSON.stringify({ work: 'fix' }) }],
    [['--labels', RULES], {}],
  ] as const) {
    const at = labelled(['fix']);
    const r = pr(at, 'push', [...args], more);
    assert.equal(r.code, 0, `${args.join(' ')}: ${r.err}`);
    assert.deepEqual(labelCalls(r.calls), [], `${args.join(' ')}: no label is added or removed`);
    assert.ok(
      !asked(r.calls, 'api').some((call) => call.argv.some((arg) => arg.includes('/labels'))),
      `${args.join(' ')}: nor are the repository's labels read`,
    );
    assert.match(r.out, /nemia pr: #7 is at/);
  }
});

test('REFUSED, before anything is pushed: a rule that is not <key>=<value>:<label>, and a --labels with no value', () => {
  for (const args of [
    ['--labels', 'work=fix'],
    ['--labels', 'work:fix'],
    ['--labels', `${RULES} =fix:fix`],
    ['--labels', 'work=:fix'],
    ['--labels', 'work=fix:'],
    ['--labels'],
    ['--label', RULES],
  ]) {
    const at = labelled([]);
    const r = pr(at, 'push', args, { WF_LABELS: JSON.stringify({ work: 'fix' }) });
    assert.equal(r.code, PERSONS, `${args.join(' ')}: ${r.out}`);
    assert.ok(r.err.startsWith('nemia pr: '), `a refusal of the script's, not a crash:\n${r.err}`);
    assert.match(r.err, /--labels/, 'naming the flag');
    assert.doesNotMatch(r.err, TAGGED, `${args.join(' ')}: the factory's rules are a person's`);
    assert.equal(tip(at.bare!, at.branch), null, `${args.join(' ')}: nothing is pushed`);
    assert.deepEqual(labelCalls(r.calls), []);
  }
});

test('REFUSED, before anything is pushed: a WF_LABELS that is not a JSON object of strings', () => {
  for (const said of ['work=fix', '[]', '"fix"', 'null', JSON.stringify({ work: 1 })]) {
    const at = labelled([]);
    const r = pr(at, 'push', ['--labels', RULES], { WF_LABELS: said });
    assert.equal(r.code, PERSONS, `${said}: ${r.out}`);
    assert.match(r.err, /WF_LABELS/, 'naming the variable');
    assert.doesNotMatch(r.err, TAGGED, `${said}: the run's labels as given are a person's`);
    assert.equal(tip(at.bare!, at.branch), null, `${said}: nothing is pushed`);
    assert.deepEqual(labelCalls(r.calls), []);
  }
});

test('REFUSED, before anything is pushed: a label the rules give that the repository lacks, naming it and the create that answers it', () => {
  const at = labelled([], { when: 'repos/{owner}/{repo}/labels', out: 'fix\nbug' });
  const r = pr(at, 'push', ['--labels', RULES], { WF_LABELS: JSON.stringify({ work: 'fix' }) });
  assert.equal(r.code, PERSONS, r.out);
  assert.match(r.err, /internal/, 'naming the label');
  assert.match(r.err, /gh label create/, 'and the command that makes it');
  assert.doesNotMatch(r.err, TAGGED, "the repository's labels are a person's");
  assert.equal(tip(at.bare!, at.branch), null, 'nothing is pushed');
  assert.deepEqual(labelCalls(r.calls), []);
});

test("REFUSED, a person's exit before anything is pushed: a run whose labels match none of the rules, naming the key, its values and the relabel", () => {
  for (const verb of ['push'] as const) {
    const at = labelled(['fix', 'bug']);
    const args = ['--labels', RULES];
    const r = pr(at, verb, args, { WF_LABELS: JSON.stringify({ work: 'chore', area: 'api' }) });
    assert.equal(r.code, PERSONS, `${verb}: ${r.out}`);
    assert.ok(r.err.startsWith('nemia pr: '), `${verb}: a refusal of the script's, not a crash:\n${r.err}`);
    for (const word of ['work', 'fix', 'cleanup', 'nemia label run']) assert.ok(r.err.includes(word), `${verb}: naming ${word}:\n${r.err}`);
    assert.doesNotMatch(r.err, TAGGED, `${verb}: a person labels the run`);
    assert.equal(tip(at.bare!, at.branch), null, `${verb}: nothing is pushed`);
    assert.deepEqual(labelCalls(r.calls), [], `${verb}: no label is added or removed`);
    assert.equal(asked(r.calls, 'pr', 'create').length + asked(r.calls, 'api', '-X', 'PATCH').length, 0, `${verb}: nothing is opened`);
  }
});

test('declares-ci passes where HEAD or the remote default branch declares a CI workflow, the base read only where HEAD declares none; REFUSED where neither does', () => {
  const withCi = (repo: string) => {
    fs.mkdirSync(path.join(repo, '.github', 'workflows'), { recursive: true });
    fs.writeFileSync(path.join(repo, '.github', 'workflows', 'ci.yml'), 'name: ci\n');
    gitIn(repo, 'add', '-A');
    gitIn(repo, 'commit', '-qm', 'ci');
  };
  const baseOf = (at: ReturnType<typeof placed>, ci: boolean) => {
    gitIn(at.repo, 'switch', '-q', '-c', 'main');
    if (ci) withCi(at.repo);
    else commit(at.repo, 'm.ts');
    gitIn(at.repo, 'push', '-q', 'origin', 'main');
    gitIn(at.repo, 'switch', '-q', at.branch);
  };

  const head = placed();
  withCi(head.repo);
  const own = pr(head, 'declares-ci');
  assert.equal(own.code, 0, own.err);
  assert.equal(head.gh.calls().length, 0, 'a head that declares CI asks nothing of the base');

  const removed = placed();
  baseOf(removed, true);
  const kept = pr(removed, 'declares-ci');
  assert.equal(kept.code, 0, kept.err);

  const none = placed();
  baseOf(none, false);
  const local = pr(none, 'declares-ci');
  assert.equal(local.code, 1, local.out);
});

test("build's implement check, rendered on GitHub, pushes through the script before the round check, labelling by the rules it was set, has CI judged by a condition, never by a check that waits, and runs no suite and no e2e itself", async () => {
  const at = (await renders()).round;
  const check = chainOf(stepsOf(at, 'build').find((step) => step.name === 'implement'));
  assert.equal(typeof check, 'string', "sdlc's build has an implement step with a check");
  const frozen = check as string;
  const clauses = [...frozen.matchAll(/node\s+"\$\{WF_CARRIED_FILES:\?[^}]*\}\/([\w-]+\.ts)"\s+(check|push|declares-ci)?/g)].map(
    ([, script, verb]) => (verb ? `${script} ${verb}` : script),
  );
  assert.deepEqual(clauses, ['probe.ts check', 'parts.ts check', 'pull-request.ts push', 'pull-request.ts declares-ci']);
  const planned = stepsOf(at, 'build')
    .find((step) => step.name === 'implement')
    ?.checks?.map((c) => [c.name, c.condition]);
  assert.deepEqual(planned?.at(-1), ['ci', 'ci'], "the round ends on the `ci` condition, which the factory's ci-watch program writes");
  const round = frozen.indexOf('{ round-check --all; }');
  assert.ok(round > 0, `the round check the factory set is a clause of its own:\n${frozen}`);
  assert.ok(
    frozen.indexOf('pull-request.ts" push') < round,
    `the push is before the round check, so CI's wall time overlaps the local gates:\n${frozen}`,
  );
  assert.doesNotMatch(frozen, /npm test/, "the suite is CI's now, on the pushed commit");
  assert.doesNotMatch(frozen, /npm run e2e/, 'and so is the whole e2e');
  assert.ok(clauseOf(frozen, 'push').endsWith(`pull-request.ts" push --labels "${RULES}"`), 'the push labels by the rules the factory set');
  for (const verb of ['push']) {
    const clause = clauseOf(frozen, verb);
    const at2 = placed();
    at2.gh.answers([
      REPO_LABELS,
      ...passing(at2.repo).filter((rule) => rule.when !== 'pr view'),
      {
        when: 'pr view',
        out: rollup({ status: 'COMPLETED', conclusion: 'FAILURE' }, { name: 'gate', status: 'COMPLETED', conclusion: 'SUCCESS' }),
      },
    ]);
    const run = (more: Record<string, string>) => {
      const [cmd, ...argv] = checkArgv(clause);
      const ran = spawnSync(cmd, argv, {
        cwd: at2.repo,
        env: {
          PATH: `${at2.gh.bin}${path.delimiter}${process.env.PATH ?? ''}`,
          HOME: at2.repo,
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_CONFIG_NOSYSTEM: '1',
          ...at2.gh.env(),
          ...more,
        },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 120_000,
      });
      return { code: ran.status, out: ran.stdout, err: ran.stderr };
    };
    const unset = run({});
    assert.notEqual(unset.code, 0, `${verb}, where the frozen carried files are not named, refuses rather than read the script elsewhere`);
    assert.match(unset.err, /WF_CARRIED_FILES/, 'naming the variable');
    assert.deepEqual(at2.gh.calls(), [], 'and runs no script');
    assert.equal(tip(at2.bare!, at2.branch), null, 'nothing is pushed');
    const ran = run({ WF_CARRIED_FILES: path.join(at.tree, 'workflows', 'carried'), WF_LABELS: JSON.stringify({ work: 'cleanup' }) });
    assert.equal(ran.code, 0, `${verb}, from the frozen carried files:\n${ran.err}`);
    assert.match(ran.out, /nemia pr: #7 is at [0-9a-f]{12}/);
    assert.deepEqual(
      labelCalls(at2.gh.calls()).map((call) => call.argv.at(-1)),
      ['labels[]=internal'],
      `the rendered push reads the rules whole, spaces and all:\n${ran.out}`,
    );
  }
});

test("build's and quick's implement notes, rendered on GitHub, type the branch line and open the pull request through the server", async () => {
  const at = (await renders()).labelled;
  for (const workflow of ['build', 'quick']) {
    const note = fs.readFileSync(path.join(at.tree, 'workflows', workflow, 'implement.md'), 'utf8');
    const line = note.split('\n').find((text) => text.includes('pull-request.ts" branch'));
    assert.ok(line, `${workflow}'s note types the branch line`);
    assert.ok(!/--title|pull-request\.ts" open/.test(note), `${workflow}: no open line is left in the note`);
    for (const tool of ['list_pull_requests', 'create_pull_request', 'update_pull_request'])
      assert.ok(note.includes(tool), `${workflow}: the note names ${tool}`);
    const place = withMain(placed());
    const [cmd, ...argv] = checkArgv(line.trim().replace(/^`|`$/g, ''));
    const ran = spawnSync(cmd, argv, {
      cwd: place.repo,
      env: {
        PATH: process.env.PATH ?? '',
        HOME: place.repo,
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
        WF_CARRIED_FILES: path.join(at.tree, 'workflows', 'carried'),
      },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120_000,
    });
    assert.equal(ran.status, 0, `${workflow}: ${ran.stderr}`);
    assert.equal(tip(place.bare!, place.branch), gitIn(place.repo, 'rev-parse', 'HEAD').trim(), `${workflow}: the line pushed the branch`);
  }
});

test("REFUSED at shipped defaults, in the checkout: build's implement check runs the probes, then the local check, pushes nothing and calls no gh", async () => {
  const at = (await renders()).local;
  const check = chainOf(stepsOf(at, 'build').find((step) => step.name === 'implement'));
  assert.equal(typeof check, 'string', "sdlc's build has an implement step with a check");
  const place = placed();
  fs.writeFileSync(path.join(place.gh.bin, 'claude'), '#!/bin/sh\necho "[]"\n', { mode: 0o755 });
  const run = (exit: number) => {
    fs.writeFileSync(path.join(place.gh.bin, 'local-check'), `#!/bin/sh\necho "local check ran"\nexit ${exit}\n`, { mode: 0o755 });
    const [cmd, ...argv] = checkArgv(check!);
    const ran = spawnSync(cmd, argv, {
      cwd: place.repo,
      env: {
        PATH: `${place.gh.bin}${path.delimiter}${process.env.PATH ?? ''}`,
        HOME: place.repo,
        TMPDIR: scratch('wf-pr-tmp-'),
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
        WF_RUN: 'r-1',
        WF_CARRIED_FILES: path.join(at.tree, 'workflows', 'carried'),
        ...place.gh.env(),
      },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120_000,
    });
    return { code: ran.status, out: ran.stdout, err: ran.stderr };
  };
  const passed = run(0);
  assert.equal(passed.code, 0, passed.out + passed.err);
  const probes = passed.out.search(/no live probe of run r-1/);
  assert.ok(probes >= 0 && probes < passed.out.indexOf('local check ran'), `the probes, then the local check:\n${passed.out}`);
  assert.deepEqual(place.gh.calls(), [], 'no gh');
  assert.equal(tip(place.bare!, place.branch), null, 'and nothing is pushed');
  const red = run(3);
  assert.notEqual(red.code, 0, red.out);
  assert.equal(tip(place.bare!, place.branch), null);
});

/**
 * The clause of the frozen check `frozen` that runs the pull-request script's `verb`: from the `node` that opens it to the ` && ` or the
 * `; else` or the `; fi` after it, so what the clause holds is read against that verb alone and not against another's.
 */
function clauseOf(frozen: string, verb: string) {
  const named = frozen.indexOf(`/pull-request.ts" ${verb}`);
  assert.ok(named > 0, `the check runs the script's ${verb}:\n${frozen}`);
  const opens = frozen.lastIndexOf('node "', named);
  assert.ok(opens >= 0, `the ${verb} clause opens on node:\n${frozen}`);
  const ends = [frozen.indexOf(' && ', named), frozen.indexOf('; else', named), frozen.indexOf('; fi', named)].filter((at) => at > named);
  assert.ok(ends.length > 0, `the ${verb} clause closes:\n${frozen}`);
  return frozen.slice(opens, Math.min(...ends));
}
