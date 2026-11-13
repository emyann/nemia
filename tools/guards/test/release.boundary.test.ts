/**
 * `tools/release/release.ts` run for real on a scratch repository — a bare origin and a clone of it, with the tags this repository has
 * (`v0.3.0`, `v1-final`, `legacy/v1-final`) and the operator's local `nemia-2026.11.03` — and a stub `gh` first on PATH that logs each
 * call and answers GitHub's part from a state file: the merged pull requests (more than one page of them), the open ones, one pull
 * request by its number, the generated notes, a workflow's dispatched runs on a head, which a dispatch it records adds to, and the
 * releases made, a tag it is asked for pushed to the origin. What it
 * asserts is the exit code, the calls made and positions in a body, never a sentence.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { CREATE_SETTING, DISPATCHED } from '../../release/release.ts';

const RELEASE = path.join(import.meta.dirname, '..', '..', 'release', 'release.ts');

type Pull = {
  number: number;
  title: string;
  body?: string;
  labels: { name: string }[];
  merged_at?: string | null;
  merge_commit_sha?: string | null;
  head: { ref: string; sha?: string };
};

/** A dispatched run the stub knows: its workflow file, the head it ran on, the pull request it was given, and how it stands. */
type Run = { file: string; head: string; pr?: string; status: string; conclusion: string | null };

/** What the stub answers from, and what it changes as the script acts. */
type State = {
  pulls: Pull[];
  createFails?: boolean;
  labels: { name: string; color: string; description: string }[];
  next: number;
  runs?: Run[];
  /** The tags a release, draft or published, is made on. */
  releases?: string[];
};

/**
 * The stub `gh`: logs its argv as one JSON line to `STUB_LOG`, reads and writes `STUB_STATE`, and answers as GitHub would the calls
 * the tool makes; a call it has no answer for exits 9. A dispatch records a queued run on the origin's \`release\` head as it is
 * then, and a pull request opened takes that head too.
 */
