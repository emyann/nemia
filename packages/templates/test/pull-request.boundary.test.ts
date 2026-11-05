/**
 * sdlc's pull-request door (`sdlc/workflows/build/pull-request.ts`, which `quick/` carries byte for byte): the one act that pushes a
 * run's branch and opens the pull request CI judges. Driven as its three owners drive it — `open` by the engineer's session, `push` and
 * `wait --check <name>` by the round's check — in a scratch repository whose `origin` is a bare repository, so a push is a real push
 * and a diverged tip a real rejection, with a stub `gh` first on the PATH that records each call and answers from a fixture
 * (`test/origin.ts`), each a bounded subprocess. The CI context the wait reads is the one `--check` names, since that name is the
 * repository's a factory is applied to, never the script's.
 *
 * The wait's two bounds are told apart by `WF_CI_START_SECONDS` and `WF_CI_WAIT_SECONDS`, each read on its own, and the shipped numbers
 * are held against the words of `sdlc/workflows/build/README.md` and against a round check's own deadline. Build's implement check is
 * read off sdlc as a factory gets it, rendered by `nemia factory apply` and the controller on a scratch store, on GitHub with its round
 * check and its CI context set as parameters, and each clause that runs the script is run as the run runs a check (`checkArgv`); at
 * sdlc's default, in the checkout, it is run whole, and pushes nothing.
 *
 * Its subject is git and a spawned script: a boundary file.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loadWorkflows } from 'agent-orchestrator';
import { CHECK_DEADLINE_SECONDS, checkArgv } from 'agent-orchestrator/run';
import { scratch } from './scratch.ts';
import { renderedSdlc } from './template.ts';
import { CI_URL, GREEN, type Called, type Gh, type Rule, bareOrigin, ghStub, gitIn, listed, passing, rollup, tip } from './origin.ts';

/** The template these scripts ship in. */
const SDLC = path.join(import.meta.dirname, '..', 'sdlc');

const BUILD = path.join(SDLC, 'workflows', 'build');

const SCRIPT = path.join(BUILD, 'pull-request.ts');

/** The wait's flag, naming the CI context `origin.ts`'s rollups report. */
const CI = ['--check', 'ci'];

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

/**
 * The retry line a refusal of the wait must print: the run the branch names, and the step `WF_STEP` says — or, with it unset, the
 * constant fallback. The branch cannot say it: a run's line of work is `wf/<run>/run`, which names no step.
 */
const RETRY = 'nemia retry r-1 implement --recheck';

/**
 * The line a refusal no change to the branch answers ends with, so a try retried on its own stops for the person; a refusal the work
 * answers carries none.
 */
const PERSONS = /^nemia (pr|ci): not the work: /m;

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
  const r = pr(at, 'open', ['--title', "A run's change is a pull request", '--body-file', file, '--labels', '']);
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
  assert.equal(asked(r.calls, 'api').length, 0, 'the fields of a pull request it just created are not patched');
  assert.match(r.out, /nemia pr: https:\/\/github\.com\/o\/r\/pull\/7/);
});

test('open on a branch whose pull request is already open updates its title and body, and creates no second one', () => {
  const at = placed();
  const file = body('A second round.\n');
  const r = pr(at, 'open', ['--title', 'The same card', '--body-file', file, '--labels', '']);
  assert.equal(r.code, 0, r.err);
  assert.equal(asked(r.calls, 'pr', 'create').length, 0, 'never a second pull request');
  assert.equal(asked(r.calls, 'pr', 'edit').length, 0, 'never `gh pr edit`, whose GraphQL query GitHub refuses');
  assert.deepEqual(asked(r.calls, 'api')[0].argv, [
    'api',
    '-X',
    'PATCH',
    'repos/{owner}/{repo}/pulls/7',
    '-f',
    'title=The same card',
    '-F',
    `body=@${file}`,
  ]);
  assert.match(r.out, /nemia pr: https:\/\/github\.com\/o\/r\/pull\/7/);
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
  assert.ok(base.err.includes("HEAD is on `wf/r-1/run`, the remote's default branch"), base.err);
  assert.ok(base.err.includes('git switch wf/r-1/run'), base.err);
  assert.equal(tip(named.bare!, 'wf/r-1/run'), null, 'nothing is pushed');
});

test('REFUSED: no origin remote, no gh on the PATH, and a gh that is not authenticated, each naming what to type', () => {
  const none = placed({ remote: false });
  const r = pr(none, 'push');
  assert.equal(r.code, 1, r.out);
  assert.match(r.err, /has no `origin` remote/);
  assert.match(r.err, /git remote -v/);
  assert.match(r.err, PERSONS, 'a person adds the remote');
  assert.deepEqual(r.calls, [], 'the remote is read before gh');

  const at = placed();
  at.gh.answers([{ when: 'auth status', status: 1, err: 'You are not logged into any GitHub hosts.' }, ...passing(at.repo)]);
  const unauthed = pr(at, 'push');
  assert.equal(unauthed.code, 1, unauthed.out);
  assert.match(unauthed.err, /is not authenticated here: run `gh auth login`/);
  assert.match(unauthed.err, PERSONS, 'a person logs gh in');
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
  assert.match(missing.stderr, PERSONS, 'a person installs gh');
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
  assert.doesNotMatch(r.err, PERSONS, 'the merge that answers it is the work');
  assert.equal(tip(at.bare!, at.branch), theirs, "origin's tip is the one it had");
  assert.notEqual(mine, theirs);
});

