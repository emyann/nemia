/**
 * `tools/release/release.ts` run for real on a scratch repository — a bare origin and a clone of it, with the tags this repository has
 * (`v0.3.0`, `v1-final`, `legacy/v1-final`) and the operator's local `nemia-2026.11.03` — and a stub `gh` first on PATH that logs each
 * call and answers GitHub's part from a state file: the merged pull requests (more than one page of them), the open ones, the
 * workflow runs on a head, the generated notes and the proof's GraphQL. What it asserts is the exit code and the calls made, never a
 * sentence.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';
import { CREATE_SETTING, PROOF_BOUND_ENV, PROOF_INTERVAL_ENV } from '../../release/release.ts';

const RELEASE = path.join(import.meta.dirname, '..', '..', 'release', 'release.ts');

type Pull = {
  number: number;
  title: string;
  body?: string;
  labels: { name: string }[];
  merged_at?: string | null;
  merge_commit_sha?: string | null;
  head: { ref: string };
};

/** What the stub answers from, and what it changes as the script acts. */
type State = {
  pulls: Pull[];
  runs: Record<string, string[]>;
  createFails?: boolean;
  graphql?: unknown;
  labels: { name: string; color: string; description: string }[];
  next: number;
};

/**
 * The stub `gh`: logs its argv as one JSON line to `STUB_LOG`, reads and writes `STUB_STATE`, and answers as GitHub would the calls
 * the tool makes. A `workflow run` records the origin's `release` head as a dispatched run of that file, so a second pass reads it.
 */
const STUB = `
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const args = process.argv.slice(2);
const stdin = args.includes('-') ? fs.readFileSync(0, 'utf8') : undefined;
fs.appendFileSync(process.env.STUB_LOG, JSON.stringify({ args, stdin }) + '\\n');
const state = JSON.parse(fs.readFileSync(process.env.STUB_STATE, 'utf8'));
const save = () => fs.writeFileSync(process.env.STUB_STATE, JSON.stringify(state));
const field = (key) => { for (let i = 0; i < args.length - 1; i++) if ((args[i] === '-f' || args[i] === '-F') && args[i + 1].startsWith(key + '=')) return args[i + 1].slice(key.length + 1); };
const print = (value) => process.stdout.write(JSON.stringify(value));
if (args[0] === 'api' && args[1] === 'graphql') { print(state.graphql); process.exit(0); }
if (args[0] === 'api') {
  const method = args[2];
  const [route, query = ''] = args[3].split('?');
  const q = new URLSearchParams(query);
  let m;
  if (method === 'GET' && route === 'repos/{owner}/{repo}/labels') { print(q.get('page') === '1' ? state.labels : []); }
  else if (method === 'POST' && route === 'repos/{owner}/{repo}/labels') { state.labels.push({ name: field('name'), color: field('color'), description: field('description') }); save(); print({}); }
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
  else if (method === 'POST' && route === 'repos/{owner}/{repo}/releases/generate-notes') { print({ name: field('tag_name'), body: '## Fixes\\n* a fix, up to ' + field('target_commitish') }); }
  else if (method === 'GET' && (m = /^repos\\/\\{owner\\}\\/\\{repo\\}\\/actions\\/workflows\\/([^/]+)\\/runs$/.exec(route))) {
    print({ total_count: (state.runs[m[1]] || []).filter((sha) => sha === q.get('head_sha')).length });
  }
  else { process.stderr.write('stub gh: no answer for ' + args.join(' ')); process.exit(9); }
  process.exit(0);
}
if (args[0] === 'pr' && args[1] === 'create') {
  if (state.createFails) { process.stderr.write('pull request create failed: GraphQL: GitHub Actions is not permitted to create or approve pull requests (createPullRequest)'); process.exit(1); }
  const number = state.next++;
  state.pulls.push({ number, title: args[args.indexOf('--title') + 1], body: stdin, labels: [], merged_at: null, head: { ref: args[args.indexOf('--head') + 1] } });
  save(); process.stdout.write('https://github.com/o/r/pull/' + number + '\\n'); process.exit(0);
}
if (args[0] === 'workflow' && args[1] === 'run') {
  const sha = execFileSync('git', ['--git-dir', process.env.STUB_ORIGIN, 'rev-parse', 'refs/heads/' + args[args.indexOf('--ref') + 1]], { encoding: 'utf8' }).trim();
  (state.runs[args[2]] ||= []).push(sha); save(); process.exit(0);
}
if (args[0] === 'release' && args[1] === 'create') process.exit(0);
process.stderr.write('stub gh: no answer for ' + args.join(' ')); process.exit(9);
`;