const STUB = `
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const releaseHead = () => execFileSync('git', ['ls-remote', 'origin', 'refs/heads/release'], { encoding: 'utf8' }).split('\\t')[0];
const args = process.argv.slice(2);
const stdin = args.includes('-') ? fs.readFileSync(0, 'utf8') : undefined;
fs.appendFileSync(process.env.STUB_LOG, JSON.stringify({ args, stdin }) + '\\n');
const state = JSON.parse(fs.readFileSync(process.env.STUB_STATE, 'utf8'));
const save = () => fs.writeFileSync(process.env.STUB_STATE, JSON.stringify(state));
const field = (key) => { for (let i = 0; i < args.length - 1; i++) if ((args[i] === '-f' || args[i] === '-F') && args[i + 1].startsWith(key + '=')) return args[i + 1].slice(key.length + 1); };
const print = (value) => process.stdout.write(JSON.stringify(value));
if (args[0] === 'api') {
  const method = args[2];
  const [route, query = ''] = args[3].split('?');
  const q = new URLSearchParams(query);
  let m;
  if (method === 'GET' && route === 'repos/{owner}/{repo}/labels') { print(q.get('page') === '1' ? state.labels : []); }
  else if (method === 'POST' && route === 'repos/{owner}/{repo}/labels') { state.labels.push({ name: field('name'), color: field('color'), description: field('description') }); save(); print({}); }
  else if (method === 'GET' && (m = /^repos\\/\\{owner\\}\\/\\{repo\\}\\/pulls\\/(\\d+)$/.exec(route))) {
    const p = state.pulls.find((each) => each.number === Number(m[1]));
    if (!p) { process.stderr.write('HTTP 404: Not Found'); process.exit(1); }
    print(p);
  }
  else if (method === 'PATCH' && (m = /^repos\\/\\{owner\\}\\/\\{repo\\}\\/labels\\/(.+)$/.exec(route))) { print({}); }
  else if (method === 'GET' && route === 'repos/{owner}/{repo}/pulls') {
    const per = Number(q.get('per_page')); const page = Number(q.get('page') || 1);
    const head = q.get('head');
    const all = state.pulls.filter((p) => (q.get('state') === 'open' ? !p.merged_at && !p.closed : p.merged_at || p.closed) && (!head || head === '{owner}:' + p.head.ref));
    print(all.slice((page - 1) * per, page * per));
  }
  else if (method === 'PATCH' && (m = /^repos\\/\\{owner\\}\\/\\{repo\\}\\/pulls\\/(\\d+)$/.exec(route))) {
    const p = state.pulls.find((each) => each.number === Number(m[1]));
    if (field('state') === 'closed') p.closed = true;
    if (field('title') !== undefined) p.title = field('title');
    if (field('body') !== undefined) p.body = field('body');
    save(); print(p);
  }
  else if (method === 'POST' && (m = /^repos\\/\\{owner\\}\\/\\{repo\\}\\/issues\\/(\\d+)\\/labels$/.exec(route))) {
    const p = state.pulls.find((each) => each.number === Number(m[1]));
    p.labels.push({ name: field('labels[]') }); save(); print(p.labels);
  }
  else if (method === 'GET' && (m = /^repos\\/\\{owner\\}\\/\\{repo\\}\\/actions\\/workflows\\/([^/]+)\\/runs$/.exec(route))) {
    const runs = (state.runs || []).filter((run) => run.file === m[1] && run.head === q.get('head_sha') && q.get('event') === 'workflow_dispatch');
    print({ total_count: runs.length, workflow_runs: runs.map((run) => ({ head_sha: run.head, event: 'workflow_dispatch', status: run.status, conclusion: run.conclusion })) });
  }
  else if (method === 'POST' && route === 'repos/{owner}/{repo}/git/refs') {
    execFileSync('git', ['push', '--quiet', 'origin', field('sha') + ':' + field('ref')]);
    print({ ref: field('ref'), object: { sha: field('sha') } });
  }
  else if (method === 'POST' && route === 'repos/{owner}/{repo}/releases/generate-notes') { print({ name: field('tag_name'), body: '## Fixes\\n* a fix, up to ' + field('target_commitish') }); }
  else { process.stderr.write('stub gh: no answer for ' + args.join(' ')); process.exit(9); }
  process.exit(0);
}
if (args[0] === 'pr' && args[1] === 'create') {
  if (state.createFails) { process.stderr.write('pull request create failed: GraphQL: GitHub Actions is not permitted to create or approve pull requests (createPullRequest)'); process.exit(1); }
  const number = state.next++;
  state.pulls.push({ number, title: args[args.indexOf('--title') + 1], body: stdin, labels: [], merged_at: null, head: { ref: args[args.indexOf('--head') + 1], sha: releaseHead() } });
  save(); process.stdout.write('https://github.com/o/r/pull/' + number + '\\n'); process.exit(0);
}
if (args[0] === 'release' && args[1] === 'create') { state.releases = [...(state.releases || []), args[2]]; save(); process.exit(0); }
if (args[0] === 'release' && args[1] === 'view') {
  if (!(state.releases || []).includes(args[2])) { process.stderr.write('release not found'); process.exit(1); }
  print({ isDraft: true }); process.exit(0);
}
if (args[0] === 'workflow' && args[1] === 'run' && args[3] === '--ref' && args[4] === 'release') {
  const pr = args.indexOf('-f') >= 0 ? args[args.indexOf('-f') + 1] : undefined;
  state.runs = [...(state.runs || []), { file: args[2], head: releaseHead(), pr: pr && pr.startsWith('pr=') ? pr.slice(3) : pr, status: 'queued', conclusion: null }];
  save(); process.exit(0);
}
process.stderr.write('stub gh: no answer for ' + args.join(' ')); process.exit(9);
`;

type Call = { args: string[]; stdin?: string };

/**
 * A scratch world: the origin, the clone the tool runs in, the stub's state and log. Its environment leaves out an inherited `LABELS`,
 * `PR_NUMBER` and `HEAD_SHA`, the check's inputs, so each test sets the ones it reads.
 */