test('REFUSED: a draft pull request, or one based on another branch than the remote default; a draft names gh pr ready', () => {
  const at = placed();
  const head = gitIn(at.repo, 'rev-parse', 'HEAD').trim();
  at.gh.answers([...passing(at.repo).filter((rule) => rule.when !== 'pr list'), { when: 'pr list', out: listed(head, { isDraft: true }) }]);
  const draft = pr(at, 'open', ['--title', 'x', '--body-file', body(), '--labels', '']);
  assert.equal(draft.code, 1, draft.out);
  assert.match(draft.err, /#7 is a draft/);
  assert.match(draft.err, /gh pr ready 7/);
  assert.match(draft.err, PERSONS, 'a person marks it ready');
  assert.equal(tip(at.bare!, at.branch), null, 'no push follows a draft');
  assert.equal(asked(draft.calls, 'api').length, 0);

  const other = placed();
  const at2 = gitIn(other.repo, 'rev-parse', 'HEAD').trim();
  other.gh.answers([
    ...passing(other.repo).filter((rule) => rule.when !== 'pr list'),
    { when: 'pr list', out: listed(at2, { baseRefName: 'release' }) },
  ]);
  const based = pr(other, 'open', ['--title', 'x', '--body-file', body(), '--labels', '']);
  assert.equal(based.code, 1, based.out);
  assert.ok(based.err.includes('#7 is based on `release`'), based.err);
  assert.ok(based.err.includes("the remote's default branch `main`"), based.err);
  assert.match(based.err, /gh pr edit 7 --base main/);
  assert.match(based.err, PERSONS, 'a person moves its base');
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
  assert.equal(r.code, 1, r.out);
  assert.ok(r.err.includes('2 open pull requests have wf/r-1/run'), r.err);
  assert.ok(r.err.includes('(#7, #8)'), r.err);
  assert.match(r.err, /gh pr close <number>/);
  assert.match(r.err, PERSONS, 'a person closes one');
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

test('REFUSED: a pull request whose head is another commit, and none open at all; each names the open line', () => {
  const at = placed();
  const was = gitIn(at.repo, 'rev-parse', 'HEAD').trim();
  at.gh.answers(passing(at.repo));
  const now = commit(at.repo, 'later.ts');
  const stale = pr(at, 'push', [], { WF_PR_HEAD_SECONDS: '0' });
  assert.equal(stale.code, 1, stale.out);
  assert.ok(stale.err.includes(`#7 has ${was.slice(0, 12)} as its head and this workspace is on ${now.slice(0, 12)}`), stale.err);
  assert.match(stale.err, /0 s after the push/, 'a head elsewhere for the bound is refused, saying how long');
  assert.ok(stale.err.includes('pull-request.ts" open --title'), stale.err);
  assert.ok(stale.err.includes('--body-file "$WF_STEP_FILES/pr-body.md"'), stale.err);
  assert.doesNotMatch(stale.err, PERSONS, 'the open that answers it is the work');

  const none = placed();
  none.gh.answers([...passing(none.repo).filter((rule) => rule.when !== 'pr list'), { when: 'pr list', out: '[]' }]);
  const unopened = pr(none, 'push');
  assert.equal(unopened.code, 1, unopened.out);
  assert.ok(unopened.err.includes('no open pull request has wf/r-1/run as its head'), unopened.err);
  assert.ok(unopened.err.includes('pull-request.ts" open --title'), unopened.err);
  assert.ok(unopened.err.includes('--body-file "$WF_STEP_FILES/pr-body.md"'), unopened.err);
  assert.doesNotMatch(unopened.err, PERSONS, 'the open that answers it is the work');
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
const labelCalls = (calls: readonly Called[]): Called[] =>
  calls.filter((call) => call.argv.some((arg) => /\/issues\/\d+\/labels/.test(arg)));

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
    assert.equal(r.code, 1, `${args.join(' ')}: ${r.out}`);
    assert.ok(r.err.startsWith('nemia pr: '), `a refusal of the script's, not a crash:\n${r.err}`);
    assert.match(r.err, /--labels/, 'naming the flag');
    assert.match(r.err, PERSONS, `${args.join(' ')}: the factory's rules are a person's`);
    assert.equal(tip(at.bare!, at.branch), null, `${args.join(' ')}: nothing is pushed`);
    assert.deepEqual(labelCalls(r.calls), []);
  }
});

test('REFUSED, before anything is pushed: a WF_LABELS that is not a JSON object of strings', () => {
  for (const said of ['work=fix', '[]', '"fix"', 'null', JSON.stringify({ work: 1 })]) {
    const at = labelled([]);
    const r = pr(at, 'push', ['--labels', RULES], { WF_LABELS: said });
    assert.equal(r.code, 1, `${said}: ${r.out}`);
    assert.match(r.err, /WF_LABELS/, 'naming the variable');
    assert.match(r.err, PERSONS, `${said}: the run's labels as given are a person's`);
    assert.equal(tip(at.bare!, at.branch), null, `${said}: nothing is pushed`);
    assert.deepEqual(labelCalls(r.calls), []);
  }
});

test('REFUSED, before anything is pushed: a label the rules give that the repository lacks, naming it and the create that answers it', () => {
  const at = labelled([], { when: 'repos/{owner}/{repo}/labels', out: 'fix\nbug' });
  const r = pr(at, 'push', ['--labels', RULES], { WF_LABELS: JSON.stringify({ work: 'fix' }) });
  assert.equal(r.code, 1, r.out);
  assert.match(r.err, /internal/, 'naming the label');
  assert.match(r.err, /gh label create/, 'and the command that makes it');
  assert.match(r.err, PERSONS, "the repository's labels are a person's");
  assert.equal(tip(at.bare!, at.branch), null, 'nothing is pushed');
  assert.deepEqual(labelCalls(r.calls), []);
});

test('REFUSED, exit 2 before anything is pushed: a run whose labels match none of the rules, naming the key, its values and the relabel', () => {
  for (const verb of ['push', 'open'] as const) {
    const at = labelled(['fix', 'bug']);
    const args = verb === 'push' ? ['--labels', RULES] : ['--title', 'The card', '--body-file', body(), '--labels', RULES];
    const r = pr(at, verb, args, { WF_LABELS: JSON.stringify({ work: 'chore', area: 'api' }) });
    assert.equal(r.code, 2, `${verb}: ${r.out}`);
    assert.ok(r.err.startsWith('nemia pr: '), `${verb}: a refusal of the script's, not a crash:\n${r.err}`);
    for (const word of ['work', 'fix', 'cleanup', 'nemia label run']) assert.ok(r.err.includes(word), `${verb}: naming ${word}:\n${r.err}`);
    assert.match(r.err, PERSONS, `${verb}: a person labels the run`);
    assert.equal(tip(at.bare!, at.branch), null, `${verb}: nothing is pushed`);
    assert.deepEqual(labelCalls(r.calls), [], `${verb}: no label is added or removed`);
    assert.equal(asked(r.calls, 'pr', 'create').length + asked(r.calls, 'api', '-X', 'PATCH').length, 0, `${verb}: nothing is opened`);
  }
});

/** A place with no open pull request yet, in a repository holding `REPO_LABELS`: the rules under which `open` creates one. */
function unopened() {
  const at = placed();
  at.gh.answers([REPO_LABELS, ...passing(at.repo).filter((rule) => rule.when !== 'pr list'), { when: 'pr list', out: '[]' }]);
  return at;
}

/** The arguments of `open`, its title and a body file, with `more` after them. */
const opening = (...more: string[]): string[] => ['--title', 'The card', '--body-file', body(), ...more];

test("open --labels creates the pull request, then labels it by the rules from the run's labels in the same call, through REST", () => {
  const at = unopened();
  const r = pr(at, 'open', opening('--labels', RULES), { WF_LABELS: JSON.stringify({ work: 'cleanup' }) });
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(
    labelCalls(r.calls).map((call) => call.argv),
    [['api', '-X', 'POST', 'repos/{owner}/{repo}/issues/7/labels', '-f', 'labels[]=internal']],
  );
  const created = r.calls.findIndex((call) => call.argv[0] === 'pr' && call.argv[1] === 'create');
  const labelling = r.calls.findIndex((call) => labelCalls([call]).length > 0);
  const known = r.calls.findIndex((call) => call.argv.some((arg) => arg.startsWith('repos/{owner}/{repo}/labels')));
  assert.ok(
    known >= 0 && known < created && created < labelling,
    `the repository's labels read first, the label set after the create:\n${JSON.stringify(r.calls)}`,
  );
  assert.ok(!r.calls.some((call) => call.argv.includes('--label')), 'never `gh pr create --label`, a second GraphQL mutation');
  assert.equal(asked(r.calls, 'pr', 'edit').length, 0);
  assert.match(r.out, /nemia pr: .*internal/);
  assert.match(r.out.trim().split('\n').at(-1) ?? '', /^nemia pr: https:\/\/github\.com\/o\/r\/pull\/7$/, 'the address is its last line');
});

test('open --labels on a pull request already open follows a relabelled run, as push does', () => {
  const at = labelled(['fix', 'bug']);
  const r = pr(at, 'open', opening('--labels', RULES), { WF_LABELS: JSON.stringify({ work: 'cleanup' }) });
  assert.equal(r.code, 0, r.err);
  assert.equal(asked(r.calls, 'pr', 'create').length, 0);
  assert.ok(asked(r.calls, 'api', '-X', 'PATCH').length === 1, 'its title and body are brought up to date');
  assert.deepEqual(
    labelCalls(r.calls).map((call) => call.argv),
    [
      ['api', '-X', 'POST', 'repos/{owner}/{repo}/issues/7/labels', '-f', 'labels[]=internal'],
      ['api', '-X', 'DELETE', 'repos/{owner}/{repo}/issues/7/labels/fix'],
    ],
    '`bug`, which no rule can give, is left alone',
  );
});

test('open with --labels "", or with rules and no WF_LABELS from an older daemon, opens the pull request with no label call', () => {
  for (const [args, more] of [
    [['--labels', ''], { WF_LABELS: JSON.stringify({ work: 'fix' }) }],
    [['--labels', RULES], {}],
  ] as const) {
    const at = unopened();
    const r = pr(at, 'open', opening(...args), more);
    assert.equal(r.code, 0, `${args.join(' ')}: ${r.err}`);
    assert.equal(asked(r.calls, 'pr', 'create').length, 1);
    assert.deepEqual(labelCalls(r.calls), [], `${args.join(' ')}: no label is set`);
    assert.equal(/WF_LABELS/.test(r.out), 'WF_LABELS' in more ? false : true, `${args.join(' ')}: a missing WF_LABELS is said:\n${r.out}`);
  }
});

test('REFUSED, before anything is pushed or created: open with no --labels, a malformed rule, a WF_LABELS that is no object, a label the repository lacks', () => {
  const cases: [string[], Record<string, string>, Rule | undefined][] = [
    [opening(), { WF_LABELS: JSON.stringify({ work: 'fix' }) }, undefined],
    [opening('--labels', 'work=fix'), { WF_LABELS: JSON.stringify({ work: 'fix' }) }, undefined],
    [opening('--labels', RULES), { WF_LABELS: '[]' }, undefined],
    [opening('--labels', RULES), { WF_LABELS: JSON.stringify({ work: 'fix' }) }, { when: 'repos/{owner}/{repo}/labels', out: 'fix\nbug' }],
  ];
  for (const [args, more, repo] of cases) {
    const at = unopened();
    if (repo) at.gh.answers([repo, ...passing(at.repo).filter((rule) => rule.when !== 'pr list'), { when: 'pr list', out: '[]' }]);
    const r = pr(at, 'open', args, more);
    assert.equal(r.code, 1, `${args.slice(4).join(' ')}: ${r.out}`);
    assert.ok(r.err.startsWith('nemia pr: '), `a refusal of the script's, not a crash:\n${r.err}`);
    assert.equal(tip(at.bare!, at.branch), null, `${args.slice(4).join(' ')}: nothing is pushed`);
    assert.equal(asked(r.calls, 'pr', 'create').length, 0, 'nothing is created');
  }
  const bare = pr(unopened(), 'open', opening());
  assert.match(bare.err, /--labels/, 'a missing flag is named');
});

test('wait reads mergeable again while GitHub computes it, polls the ci context until it has a verdict, and passes on a green one; REFUSED at once: a conflicting head', () => {
  const at = placed();
  const head = gitIn(at.repo, 'rev-parse', 'HEAD').trim();
  const computing = (then: string): Rule => ({
    when: 'pr list',
    outs: [listed(head, { mergeable: 'UNKNOWN' }), listed(head, { mergeable: then })],
  });
  const pending: Rule = { when: 'pr view', outs: [rollup({ status: 'QUEUED' }), rollup({ status: 'IN_PROGRESS' }), GREEN] };
  const others = passing(at.repo).filter((rule) => rule.when !== 'pr view' && rule.when !== 'pr list');
  const quick = { WF_CI_POLL_SECONDS: '0', WF_PR_MERGEABLE_POLL_SECONDS: '0' };
  at.gh.answers([...others, computing('MERGEABLE'), pending]);
  const r = pr(at, 'wait', CI, quick);
  assert.equal(r.code, 0, r.err);
  assert.equal(asked(r.calls, 'pr', 'list').length, 2, 'an UNKNOWN mergeable is read again until GitHub has computed it');
  assert.equal(asked(r.calls, 'pr', 'view').length, 3, 'it polled until the verdict');
  assert.match(r.out, /nemia ci: `ci` passed on/);
  assert.equal(compared(r.calls).length, 0, "a green head's wait never reads the base's ci");
  assert.equal(tip(at.bare!, at.branch), null, 'the wait pushes nothing');

  const torn = placed();
  torn.gh.answers([...others, computing('CONFLICTING'), pending]);
  const conflicting = pr(torn, 'wait', CI, { ...quick, WF_CI_START_SECONDS: '600', WF_CI_WAIT_SECONDS: '600' });
  assert.equal(conflicting.code, 1, conflicting.out);
  assert.equal(asked(conflicting.calls, 'pr', 'view').length, 0, 'no ci is waited for on a head that conflicts with its base');
  assert.ok(conflicting.err.includes('git merge main-worktree/HEAD'), `it names the merge of the base:\n${conflicting.err}`);
  assert.ok(conflicting.err.includes('pull-request.ts" open --title'), `and the push of the round again:\n${conflicting.err}`);
  assert.doesNotMatch(conflicting.err, PERSONS, 'the merge of the base that answers it is the work');
});

/** `lines` as a job's log GitHub serves: each line stamped with the time it was printed. */
const stamped = (lines: string[]): string => lines.map((line) => `2026-10-24T09:00:00.0000000Z ${line}`).join('\n');

test('REFUSED: a red ci, with the Actions URL, the failing jobs, the lines that failed each job, and the retry line', () => {
  const at = placed();
  const TESTS_URL = CI_URL.replace('/job/5678', '/job/9012');
  const CHECKS_URL = CI_URL.replace('/job/5678', '/job/3456');
  const cleanup = [
    'Post job cleanup.',
    '[command]/usr/bin/git version',
    "Temporarily overriding HOME='<runner>/_temp/x' before making global git config changes",
    'Cleaning up orphan processes',
  ];
  const pastSpawnBuffer = `[w1] visiting page ${'x'.repeat(1024 * 1024)}`;
  const LATE = "src/late.ts(9,1): error TS2304: Cannot find name 'late'.";
  const checks = stamped([
    "web:typecheck: src/a.ts(3,7): error TS2322: Type 'string' is not assignable to type 'number'.",
    "  x eslint(no-unused-vars): Variable 'b' is declared but never used.",
    '   ,-[src/b.ts:1:7]',
    ' 1 | const b = 1;',
    ...Array.from({ length: 40 }, (_, i) => `[w1] visiting page ${i}`),
    pastSpawnBuffer,
    `web:typecheck: ${LATE}`,
    LATE,
    'Process completed with exit code 1.',
    ...cleanup,
  ]);
  const tests = stamped([
    ...Array.from({ length: 50 }, (_, i) => `agent-orchestrator:test: ✔ a passing test ${i} (1ms)`),
    'agent-orchestrator:test: ✖ the export is pinned (2ms)',
    'agent-orchestrator:test: ✔ a later pass (1ms)',
    'agent-orchestrator:test: ℹ fail 1',
    'agent-orchestrator:test: ✖ failing tests:',
    'agent-orchestrator:test: test at test/a.test.ts:3:1',
    'agent-orchestrator:test: ✖ the export is pinned (2ms)',
    'agent-orchestrator:test:   AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:',
    'agent-orchestrator:test:   + actual - expected',
    "agent-orchestrator:test:   + 'pinned'",
    "agent-orchestrator:test:   - 'moved'",
    'agent-orchestrator:test:       at TestContext.<anonymous> (file:///a.test.ts:3:33)',
  ]);
  const gathered = stamped(['Every job succeeded', 'test: failure', 'Process completed with exit code 1.', ...cleanup]);
  at.gh.answers([
    ...passing(at.repo).filter((rule) => rule.when !== 'pr view'),
    {
      when: 'pr view',
      out: rollup(
        { status: 'COMPLETED', conclusion: 'FAILURE' },
        { name: 'test agent-orchestrator on node 22', status: 'COMPLETED', conclusion: 'FAILURE', detailsUrl: TESTS_URL },
        { name: 'lint', status: 'COMPLETED', conclusion: 'SUCCESS', detailsUrl: CI_URL },
        { name: 'e2e and types', status: 'COMPLETED', conclusion: 'FAILURE', detailsUrl: CHECKS_URL },
      ),
    },
    { when: 'actions/jobs/9012/logs', out: tests },
    { when: 'actions/jobs/3456/logs', out: checks },
    { when: 'actions/jobs/5678/logs', out: gathered },
  ]);
  const r = pr(at, 'wait', CI, { WF_CI_POLL_SECONDS: '0', WF_STEP: 'implement' });
  assert.equal(r.code, 1, r.out);
  assert.ok(r.err.includes('`ci` for #7 is failure'), r.err);
  assert.ok(r.err.includes(`The Actions URL: ${CI_URL}`), r.err);
  assert.match(r.err, /the jobs that did not pass:/);
  assert.match(r.err, /test agent-orchestrator on node 22: FAILURE/);
  assert.ok(!r.err.includes('  lint: '), `a job that passed is not named:\n${r.err}`);
  assert.match(r.err, /test agent-orchestrator on node 22 \(job 9012\)/, "the job's lines are headed by its name");
  for (const told of ['✖ the export is pinned', 'AssertionError [ERR_ASSERTION]', '+ actual - expected', "+ 'pinned'", "- 'moved'"])
    assert.ok(r.err.includes(told), `the failure and its diff: ${told}\n${r.err}`);
  assert.ok(!r.err.includes('✔'), `no pass is handed on:\n${r.err}`);
  assert.ok(!r.err.includes('2026-10-24T09'), `GitHub's stamps are stripped:\n${r.err}`);
  assert.equal(r.err.split('✖ the export is pinned').length - 1, 1, 'a failure repeated in the summary is told once');
  assert.match(r.err, /Process completed with exit code 1\./, 'a job that names no failing test gives its tail');
  for (const told of ['error TS2322', 'x eslint(no-unused-vars)', ',-[src/b.ts:1:7]'])
    assert.ok(r.err.includes(told), `a type or lint error, with its place: ${told}\n${r.err}`);
  assert.equal(r.err.split(LATE).length - 1, 1, 'one failing line past 1 MiB, told once');
  assert.ok(!r.err.includes('visiting page'), `a job with a failing line gives no tail:\n${r.err}`);
  for (const noise of ['Post job cleanup', '[command]/usr/bin/git', 'Temporarily overriding HOME', 'Cleaning up orphan processes'])
    assert.ok(!r.err.includes(noise), `GitHub's post-job lines are no reason: ${noise}\n${r.err}`);
  assert.ok(r.err.includes(RETRY), r.err);
  assert.deepEqual(
    asked(r.calls, 'api')
      .filter((call) => call.argv.some((arg) => arg.includes('/actions/jobs/')))
      .map((call) => call.argv),
    [
      ['api', 'repos/{owner}/{repo}/actions/jobs/9012/logs'],
      ['api', 'repos/{owner}/{repo}/actions/jobs/3456/logs'],
      ['api', 'repos/{owner}/{repo}/actions/jobs/5678/logs'],
    ],
    'each failing job is read by its id, the gathering `ci` last',
  );

  for (const conclusion of ['CANCELLED', 'SKIPPED', 'TIMED_OUT']) {
    const other = placed();
    other.gh.answers([
      ...passing(other.repo).filter((rule) => rule.when !== 'pr view'),
      { when: 'pr view', out: rollup({ status: 'COMPLETED', conclusion }) },
    ]);
    const refused = pr(other, 'wait', CI, { WF_CI_POLL_SECONDS: '0' });
    assert.equal(refused.code, 1, `${conclusion}: ${refused.out}`);
    assert.ok(refused.err.includes(conclusion.toLowerCase()), refused.err);
    assert.ok(refused.err.includes(RETRY), refused.err);
  }
});

/** The calls of the stub `gh` that ask GitHub how a head stands to the base (`compare/<base>...<head>`). */
const compared = (calls: readonly Called[]): Called[] =>
  asked(calls, 'api').filter((call) => call.argv.some((arg) => arg.includes('/compare/')));

/** The commit the base held when the head was cut, as `compare` answers it. */
const BASE_AT = 'b'.repeat(40);

/** The URL of a job that failed on the base, which the refusal names. */
const BASE_JOB_URL = 'https://github.com/o/r/actions/runs/77/job/88';

/**
 * A red `ci` on the head, and the base's answers at the commit the head holds: `compare` naming it, its check runs as REST gives them
 * (lower-case) and its status contexts, each overridable.
 */
function redOnBase(base: { compare?: Rule; runs?: Record<string, unknown>[]; statuses?: Record<string, unknown>[] }) {
  const at = placed();
  const head = gitIn(at.repo, 'rev-parse', 'HEAD').trim();
  at.gh.answers([
    ...passing(at.repo).filter((rule) => rule.when !== 'pr view'),
    { when: 'pr view', out: rollup({ status: 'COMPLETED', conclusion: 'FAILURE' }) },
    { when: 'actions/jobs', out: 'boom' },
    base.compare ?? {
      when: `compare/main...${head}`,
      out: JSON.stringify({ status: 'ahead', merge_base_commit: { sha: BASE_AT } }),
    },
    { when: `commits/${BASE_AT}/check-runs`, out: JSON.stringify({ total_count: 0, check_runs: base.runs ?? [] }) },
    { when: `commits/${BASE_AT}/status`, out: JSON.stringify({ state: 'pending', statuses: base.statuses ?? [] }) },
  ]);
  return pr(at, 'wait', CI, { WF_CI_POLL_SECONDS: '0' });
}

/** A check run at the base, as REST gives one: lower-case, its URL `html_url`. */
const baseRun = (name: string, conclusion: string | null, url = BASE_JOB_URL) => ({
  name,
  status: conclusion === null ? 'in_progress' : 'completed',
  conclusion,
  html_url: url,
  started_at: '2026-11-04T09:00:00Z',
});

test("a red ci whose base is red too at the commit the head holds says so, naming the base's failing jobs; the refusal stays the work's", () => {
  const r = redOnBase({ runs: [baseRun('ci', 'failure', CI_URL), baseRun('test web', 'failure'), baseRun('lint', 'success')] });
  assert.equal(r.code, 1, r.out);
  assert.ok(r.err.includes('`ci` for #7 is failure'), `the head's refusal is as it was:\n${r.err}`);
  assert.ok(r.err.includes('`main`'), `the base is named:\n${r.err}`);
  assert.ok(r.err.includes(BASE_AT.slice(0, 12)), `at the commit the head holds:\n${r.err}`);
  assert.ok(r.err.includes(`test web: FAILURE ${BASE_JOB_URL}`), `the base's failing job, with its URL:\n${r.err}`);
  assert.ok(!r.err.includes('lint: '), `a job that passed on the base is not named:\n${r.err}`);
  assert.ok(r.err.includes('git merge main-worktree/HEAD'), `the merge of a moved base is named:\n${r.err}`);
  assert.ok(r.err.includes(RETRY), r.err);
  assert.doesNotMatch(r.err, PERSONS, "the base's red is a hint: the refusal stays the try's");

  const byStatus = redOnBase({ statuses: [{ context: 'ci', state: 'failure', target_url: BASE_JOB_URL }] });
  assert.ok(byStatus.err.includes(BASE_AT.slice(0, 12)), `a status context of the base's is read too:\n${byStatus.err}`);
});

test('a red ci on a base that is green, pending, unread or not answered adds no line about the base; the refusal is as it was', () => {
  const head = (r: ReturnType<typeof pr>) => {
    assert.equal(r.code, 1, r.out);
    assert.ok(r.err.includes('`ci` for #7 is failure'), r.err);
    assert.ok(r.err.includes(RETRY), r.err);
    assert.doesNotMatch(r.err, PERSONS, 'still the work');
    assert.ok(!r.err.includes(BASE_AT.slice(0, 12)), `no line about the base:\n${r.err}`);
    assert.ok(!r.err.includes('`main`'), `no line about the base:\n${r.err}`);
    return r;
  };
  head(redOnBase({ runs: [baseRun('ci', 'success', CI_URL), baseRun('test web', 'failure')] }));
  head(redOnBase({ runs: [baseRun('ci', null, CI_URL)] }));
  head(redOnBase({ runs: [] }));
  const unread = head(redOnBase({ compare: { when: '/compare/', status: 1, err: 'HTTP 404: Not Found' } }));
  assert.equal(compared(unread.calls).length, 1, 'the base is asked once');
  head(redOnBase({ compare: { when: '/compare/', out: 'not json' } }));
});

/** Two start times of one check, the first before the second, and the start gh exports for a run still queued (Go's zero time). */
const T1 = '2026-11-04T10:00:00Z';
const T2 = '2026-11-04T10:00:11Z';
const QUEUED_AT = '0001-01-01T00:00:00Z';

/** A run of the workflow `release-label` on the head, started at `startedAt`, that ended in `conclusion`. */
const labelRun = (conclusion: string, startedAt: string) => ({
  name: 'release-label',
  workflowName: 'release-label',
  status: 'COMPLETED',
  conclusion,
  startedAt,
});

/** The wait in a place whose rollup reads `outs`, one per poll, the last repeating; quick bounds. */
function waitOn(outs: string[]) {
  const at = placed();
  at.gh.answers([...passing(at.repo).filter((rule) => rule.when !== 'pr view'), { when: 'pr view', outs }]);
  return pr(at, 'wait', CI, { WF_CI_WAIT_SECONDS: '60', WF_CI_START_SECONDS: '60', WF_CI_POLL_SECONDS: '0' });
}

test('wait judges and lists only the latest run of each check on the head: a superseded failure is never reported as one', () => {
  const red = { status: 'COMPLETED', conclusion: 'FAILURE', workflowName: 'ci', startedAt: T2 };
  const superseded = waitOn([rollup(red, labelRun('FAILURE', T1), labelRun('SUCCESS', T2))]);
  assert.equal(superseded.code, 1, superseded.out);
  assert.ok(!superseded.err.includes('release-label'), `the failure its later run passed is not listed:\n${superseded.err}`);
  const latest = waitOn([rollup(red, labelRun('SUCCESS', T1), labelRun('FAILURE', T2))]);
  assert.ok(latest.err.includes('release-label: FAILURE'), `the latest run's failure is:\n${latest.err}`);
  const green = waitOn([rollup({ status: 'COMPLETED', conclusion: 'SUCCESS' }, labelRun('FAILURE', T1), labelRun('SUCCESS', T2))]);
  assert.equal(green.code, 0, green.err);
});

test('wait judges the latest run of the CI context itself: a re-run still queued beside its stale failure is waited on', () => {
  const ci = (conclusion: string, startedAt: string, workflowName = 'ci') => ({
    name: 'ci',
    detailsUrl: CI_URL,
    workflowName,
    status: 'COMPLETED',
    conclusion,
    startedAt,
  });
  const queued = { name: 'ci', workflowName: 'ci', status: 'QUEUED', startedAt: QUEUED_AT };
  const rerun = waitOn([
    JSON.stringify({ statusCheckRollup: [ci('FAILURE', T1), queued] }),
    JSON.stringify({ statusCheckRollup: [ci('FAILURE', T1), ci('SUCCESS', T2)] }),
  ]);
  assert.equal(rerun.code, 0, `the queued re-run is the latest, and its pass is the verdict:\n${rerun.err}`);
  const relapsed = waitOn([JSON.stringify({ statusCheckRollup: [ci('SUCCESS', T1), ci('FAILURE', T2)] })]);
  assert.equal(relapsed.code, 1, 'a pass a later run failed is no pass');
  const two = waitOn([JSON.stringify({ statusCheckRollup: [ci('SUCCESS', T2, 'ci'), ci('FAILURE', T1, 'other')] })]);
  assert.equal(two.code, 1, 'a `ci` of another workflow is a check of its own, judged too');
});

test('wait reads the CI context --check names and no other: a green `ci` is no verdict for `--check gate`, a green `gate` is', () => {
  const quick = { WF_CI_WAIT_SECONDS: '0', WF_CI_POLL_SECONDS: '0' };
  const ciAlone = placed();
  const refused = pr(ciAlone, 'wait', ['--check', 'gate'], quick);
  assert.equal(refused.code, 1, refused.out);
  assert.match(refused.err, /no `gate` context was reported for #7/);

  const gated = placed();
  gated.gh.answers([
    ...passing(gated.repo).filter((rule) => rule.when !== 'pr view'),
    {
      when: 'pr view',
      out: rollup({ status: 'COMPLETED', conclusion: 'FAILURE' }, { name: 'gate', status: 'COMPLETED', conclusion: 'SUCCESS' }),
    },
  ]);
  const passed = pr(gated, 'wait', ['--check', 'gate'], quick);
  assert.equal(passed.code, 0, `a red \`ci\` beside a green \`gate\` is not what --check gate reads:\n${passed.err}`);
  assert.match(passed.out, /nemia ci: `gate` passed on/);
});

test('REFUSED: a wait with no --check, a --check with no name, or more after it, before anything calls gh', () => {
  const at = placed();
  for (const given of [[], ['--check'], ['--check', '--x'], ['--check', 'ci', 'more']]) {
    const r = pr(at, 'wait', given, { WF_CI_WAIT_SECONDS: '0', WF_CI_POLL_SECONDS: '0' });
    assert.equal(r.code, 1, `${given.join(' ')}: ${r.out}`);
    assert.ok(r.err.startsWith('nemia ci: '), `a refusal of the script's, not a crash:\n${r.err}`);
    assert.match(r.err, /--check/, 'naming the flag');
    assert.match(r.err, PERSONS, `${given.join(' ')}: the check line is the factory's`);
    assert.deepEqual(r.calls, [], 'gh is not called at all');
  }
});

test('the retry line a red ci prints names the step the check is of, which the branch no longer says: `WF_STEP`, or the fallback without it', () => {
  const red = (more: Record<string, string>) => {
    const at = placed();
    at.gh.answers([
      ...passing(at.repo).filter((rule) => rule.when !== 'pr view'),
      { when: 'pr view', out: rollup({ status: 'COMPLETED', conclusion: 'FAILURE' }) },
      { when: 'actions/jobs', out: 'boom' },
    ]);
    const r = pr(at, 'wait', CI, { WF_CI_POLL_SECONDS: '0', ...more });
    assert.equal(r.code, 1, r.out);
    return r.err;
  };
  assert.ok(red({ WF_STEP: 'review' }).includes('nemia retry r-1 review --recheck'), "the check's own step, as the run set it");
  assert.ok(red({}).includes(RETRY), 'and the fallback with WF_STEP unset: `implement`, the pushing step of both build and quick');
  assert.ok(!red({}).includes('nemia retry r-1 run --recheck'), "never the branch's leaf, which names no step a person could retry");
});

test("a ci that failed is the work's to answer; one only cancelled, skipped or neutral judged nothing, and is a person's", () => {
  const judged = (...conclusions: string[]) => {
    const at = placed();
    const [first = 'SUCCESS', ...rest] = conclusions;
    const others = rest.map((conclusion, i) => ({ name: 'ci', workflowName: `w${i}`, status: 'COMPLETED', conclusion }));
    at.gh.answers([
      ...passing(at.repo).filter((rule) => rule.when !== 'pr view'),
      { when: 'pr view', out: rollup({ status: 'COMPLETED', conclusion: first }, ...others) },
      { when: 'actions/jobs', out: 'boom' },
    ]);
    const r = pr(at, 'wait', CI, { WF_CI_POLL_SECONDS: '0' });
    assert.equal(r.code, 1, r.out);
    return r.err;
  };
  assert.doesNotMatch(judged('FAILURE'), PERSONS, 'a red ci is the work');
  assert.doesNotMatch(judged('CANCELLED', 'FAILURE'), PERSONS, 'a failure beside a cancelled job is the work still');
  assert.match(judged('CANCELLED'), PERSONS, 'a cancelled ci judged nothing');
  assert.match(judged('SKIPPED', 'NEUTRAL'), PERSONS, 'nor did a skipped or neutral one');
});

test('REFUSED: no ci context within the bound, and a ci still pending at its end, each by the name of the context', () => {
  const at = placed();
  at.gh.answers([
    ...passing(at.repo).filter((rule) => rule.when !== 'pr view'),
    { when: 'pr view', out: JSON.stringify({ statusCheckRollup: [{ name: 'lint', status: 'COMPLETED', conclusion: 'SUCCESS' }] }) },
  ]);
  const absent = pr(at, 'wait', CI, { WF_CI_WAIT_SECONDS: '0', WF_CI_POLL_SECONDS: '0' });
  assert.equal(absent.code, 1, absent.out);
  assert.match(absent.err, /no `ci` context was reported for #7 within 0 s/);
  assert.ok(absent.err.includes('https://github.com/o/r/pull/7/checks'), absent.err);
  assert.ok(absent.err.includes(RETRY), absent.err);
  assert.match(absent.err, PERSONS, 'CI that never came judged nothing');

  const slow = placed();
  slow.gh.answers([
    ...passing(slow.repo).filter((rule) => rule.when !== 'pr view'),
    { when: 'pr view', out: rollup({ status: 'IN_PROGRESS' }) },
  ]);
  const unfinished = pr(slow, 'wait', CI, { WF_CI_WAIT_SECONDS: '0', WF_CI_POLL_SECONDS: '0' });
  assert.equal(unfinished.code, 1, unfinished.out);
  assert.match(unfinished.err, /`ci` for #7 was still in_progress after 0 s/);
  assert.ok(unfinished.err.includes(CI_URL), unfinished.err);
  assert.ok(unfinished.err.includes(RETRY), unfinished.err);
  assert.match(unfinished.err, PERSONS, 'CI still running at the bound judged nothing');
});

test("wait reads a GitHub read that fails as not yet read: once, then answering, passes; failing to the bound, it names the last error, a person's", () => {
  const timedOut = 'spawnSync gh ETIMEDOUT';
  const at = placed();
  const others = passing(at.repo).filter((rule) => rule.when !== 'pr view' && rule.when !== 'pr list');
  const head = gitIn(at.repo, 'rev-parse', 'HEAD').trim();
  const once = (when: string, then: string): Rule => ({ when, outs: ['', then], err: timedOut, statuses: [1, 0] });
  at.gh.answers([...others, once('pr list', listed(head)), once('pr view', GREEN)]);
  const r = pr(at, 'wait', CI, { WF_CI_POLL_SECONDS: '0' });
  assert.equal(r.code, 0, r.err);
  assert.equal(asked(r.calls, 'pr', 'list').length, 2, 'the pull request was read again after the read that failed');
  assert.equal(asked(r.calls, 'pr', 'view').length, 2, 'its checks were read again after the read that failed');
  assert.match(r.out, /nemia ci: `ci` passed on/);

  const down = placed();
  down.gh.answers([...passing(down.repo).filter((rule) => rule.when !== 'pr view'), { when: 'pr view', err: timedOut, status: 1 }]);
  const failing = pr(down, 'wait', CI, { WF_CI_WAIT_SECONDS: '0', WF_CI_POLL_SECONDS: '0' });
  assert.equal(failing.code, 1, failing.out);
  assert.ok(failing.err.includes(timedOut), failing.err);
  assert.ok(failing.err.includes(RETRY), failing.err);
  assert.match(failing.err, PERSONS, 'a GitHub that cannot be read judged nothing');
});

/** A job of the workflow run 1234 as the rollup gives it: its name, its job id, when it started and how it stands. */
const job = (name: string, id: number, startedAt: string, rest: Record<string, unknown>) => ({
  name,
  workflowName: 'ci',
  detailsUrl: `https://github.com/o/r/actions/runs/1234/job/${id}`,
  startedAt,
  ...rest,
});

/** The head's checks as `gh pr view --json statusCheckRollup` gives them. */
const checks = (...entries: Record<string, unknown>[]): string => JSON.stringify({ statusCheckRollup: entries });

const FAILED = { status: 'COMPLETED', conclusion: 'FAILURE' };
const PASSED_RUN = { status: 'COMPLETED', conclusion: 'SUCCESS' };
const QUEUED = { status: 'QUEUED' };

/** The first attempt of run 1234: `test x` red, and the gate `ci` that needs it red with it. */
const FIRST = [job('test x', 5677, T1, FAILED), job('ci', 5678, T1, FAILED)];

/** The second attempt's jobs, new ids, in the state `rest` says. */
const second = (rest: Record<string, unknown>, at = T2) => [job('test x', 6677, at, rest), job('ci', 6678, at, rest)];

/** The calls that re-ran run 1234's failed jobs. */
const reruns = (calls: readonly Called[]): Called[] => asked(calls, 'run', 'rerun');

/**
 * The wait in a place whose rollup reads `outs` (one per poll, the last repeating) and whose run 1234 answers `attempt` (a rule, or a
 * number); `rerun` answers `gh run rerun`; `more` sets the bounds.
 */
function redThen(outs: string[], attempt: Rule | number = 1, rerun: Rule = { when: 'run rerun' }, more: Record<string, string> = {}) {
  const at = placed();
  at.gh.answers([
    ...passing(at.repo).filter((rule) => rule.when !== 'pr view'),
    { when: 'pr view', outs },
    typeof attempt === 'number' ? { when: 'actions/runs/1234', out: JSON.stringify({ id: 1234, run_attempt: attempt }) } : attempt,
    rerun,
    { when: 'actions/jobs', out: stamped(['Process completed with exit code 1.']) },
  ]);
  return pr(at, 'wait', CI, { WF_CI_WAIT_SECONDS: '60', WF_CI_START_SECONDS: '60', WF_CI_POLL_SECONDS: '0', ...more });
}

test("wait re-runs a red ci's failed jobs once, and a green second time passes the check, saying which jobs it re-ran and how each ended", () => {
  const r = redThen([checks(...FIRST), checks(...FIRST, ...second(QUEUED, QUEUED_AT)), checks(...FIRST, ...second(PASSED_RUN))]);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(
    reruns(r.calls).map((call) => call.argv),
    [['run', 'rerun', '1234', '--failed']],
    'the run is re-run once, its failed jobs',
  );
  const attemptAt = r.calls.findIndex((call) => call.argv.join(' ').includes('actions/runs/1234'));
  assert.ok(attemptAt !== -1 && attemptAt < r.calls.findIndex((call) => call.argv[1] === 'rerun'), 'its attempt is read first');
  assert.match(r.out, /re-ran .* run 1234/);
  assert.match(r.out, /test x: success/);
  assert.match(r.out, /ci: success/);
  assert.match(r.out, /nemia ci: `ci` passed on/);
});

test("red twice is refused as today, the work's, with the re-run said and the second attempt's logs", () => {
  const r = redThen([checks(...FIRST), checks(...FIRST, ...second(FAILED))]);
  assert.equal(r.code, 1, r.out);
  assert.doesNotMatch(r.err, PERSONS, 'a job red again is the change');
  assert.equal(reruns(r.calls).length, 1, 'never a second re-run, the re-run red too');
  assert.ok(r.err.includes('`ci` for #7 is failure'), r.err);
  assert.match(r.err, /re-ran .* run 1234/);
  assert.match(r.err, /test x: failure/);
  assert.ok(r.err.includes(RETRY), r.err);
  const logs = asked(r.calls, 'api').map((call) => call.argv[1]);
  assert.ok(logs.includes('repos/{owner}/{repo}/actions/jobs/6677/logs'), "the second attempt's log is read");
  assert.ok(!logs.includes('repos/{owner}/{repo}/actions/jobs/5677/logs'), 'not the first one');
});

test('never twice per head: a run GitHub says is past its first attempt is not re-run again', () => {
  const r = redThen([checks(...FIRST)], 2);
  assert.equal(r.code, 1, r.out);
  assert.equal(reruns(r.calls).length, 0, 'no re-run');
  assert.match(r.err, /attempt is 2/);
  assert.doesNotMatch(r.err, PERSONS);
});

test('after a re-run, the old red GitHub still shows is waited on, not judged', () => {
  const r = redThen([
    checks(...FIRST),
    checks(...FIRST),
    checks(...FIRST, ...second(QUEUED, QUEUED_AT)),
    checks(...FIRST, ...second(PASSED_RUN)),
  ]);
  assert.equal(r.code, 0, r.err);
  assert.equal(reruns(r.calls).length, 1);
});

test("a re-run still running at the wait's bound is the work's refusal, within the same bound", () => {
  const r = redThen(
    [checks(...FIRST), checks(...FIRST, ...second(QUEUED, QUEUED_AT))],
    1,
    { when: 'run rerun' },
    {
      WF_CI_WAIT_SECONDS: '0',
    },
  );
  assert.equal(r.code, 1, r.out);
  assert.equal(reruns(r.calls).length, 1);
  assert.match(r.err, /re-ran .* run 1234/);
  assert.match(r.err, /re-runs nothing again/, 'saying the next check reads its verdict');
  assert.ok(r.err.includes(RETRY), r.err);
  assert.doesNotMatch(r.err, PERSONS, 'no person is needed');
});

test('REFUSED with no re-run, as today, where none can be asked', () => {
  const refused = (r: ReturnType<typeof pr>, why: RegExp) => {
    assert.equal(r.code, 1, r.out);
    assert.ok(r.err.includes('`ci` for #7 is failure'), r.err);
    assert.match(r.err, why);
    assert.doesNotMatch(r.err, PERSONS);
    return r;
  };
  const unread = refused(redThen([checks(...FIRST)], { when: 'actions/runs/1234', status: 1, err: 'HTTP 404' }), /its attempt is unread/);
  assert.equal(reruns(unread.calls).length, 0);
  refused(redThen([checks(...FIRST)], { when: 'actions/runs/1234', out: 'not json' }), /its attempt is unread/);
  refused(redThen([checks(...FIRST)], 1, { when: 'run rerun', status: 1, err: 'HTTP 403: Resource not accessible' }), /HTTP 403/);
  const status = refused(
    redThen([checks({ context: 'ci', state: 'FAILURE', targetUrl: 'https://ci.example/build/9' })]),
    /no job of an Actions run/,
  );
  assert.equal(reruns(status.calls).length, 0);

  const cancelled = redThen([checks(job('ci', 5678, T1, { status: 'COMPLETED', conclusion: 'CANCELLED' }))]);
  assert.equal(cancelled.code, 1, cancelled.out);
  assert.match(cancelled.err, PERSONS, 'a cancelled ci judged nothing, and stays the person');
  assert.ok(!cancelled.calls.some((call) => call.argv.join(' ').includes('actions/runs/1234')), 'its attempt is not read');
  assert.equal(reruns(cancelled.calls).length, 0);
});

test("build's implement check, rendered on GitHub, pushes through the script before the round check, labelling by the rules it was set, waits last on the CI context it was set, and runs no suite and no e2e itself", async () => {
  const at = await renderedSdlc(['github=true', 'roundCheck=round-check --all', 'ciCheck=gate', `pullRequestLabels=${RULES}`]);
  const check = stepsOf(at, 'build').find((step) => step.name === 'implement')?.check;
  assert.equal(typeof check, 'string', "sdlc's build has an implement step with a check");
  const frozen = check as string;
  const clauses = [...frozen.matchAll(/node\s+"\$WF_WORKFLOW_FILES\/([\w-]+\.ts)"\s+(check|push|wait)?/g)].map(([, script, verb]) =>
    verb ? `${script} ${verb}` : script,
  );
  assert.deepEqual(clauses, ['probe.ts check', 'parts.ts check', 'pull-request.ts push', 'pull-request.ts wait']);
  const round = frozen.indexOf('{ round-check --all; }');
  assert.ok(round > 0, `the round check the factory set is a clause of its own:\n${frozen}`);
  assert.ok(
    frozen.indexOf('pull-request.ts" push') < round,
    `the push is before the round check, so CI's wall time overlaps the local gates:\n${frozen}`,
  );
  assert.ok(round < frozen.indexOf('pull-request.ts" wait'), `and CI is waited on last:\n${frozen}`);
  assert.doesNotMatch(frozen, /npm test/, "the suite is CI's now, on the pushed commit");
  assert.doesNotMatch(frozen, /npm run e2e/, 'and so is the whole e2e');
  assert.ok(clauseOf(frozen, 'wait').includes('pull-request.ts" wait --check "gate";'), 'the wait reads the CI context the factory set');
  assert.ok(
    clauseOf(frozen, 'push').includes(`pull-request.ts" push --labels "${RULES}";`),
    'the push labels by the rules the factory set',
  );
  for (const verb of ['push', 'wait']) {
    const clause = clauseOf(frozen, verb);
    assert.ok(
      clause.startsWith(`{ if [ -n "\${WF_WORKFLOW_FILES:-}" ]; then node "$WF_WORKFLOW_FILES/pull-request.ts" ${verb}`),
      `${verb} runs the script from the run's frozen workflow files first, in its own clause:\n${clause}`,
    );
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
      const [cmd, ...argv] = checkArgv(`${clause}fi; }`);
      const ran = spawnSync(cmd, argv, {
        cwd: at2.repo,
        env: {
          PATH: `${at2.gh.bin}${path.delimiter}${process.env.PATH ?? ''}`,
          HOME: at2.repo,
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_CONFIG_NOSYSTEM: '1',
          WF_CI_POLL_SECONDS: '0',
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
    assert.notEqual(unset.code, 0, `${verb}, where the frozen workflow files are not named, refuses rather than read the script elsewhere`);
    assert.match(unset.err, /WF_WORKFLOW_FILES/, 'naming the variable');
    assert.deepEqual(at2.gh.calls(), [], 'and runs no script');
    assert.equal(tip(at2.bare!, at2.branch), null, 'nothing is pushed');
    const ran = run({ WF_WORKFLOW_FILES: path.join(at.tree, 'workflows', 'build'), WF_LABELS: JSON.stringify({ work: 'cleanup' }) });
    assert.equal(ran.code, 0, `${verb}, from the frozen workflow files, on a red \`ci\` beside a green \`gate\`:\n${ran.err}`);
    assert.match(ran.out, verb === 'push' ? /nemia pr: #7 is at [0-9a-f]{12}/ : /nemia ci: `gate` passed on/);
    assert.deepEqual(
      labelCalls(at2.gh.calls()).map((call) => call.argv.at(-1)),
      verb === 'push' ? ['labels[]=internal'] : [],
      `the rendered push reads the rules whole, spaces and all, and the wait sets no label:\n${ran.out}`,
    );
  }
});

test("build's and quick's implement notes, rendered on GitHub, open the pull request labelled by the rules the factory set", async () => {
  const at = await renderedSdlc(['github=true', `pullRequestLabels=${RULES}`]);
  for (const workflow of ['build', 'quick']) {
    const note = fs.readFileSync(path.join(at.tree, 'workflows', workflow, 'implement.md'), 'utf8');
    const line = note.split('\n').find((text) => text.includes('pull-request.ts" open --title'));
    assert.ok(line, `${workflow}'s note types the open line`);
    assert.ok(line.includes(`--labels "${RULES}"`), `${workflow}: the rules on the open line itself:\n${line}`);
    const place = unopened();
    const file = body();
    const typed = line.trim().replace("<the card's line>", 'The card').replace('$WF_STEP_FILES/pr-body.md', file);
    const [cmd, ...argv] = checkArgv(typed);
    const ran = spawnSync(cmd, argv, {
      cwd: place.repo,
      env: {
        PATH: `${place.gh.bin}${path.delimiter}${process.env.PATH ?? ''}`,
        HOME: place.repo,
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
        WF_WORKFLOW_FILES: path.join(at.tree, 'workflows', workflow),
        WF_LABELS: JSON.stringify({ work: 'cleanup' }),
        ...place.gh.env(),
      },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120_000,
    });
    assert.equal(ran.status, 0, `${workflow}: ${ran.stderr}`);
    assert.deepEqual(
      labelCalls(place.gh.calls()).map((call) => call.argv.at(-1)),
      ['labels[]=internal'],
      `${workflow}: the line as rendered labels the pull request it opens`,
    );
  }
});

test("REFUSED at shipped defaults, in the checkout: build's implement check runs the probes, then the local check, pushes nothing and calls no gh", async () => {
  const at = await renderedSdlc(['localCheck=local-check']);
  const check = stepsOf(at, 'build').find((step) => step.name === 'implement')?.check;
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
        WF_WORKFLOW_FILES: path.join(at.tree, 'workflows', 'build'),
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
 * The clause of the frozen check `frozen` that runs the pull-request script's `verb`: from the `{` that opens it to the `fi; }` that
 * closes it, so what the clause holds is read against that verb alone and not against another's.
 */
function clauseOf(frozen: string, verb: string): string {
  const named = frozen.indexOf(`/pull-request.ts" ${verb}`);
  assert.ok(named > 0, `the check runs the script's ${verb}:\n${frozen}`);
  const opens = frozen.lastIndexOf('{ if [ -n "${WF_WORKFLOW_FILES:-}" ]', named);
  assert.ok(opens >= 0, `the ${verb} clause opens on the frozen workflow files:\n${frozen}`);
  const closes = frozen.indexOf('fi; }', named);
  assert.ok(closes > named, `the ${verb} clause closes:\n${frozen}`);
  return frozen.slice(opens, closes);
}

test('the wait tells its two bounds apart: the start is its own, and what is left of the check deadline bounds the whole', () => {
  const at = placed();
  at.gh.answers([
    ...passing(at.repo).filter((rule) => rule.when !== 'pr view'),
    { when: 'pr view', out: JSON.stringify({ statusCheckRollup: [{ name: 'lint', status: 'COMPLETED', conclusion: 'SUCCESS' }] }) },
  ]);
  const absent = pr(at, 'wait', CI, { WF_CI_START_SECONDS: '0', WF_CI_WAIT_SECONDS: '5', WF_CI_POLL_SECONDS: '0' });
  assert.equal(absent.code, 1, absent.out);
  assert.match(absent.err, /no `ci` context was reported for #7 within 0 s/, 'a `ci` never reported is refused on the start bound');

  const slow = placed();
  slow.gh.answers([
    ...passing(slow.repo).filter((rule) => rule.when !== 'pr view'),
    { when: 'pr view', outs: [JSON.stringify({ statusCheckRollup: [] }), rollup({ status: 'IN_PROGRESS' }), GREEN] },
  ]);
  const late = pr(slow, 'wait', CI, { WF_CI_START_SECONDS: '600', WF_CI_WAIT_SECONDS: '600', WF_CI_POLL_SECONDS: '0' });
  assert.equal(late.code, 0, late.err);
  assert.equal(asked(late.calls, 'pr', 'view').length, 3, 'a `ci` that has not been reported yet is waited for, within the start bound');

  const started = placed();
  started.gh.answers([
    ...passing(started.repo).filter((rule) => rule.when !== 'pr view'),
    { when: 'pr view', out: rollup({ status: 'IN_PROGRESS' }) },
  ]);
  const unfinished = pr(started, 'wait', CI, { WF_CI_START_SECONDS: '600', WF_CI_WAIT_SECONDS: '0', WF_CI_POLL_SECONDS: '0' });
  assert.equal(unfinished.code, 1, unfinished.out);
  assert.match(unfinished.err, /was still in_progress after 0 s/, 'a started `ci` is bounded by the whole');
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
      'probe, the push and the round check — have what is left, and 900 s is the least that is honest. Re-measure the ' +
      'deadline (CHECK_DEADLINE_SECONDS, agent-orchestrator/run) before you raise the wait.',
  );
});