type Call = { args: string[]; stdin?: string };

/** A scratch world: the origin, the clone the tool runs in, the stub's state and log. */
const world = () => {
  const root = scratch('release-');
  const origin = path.join(root, 'origin.git');
  const seed = path.join(root, 'seed');
  const clone = path.join(root, 'clone');
  const bin = path.join(root, 'bin');
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@t',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@t',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: path.join(root, 'gitconfig'),
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    STUB_LOG: path.join(root, 'gh.log'),
    STUB_STATE: path.join(root, 'state.json'),
    STUB_ORIGIN: origin,
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

/** More than a page of pull requests merged before the last release, whose commits are not in the range. */
const older = (): Pull[] => Array.from({ length: 130 }, (_, i) => merged(1000 + i, ['feature'], `${'0'.repeat(39)}${i % 10}`));

const has = (calls: Call[], ...words: string[]) => calls.some((call) => words.every((word) => call.args.includes(word)));
const named = (calls: Call[], ...words: string[]) => calls.filter((call) => words.every((word) => call.args.includes(word)));

test('pr rebuilds release from main at 1.0.0, opens its pull request labelled internal, and dispatches ci and release-label on it', () => {
  const w = world();
  const fix = w.land('a fix');
  const docs = w.land('some docs');
  w.state({
    pulls: [...older(), merged(1, ['fix'], fix), merged(2, ['docs'], docs), merged(3, [], w.legacy)],
    runs: {},
    labels: [],
    next: 900,
  });
  const ran = w.run('pr');
  assert.equal(ran.status, 0, ran.out);

  const release = w.git(w.origin, 'rev-parse', 'refs/heads/release');
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
  for (const file of ['ci.yml', 'release-label.yml'])
    assert.ok(has(ran.calls, 'workflow', 'run', file, '--ref', 'release'), `${file} dispatched`);
  assert.deepEqual(w.read().runs['ci.yml'], [release]);
});

test('a second pr with nothing moved pushes and dispatches nothing; with main moved it updates the same pull request and dispatches again', () => {
  const w = world();
  const feature = w.land('a feature');
  w.state({ pulls: [merged(1, ['feature'], feature)], runs: {}, labels: [], next: 900 });
  assert.equal(w.run('pr').status, 0);
  const first = w.git(w.origin, 'rev-parse', 'refs/heads/release');

  const again = w.run('pr');
  assert.equal(again.status, 0, again.out);
  assert.equal(w.git(w.origin, 'rev-parse', 'refs/heads/release'), first, 'release is not pushed again');
  assert.ok(!has(again.calls, 'workflow', 'run'), 'nothing is dispatched where the head has its runs');
  assert.ok(!has(again.calls, 'pr', 'create'), 'no second pull request');

  const fix = w.land('a fix after');
  w.state({ ...w.read(), pulls: [...w.read().pulls, merged(2, ['fix'], fix)] });
  const moved = w.run('pr');
  assert.equal(moved.status, 0, moved.out);
  const second = w.git(w.origin, 'rev-parse', 'refs/heads/release');
  assert.notEqual(second, first);
  assert.equal(w.git(w.origin, 'rev-parse', 'refs/heads/release^1'), fix, 'rebuilt on the moved main');
  assert.ok(!has(moved.calls, 'pr', 'create'), 'the same pull request is kept');
  assert.ok(has(moved.calls, 'PATCH', 'repos/{owner}/{repo}/pulls/900'), 'and updated');
  for (const file of ['ci.yml', 'release-label.yml']) assert.ok(has(moved.calls, 'workflow', 'run', file, '--ref', 'release'));
});

test('with every merged pull request internal, pr opens none and closes the one open', () => {
  const w = world();
  const cleanup = w.land('a cleanup');
  const open: Pull = { ...merged(900, ['internal'], null), title: 'release: v1.0.0', head: { ref: 'release' } };
  w.state({ pulls: [merged(1, ['internal'], cleanup), open], runs: {}, labels: [], next: 901 });
  const ran = w.run('pr');
  assert.equal(ran.status, 0, ran.out);
  assert.ok(!has(ran.calls, 'pr', 'create'));
  assert.ok(has(ran.calls, 'PATCH', 'repos/{owner}/{repo}/pulls/900', 'state=closed'), 'the open release pull request is closed');
  assert.ok(!has(ran.calls, 'workflow', 'run'));
});

test('REFUSED: GitHub refusing the token a pull request exits 1 naming the setting that allows it', () => {
  const w = world();
  const fix = w.land('a fix');
  w.state({ pulls: [merged(1, ['fix'], fix)], runs: {}, labels: [], next: 900, createFails: true });
  const ran = w.run('pr');
  assert.equal(ran.status, 1, ran.out);
  assert.ok(ran.out.includes(CREATE_SETTING), 'the refusal names the setting');
});

test('tag releases the version main names on the commit that set it, and does nothing once its tag is there', () => {
  const w = world();
  const fix = w.land('a fix');
  w.state({ pulls: [merged(1, ['fix'], fix)], runs: {}, labels: [], next: 900 });
  assert.equal(w.run('pr').status, 0);
  w.git(w.seed, 'fetch', '--quiet', 'origin', 'release');
  w.git(w.seed, 'merge', '--quiet', '--no-ff', '-m', 'Merge the release', 'FETCH_HEAD');
  const merge = w.git(w.seed, 'rev-parse', 'HEAD');
  w.git(w.seed, 'push', '--quiet', 'origin', 'main');
  w.land('a change after the release');

  const ran = w.run('tag');
  assert.equal(ran.status, 0, ran.out);
  assert.ok(has(ran.calls, 'release', 'create', 'v1.0.0', '--target', merge), 'released on the first-parent commit that set 1.0.0');
  const notes = named(ran.calls, 'repos/{owner}/{repo}/releases/generate-notes');
  assert.ok(notes[0]?.args.includes('previous_tag_name=v0.3.0'));
  assert.ok(named(ran.calls, 'release', 'create')[0].stdin?.endsWith(merge), 'the release carries the notes generated up to it');

  w.git(w.seed, 'tag', 'v1.0.0', merge);
  w.git(w.seed, 'push', '--quiet', 'origin', 'v1.0.0');
  const again = w.run('tag');
  assert.equal(again.status, 0, again.out);
  assert.deepEqual(again.calls, [], 'a released version calls nothing');
});

test('tag does nothing where package.json names no version', () => {
  const w = world();
  w.state({ pulls: [], runs: {}, labels: [], next: 900 });
  const ran = w.run('tag');
  assert.equal(ran.status, 0, ran.out);
  assert.deepEqual(ran.calls, []);
});

test('labels makes the five missing labels and leaves one that is right alone', () => {
  const w = world();
  w.state({
    pulls: [],
    runs: {},
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

/** The proof's GraphQL answer: the head's check runs, as `[name, conclusion, isRequired]`. */
const answer = (runs: [string, string, boolean][]) => ({
  data: {
    repository: {
      pullRequest: {
        headRefOid: 'abc',
        mergeStateStatus: 'CLEAN',
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc',
                statusCheckRollup: {
                  contexts: {
                    nodes: runs.map(([name, conclusion, isRequired]) => ({
                      __typename: 'CheckRun',
                      name,
                      status: 'COMPLETED',
                      conclusion,
                      isRequired,
                    })),
                  },
                },
              },
            },
          ],
        },
      },
    },
  },
});

const LOWERED = { [PROOF_BOUND_ENV]: '400', [PROOF_INTERVAL_ENV]: '50' };

test('proof passes where ci is green and required on the head, and fails where it is green and not required, or never comes', () => {
  const w = world();
  const open: Pull = { ...merged(900, ['internal'], null), head: { ref: 'release' } };
  const proving = (runs: [string, string, boolean][]) => {
    w.state({ pulls: [open], runs: {}, labels: [], next: 901, graphql: answer(runs) });
    return w.run('proof', LOWERED);
  };
  const green = proving([
    ['ci', 'SUCCESS', true],
    ['release-label', 'SUCCESS', false],
  ]);
  assert.equal(green.status, 0, green.out);
  const query = named(green.calls, 'api', 'graphql')[0];
  assert.ok(query.args.includes('number=900'), "the proof asks about the release pull request's own number");
  assert.ok(query.args.some((arg) => arg.includes('isRequired(pullRequestNumber: $number)')));

  const uncounted = proving([
    ['ci', 'SUCCESS', false],
    ['release-label', 'SUCCESS', false],
  ]);
  assert.equal(uncounted.status, 1, uncounted.out);

  const absent = proving([['release-label', 'SUCCESS', false]]);
  assert.equal(absent.status, 1, absent.out);
  assert.ok(named(absent.calls, 'api', 'graphql').length >= 2, 'it asked again before its bound');
});