const world = () => {
  const root = scratch('release-');
  const origin = path.join(root, 'origin.git');
  const seed = path.join(root, 'seed');
  const clone = path.join(root, 'clone');
  const bin = path.join(root, 'bin');
  const { LABELS: _payload, PR_NUMBER: _number, HEAD_SHA: _head, ...inherited } = process.env;
  const env = {
    ...inherited,
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@t',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@t',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: path.join(root, 'gitconfig'),
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    STUB_LOG: path.join(root, 'gh.log'),
    STUB_STATE: path.join(root, 'state.json'),
  };
  const git = (cwd: string, ...args: string[]): string => {
    const ran = spawnSync('git', args, { cwd, env, encoding: 'utf8', timeout: 30_000 });
    assert.equal(ran.status, 0, `git ${args.join(' ')}: ${ran.stderr}`);
    return ran.stdout.trim();
  };
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'gh'), `#!${process.execPath}\n${STUB}`, { mode: 0o755 });
  fs.writeFileSync(env.GIT_CONFIG_GLOBAL, '');
  git(root, 'init', '--quiet', '--bare', '-b', 'main', origin);
  git(root, 'init', '--quiet', '-b', 'main', seed);
  const write = (file: string, value: unknown) => fs.writeFileSync(path.join(seed, file), JSON.stringify(value, null, 2) + '\n');
  write('package.json', { name: 'nemia', private: true, workspaces: ['tools/guards'] });
  write('package-lock.json', { name: 'nemia', lockfileVersion: 3, requires: true, packages: { '': { name: 'nemia', license: 'MIT' } } });
  git(seed, 'add', '.');
  git(seed, 'commit', '--quiet', '-m', 'the last release');
  git(seed, 'tag', 'v0.3.0');
  const commit = (message: string): string => {
    fs.writeFileSync(path.join(seed, `${message.replace(/\W/g, '-')}.txt`), message);
    git(seed, 'add', '.');
    git(seed, 'commit', '--quiet', '-m', message);
    return git(seed, 'rev-parse', 'HEAD');
  };
  const legacy = commit('the legacy cut');
  git(seed, 'tag', 'v1-final', legacy);
  git(seed, 'tag', 'legacy/v1-final', legacy);
  git(seed, 'remote', 'add', 'origin', origin);
  git(seed, 'push', '--quiet', 'origin', 'main', '--tags');
  git(root, 'clone', '--quiet', origin, clone);
  git(clone, 'tag', 'nemia-2026.11.03');
  const land = (message: string): string => {
    const sha = commit(message);
    git(seed, 'push', '--quiet', 'origin', 'main');
    return sha;
  };
  const state = (value: State) => fs.writeFileSync(env.STUB_STATE, JSON.stringify(value));
  const read = (): State => JSON.parse(fs.readFileSync(env.STUB_STATE, 'utf8')) as State;
  const calls = (): Call[] =>
    fs.existsSync(env.STUB_LOG)
      ? fs
          .readFileSync(env.STUB_LOG, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line) as Call)
      : [];
  const run = (verb: string, extra: Record<string, string> = {}) => {
    fs.rmSync(env.STUB_LOG, { force: true });
    const ran = spawnSync(process.execPath, [RELEASE, verb], { cwd: clone, env: { ...env, ...extra }, encoding: 'utf8', timeout: 60_000 });
    return { status: ran.status, out: `${ran.stdout}${ran.stderr}`, calls: calls() };
  };
  return { origin, seed, clone, git, land, state, read, run, legacy };
};

/** A merged pull request of `number` labelled `labels`, merged as `sha`. */
const merged = (number: number, labels: string[], sha: string | null): Pull => ({
  number,
  title: `change ${number}`,
  labels: labels.map((name) => ({ name })),
  merged_at: sha ? '2026-11-01T00:00:00Z' : null,
  merge_commit_sha: sha,
  head: { ref: `branch-${number}` },
});

/** The dispatches made, each as the arguments after `gh workflow run`. */
const dispatched = (calls: Call[]): string[][] =>
  calls.filter((call) => call.args[0] === 'workflow' && call.args[1] === 'run').map((call) => call.args.slice(2));

/** The reads of a workflow's dispatched runs. */
const runReads = (calls: Call[]): Call[] => calls.filter((call) => call.args.some((arg) => arg.includes('/actions/workflows/')));

/** The two dispatches on `release`, `release-label.yml` given the pull request's number. */
const BOTH = (number: number): string[][] => [
  ['ci.yml', '--ref', 'release'],
  ['release-label.yml', '--ref', 'release', '-f', `pr=${number}`],
];

/** Where `word` stands in `body`, refusing a body that lacks it. */
const at = (body: string, word: string): number => {
  const index = body.indexOf(word);
  assert.ok(index >= 0, `the body holds ${JSON.stringify(word)}`);
  return index;
};

/** More than a page of pull requests merged before the last release, whose commits are not in the range. */
const older = (): Pull[] => Array.from({ length: 130 }, (_, i) => merged(1000 + i, ['feature'], `${'0'.repeat(39)}${i % 10}`));

const has = (calls: Call[], ...words: string[]) => calls.some((call) => words.every((word) => call.args.includes(word)));
const named = (calls: Call[], ...words: string[]) => calls.filter((call) => words.every((word) => call.args.includes(word)));

test('pr rebuilds release from main at 1.0.0, opens its pull request labelled internal, its body opening on the checks, then dispatches both on its head', () => {
  const w = world();
  const fix = w.land('a fix');
  const docs = w.land('some docs');
  w.state({
    pulls: [...older(), merged(1, ['fix'], fix), merged(2, ['docs'], docs), merged(3, [], w.legacy)],
    labels: [],
    next: 900,
  });
  const ran = w.run('pr');
  assert.equal(ran.status, 0, ran.out);

  assert.equal(
    w.git(w.origin, 'rev-parse', 'refs/heads/release^1'),
    w.git(w.origin, 'rev-parse', 'refs/heads/main'),
    'release is main plus one',
  );
  const pkg = JSON.parse(w.git(w.origin, 'show', 'release:package.json')) as Record<string, unknown>;
  assert.deepEqual(Object.keys(pkg).slice(0, 2), ['name', 'version'], 'the version sits after the name, where npm puts it');
  assert.equal(pkg.version, '1.0.0', 'a patch of 0.3.0 is lifted to the floor');
  const lock = JSON.parse(w.git(w.origin, 'show', 'release:package-lock.json')) as {
    version: string;
    packages: Record<string, { version: string }>;
  };
  assert.equal(lock.version, '1.0.0');
  assert.equal(lock.packages[''].version, '1.0.0');
  const raw = spawnSync('git', ['--git-dir', w.origin, 'show', 'release:package.json'], { encoding: 'utf8', timeout: 30_000 }).stdout;
  assert.equal(raw, JSON.stringify(pkg, null, 2) + '\n', 'written as npm writes it, two spaces and one newline at the end');

  const pages = named(ran.calls, 'GET').filter((call) => call.args[3].includes('state=closed'));
  assert.ok(pages.length >= 2, `the merged pull requests are read past the first page: ${pages.length} read`);
  assert.ok(
    has(ran.calls, 'pr', 'create', '--base', 'main', '--head', 'release', '--title', 'release: v1.0.0'),
    'the pull request is opened',
  );
  assert.ok(has(ran.calls, 'POST', 'repos/{owner}/{repo}/issues/900/labels', 'labels[]=internal'), 'and labelled internal');
  const notes = named(ran.calls, 'repos/{owner}/{repo}/releases/generate-notes');
  assert.equal(notes.length, 1);
  assert.ok(notes[0].args.includes('previous_tag_name=v0.3.0'), 'the notes run from v0.3.0, never v1-final nor a nemia-* tag');
  assert.ok(notes[0].args.includes('tag_name=v1.0.0'));
  const body = named(ran.calls, 'pr', 'create')[0].stdin ?? '';
  assert.ok(body.includes('#3'), 'the unlabelled pull request is listed apart in the body');
  for (const { check } of DISPATCHED)
    assert.ok(at(body, `\`${check}\``) < at(body, '## Fixes'), `the body names ${check} ahead of the notes`);
  assert.deepEqual(dispatched(ran.calls), BOTH(900), 'ci and release-label are dispatched on release, the label check given #900');
  const label = ran.calls.findIndex((call) => call.args.includes('repos/{owner}/{repo}/issues/900/labels'));
  const labelCheck = ran.calls.findIndex((call) => call.args[0] === 'workflow' && call.args[2] === 'release-label.yml');
  assert.ok(label >= 0 && label < labelCheck, 'the label is on before the check that reads it is dispatched');
  const head = w.git(w.origin, 'rev-parse', 'refs/heads/release');
  assert.deepEqual(
    runReads(ran.calls).map((call) => call.args[3]),
    DISPATCHED.map(
      ({ file }) => `repos/{owner}/{repo}/actions/workflows/${file}/runs?head_sha=${head}&event=workflow_dispatch&per_page=100`,
    ),
    "each workflow's dispatched runs are read on the head",
  );
  assert.deepEqual(
    w.read().runs?.map((run) => [run.file, run.head]),
    DISPATCHED.map(({ file }) => [file, head]),
    'each run is on the head pushed',
  );
});

test('a second pr with nothing moved pushes, patches and dispatches nothing; with main moved it updates the same pull request and dispatches on the new head', () => {
  const w = world();
  const feature = w.land('a feature');
  w.state({ pulls: [merged(1, ['feature'], feature)], labels: [], next: 900 });
  assert.equal(w.run('pr').status, 0);
  const first = w.git(w.origin, 'rev-parse', 'refs/heads/release');

  const again = w.run('pr');
  assert.equal(again.status, 0, again.out);
  assert.equal(w.git(w.origin, 'rev-parse', 'refs/heads/release'), first, 'release is not pushed again');
  assert.ok(!has(again.calls, 'PATCH'), 'the pull request is left as it is');
  assert.deepEqual(dispatched(again.calls), [], 'the head has both runs queued: nothing is dispatched again');
  assert.equal(runReads(again.calls).length, DISPATCHED.length, 'one read of the runs per workflow');
  assert.ok(!has(again.calls, 'pr', 'create'), 'no second pull request');

  const fix = w.land('a fix after');
  w.state({ ...w.read(), pulls: [...w.read().pulls, merged(2, ['fix'], fix)] });
  const moved = w.run('pr');
  assert.equal(moved.status, 0, moved.out);
  const second = w.git(w.origin, 'rev-parse', 'refs/heads/release');
  assert.notEqual(second, first);
  assert.equal(w.git(w.origin, 'rev-parse', 'refs/heads/release^1'), fix, 'rebuilt on the moved main');
  assert.ok(!has(moved.calls, 'pr', 'create'), 'the same pull request is kept');
  const patch = named(moved.calls, 'PATCH', 'repos/{owner}/{repo}/pulls/900');
  assert.equal(patch.length, 1, 'and updated');
  const body = patch[0].args.find((arg) => arg.startsWith('body=')) ?? '';
  for (const { check } of DISPATCHED) assert.ok(at(body, `\`${check}\``) < at(body, '## Fixes'), `the new body names ${check} first`);
  assert.deepEqual(dispatched(moved.calls), BOTH(900), 'each is dispatched once on the new head');
  assert.deepEqual(
    w
      .read()
      .runs?.filter((run) => run.head === second)
      .map((run) => run.file),
    DISPATCHED.map(({ file }) => file),
  );
});

test("pr decides from the head's dispatched runs, never from whether it pushed: a missing, failed or cancelled run is dispatched again", async (t) => {
  const settled = (status: string, conclusion: string | null) => {
    const w = world();
    const feature = w.land('a feature');
    w.state({ pulls: [merged(1, ['feature'], feature)], labels: [], next: 900 });
    assert.equal(w.run('pr').status, 0);
    const runs = w.read().runs ?? [];
    w.state({ ...w.read(), runs: runs.map((run) => (run.file === 'ci.yml' ? { ...run, status, conclusion } : run)) });
    return w;
  };
  await t.test('the head with no dispatched run left gets both, though release is not pushed', () => {
    const w = world();
    const feature = w.land('a feature');
    w.state({ pulls: [merged(1, ['feature'], feature)], labels: [], next: 900 });
    assert.equal(w.run('pr').status, 0);
    const head = w.git(w.origin, 'rev-parse', 'refs/heads/release');
    w.state({ ...w.read(), runs: [] });
    const ran = w.run('pr');
    assert.equal(ran.status, 0, ran.out);
    assert.equal(w.git(w.origin, 'rev-parse', 'refs/heads/release'), head, 'release is not pushed');
    assert.deepEqual(dispatched(ran.calls), BOTH(900));
  });
  for (const conclusion of ['failure', 'cancelled'])
    await t.test(`a ci ended ${conclusion} is dispatched again, and the queued release-label is left`, () => {
      const w = settled('completed', conclusion);
      const ran = w.run('pr');
      assert.equal(ran.status, 0, ran.out);
      assert.deepEqual(dispatched(ran.calls), [['ci.yml', '--ref', 'release']]);
    });
  await t.test('a ci that succeeded, or is still in progress, is not dispatched again', () => {
    for (const [status, conclusion] of [
      ['completed', 'success'],
      ['in_progress', null],
    ] as const) {
      const ran = settled(status, conclusion).run('pr');
      assert.equal(ran.status, 0, ran.out);
      assert.deepEqual(dispatched(ran.calls), [], `${status} ${conclusion}`);
    }
  });
});

test('with every pull request merged since the last release internal, pr opens none and closes the one open', () => {
  const w = world();
  const cleanup = w.land('a cleanup');
  const open: Pull = { ...merged(900, ['internal'], null), title: 'release: v1.0.0', head: { ref: 'release' } };
  const mergedAsV030 = merged(5, ['breaking'], w.git(w.clone, 'rev-parse', 'v0.3.0^{commit}'));
  w.state({ pulls: [mergedAsV030, merged(1, ['internal'], cleanup), open], labels: [], next: 901 });
  const ran = w.run('pr');
  assert.equal(ran.status, 0, ran.out);
  assert.ok(!has(ran.calls, 'pr', 'create'));
  assert.ok(has(ran.calls, 'PATCH', 'repos/{owner}/{repo}/pulls/900', 'state=closed'), 'the open release pull request is closed');
  assert.deepEqual(dispatched(ran.calls), [], 'nothing is dispatched');
  assert.deepEqual(runReads(ran.calls), [], 'and no runs read');
});

test("check, given PR_NUMBER and no LABELS, reads the pull request's labels as they are now", async (t) => {
  await t.test('the release pull request, labelled internal after it opened, passes', () => {
    const w = world();
    const open: Pull = { ...merged(900, ['internal'], null), title: 'release: v1.0.0', head: { ref: 'release' } };
    w.state({ pulls: [merged(1, ['fix'], w.legacy), open], labels: [], next: 901 });
    const ran = w.run('check', { PR_NUMBER: '900' });
    assert.equal(ran.status, 0, ran.out);
    assert.deepEqual(
      ran.calls.map((call) => call.args.slice(0, 4)),
      [['api', '-X', 'GET', 'repos/{owner}/{repo}/pulls/900']],
      'one read, of the pull request by its number',
    );
  });
  await t.test('REFUSED: the pull request carries no release label, exit 1', () => {
    const w = world();
    const open: Pull = { ...merged(900, ['dependencies'], null), title: 'release: v1.0.0', head: { ref: 'release' } };
    w.state({ pulls: [open], labels: [], next: 901 });
    assert.equal(w.run('check', { PR_NUMBER: '900' }).status, 1);
  });
  await t.test("a dispatched run passes on the pull request's head, and is refused on another commit, exit 1", () => {
    const w = world();
    const open: Pull = { ...merged(900, ['internal'], null), title: 'release: v1.0.0', head: { ref: 'release', sha: 'a'.repeat(40) } };
    w.state({ pulls: [open], labels: [], next: 901 });
    assert.equal(w.run('check', { PR_NUMBER: '900', HEAD_SHA: 'a'.repeat(40) }).status, 0, 'the head the run is on');
    const other = w.run('check', { PR_NUMBER: '900', HEAD_SHA: 'b'.repeat(40) });
    assert.equal(other.status, 1, 'another commit is refused, the label right or not');
    assert.ok(other.out.includes('gh workflow run release-label.yml --ref release -f pr=900'), 'naming the dispatch that checks the head');
    const event = w.run('check', { PR_NUMBER: '900', HEAD_SHA: '' });
    assert.equal(event.status, 0, 'an empty HEAD_SHA, as a pull_request event passes it, compares nothing');
    assert.equal(event.calls.length, 1, 'one read');
  });
  await t.test('REFUSED: no pull request has the number, exit 1', () => {
    const w = world();
    w.state({ pulls: [], labels: [], next: 901 });
    assert.equal(w.run('check', { PR_NUMBER: '900' }).status, 1);
  });
});

test('REFUSED: GitHub refusing the token a pull request exits 1 naming the setting that allows it', () => {
  const w = world();
  const fix = w.land('a fix');
  w.state({ pulls: [merged(1, ['fix'], fix)], labels: [], next: 900, createFails: true });
  const ran = w.run('pr');
  assert.equal(ran.status, 1, ran.out);
  assert.ok(ran.out.includes(CREATE_SETTING), 'the refusal names the setting');
});

test('tag tags the version main names on the commit that set it with a draft release on the tag, gives a tag left with none its draft, and does nothing once both are there', () => {
  const w = world();
  const fix = w.land('a fix');
  w.state({ pulls: [merged(1, ['fix'], fix)], labels: [], next: 900 });
  assert.equal(w.run('pr').status, 0);
  w.git(w.seed, 'fetch', '--quiet', 'origin', 'release');
  w.git(w.seed, 'merge', '--quiet', '--no-ff', '-m', 'Merge the release', 'FETCH_HEAD');
  const merge = w.git(w.seed, 'rev-parse', 'HEAD');
  w.git(w.seed, 'push', '--quiet', 'origin', 'main');
  w.land('a change after the release');

  const ran = w.run('tag');
  assert.equal(ran.status, 0, ran.out);
  const tagged = ran.calls.findIndex((call) => call.args.includes('repos/{owner}/{repo}/git/refs'));
  const created = ran.calls.findIndex((call) => call.args[0] === 'release' && call.args[1] === 'create');
  assert.ok(
    has(ran.calls, 'POST', 'repos/{owner}/{repo}/git/refs', 'ref=refs/tags/v1.0.0', `sha=${merge}`),
    'tagged on the first-parent commit that set 1.0.0',
  );
  assert.ok(has(ran.calls, 'release', 'create', 'v1.0.0', '--draft', '--verify-tag'), 'a draft on the tag, published by the upload job');
  assert.ok(tagged >= 0 && tagged < created, 'the tag before the release, which a draft does not make');
  const notes = named(ran.calls, 'repos/{owner}/{repo}/releases/generate-notes');
  assert.ok(notes[0]?.args.includes('previous_tag_name=v0.3.0'));
  assert.ok(named(ran.calls, 'release', 'create')[0].stdin?.endsWith(merge), 'the release carries the notes generated up to it');

  const again = w.run('tag');
  assert.equal(again.status, 0, again.out);
  assert.deepEqual(
    again.calls.map((call) => call.args.slice(0, 3)),
    [['release', 'view', 'v1.0.0']],
    'a tag with its release calls nothing but the read of it',
  );

  w.state({ ...w.read(), releases: [] });
  const cut = w.run('tag');
  assert.equal(cut.status, 0, cut.out);
  assert.ok(!has(cut.calls, 'repos/{owner}/{repo}/git/refs'), 'the tag there is not made again');
  assert.ok(
    has(cut.calls, 'release', 'create', 'v1.0.0', '--draft', '--verify-tag'),
    'a tag a cut-off run left with no release is given its draft',
  );
});

test('tag does nothing where package.json names no version', () => {
  const w = world();
  w.state({ pulls: [], labels: [], next: 900 });
  const ran = w.run('tag');
  assert.equal(ran.status, 0, ran.out);
  assert.deepEqual(ran.calls, []);
});

test('labels makes the five missing labels and leaves one that is right alone', () => {
  const w = world();
  w.state({
    pulls: [],
    labels: [{ name: 'internal', color: 'cfd3d7', description: 'Releases nothing: the repository changed, not what a user gets' }],
    next: 900,
  });
  const ran = w.run('labels');
  assert.equal(ran.status, 0, ran.out);
  assert.deepEqual(
    named(ran.calls, 'POST', 'repos/{owner}/{repo}/labels').map((call) => call.args.find((arg) => arg.startsWith('name='))),
    ['name=breaking', 'name=feature', 'name=fix', 'name=docs'],
  );
  assert.ok(!has(ran.calls, 'PATCH'));
});
