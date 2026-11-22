/**
 * `due.ts` run as CI runs it: a child process in a scratch git repository with a planted root `package.json`, `turbo.json` and the
 * manifests of the workspaces its table names, the job as its argument, the leg and the range given by env, the answer read from the
 * files `GITHUB_OUTPUT` and `GITHUB_STEP_SUMMARY` name.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';

const DUE = path.join(import.meta.dirname, '..', 'due.ts');

/** A git identity and no config of the machine's, so a commit here reads nothing of the person's. */
const GIT_ENV = {
  PATH: process.env.PATH ?? '',
  HOME: '',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_AUTHOR_NAME: 'guards',
  GIT_AUTHOR_EMAIL: 'guards@example.invalid',
  GIT_COMMITTER_NAME: 'guards',
  GIT_COMMITTER_EMAIL: 'guards@example.invalid',
};

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...GIT_ENV, HOME: cwd } }).trim();

const write = (root: string, file: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), text);
};

/** A workspace's manifest: its name, a test script, and the workspaces it depends on. */
const manifest = (name: string, ...deps: string[]) =>
  JSON.stringify({ name, scripts: { test: 'vitest run' }, devDependencies: Object.fromEntries(deps.map((dep) => [dep, '*'])) });

/**
 * A repository with the manifests committed, and its first commit's sha: the workspaces `due.ts`'s table names, `agent-orchestrator`
 * depending on `agent-runtime`, `api` on `agent-orchestrator`, `design-system` and `lib` on nothing, the guards depending on `lib`.
 */
const planted = () => {
  const root = scratch('guards-due-');
  git(root, 'init', '-q', '-b', 'main');
  write(
    root,
    'package.json',
    JSON.stringify({ name: 'r', private: true, workspaces: ['packages/*', 'apps/*', 'tools/guards', 'tools/design-system'] }),
  );
  write(root, 'packages/lib/package.json', manifest('lib'));
  write(root, 'packages/agent-runtime/package.json', manifest('agent-runtime'));
  write(root, 'packages/agent-orchestrator/package.json', manifest('agent-orchestrator', 'agent-runtime'));
  write(root, 'packages/objects/package.json', manifest('objects'));
  write(root, 'packages/templates/package.json', manifest('templates', 'agent-orchestrator'));
  write(root, 'apps/api/package.json', manifest('api', 'agent-orchestrator'));
  write(root, 'apps/cli/package.json', manifest('cli', 'api'));
  write(root, 'apps/web/package.json', manifest('web', 'objects'));
  write(root, 'tools/guards/package.json', manifest('guards', 'lib', 'typescript'));
  write(root, 'tools/design-system/package.json', manifest('design-system'));
  write(
    root,
    'turbo.json',
    JSON.stringify({ tasks: { 'guards#test': { inputs: ['$TURBO_DEFAULT$', '$TURBO_ROOT$/workflows/**', '$TURBO_ROOT$/turbo.json'] } } }),
  );
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'first');
  return { root, first: git(root, 'rev-parse', 'HEAD') };
};

/** A commit of `file` on top, and its sha. */
const commit = (root: string, file: string) => {
  write(root, file, 'x\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', file);
  return git(root, 'rev-parse', 'HEAD');
};

/** The CLI run in `root` with `args` and exactly `env`, and fresh files to append to: its exit code and what it appended to each. */
const run = (root: string, args: string[], env: Record<string, string>) => {
  const out = scratch('guards-due-out-');
  const output = path.join(out, 'output');
  const summary = path.join(out, 'summary');
  fs.writeFileSync(output, '');
  fs.writeFileSync(summary, '');
  const child = spawnSync(process.execPath, [DUE, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...GIT_ENV,
      HOME: root,
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: summary,
      GITHUB_EVENT_NAME: '',
      BASE: '',
      HEAD_SHA: '',
      BEFORE: '',
      GITHUB_SHA: '',
      LEG: '',
      ...env,
    },
  });
  return { status: child.status, output: fs.readFileSync(output, 'utf8'), summary: fs.readFileSync(summary, 'utf8') };
};

const guards = (root: string, env: Record<string, string>) => run(root, ['guards'], env);

test('a push touching a workflow file is due the guards', () => {
  const { root, first } = planted();
  const after = commit(root, 'workflows/x.md');
  const answer = guards(root, { GITHUB_EVENT_NAME: 'push', BEFORE: first, GITHUB_SHA: after });
  assert.equal(answer.status, 0);
  assert.equal(answer.output, 'due=true\n');
});

test('a push touching only a web source is not due the guards', () => {
  const { root, first } = planted();
  const after = commit(root, 'apps/web/src/x.tsx');
  const answer = guards(root, { GITHUB_EVENT_NAME: 'push', BEFORE: first, GITHUB_SHA: after });
  assert.equal(answer.status, 0);
  assert.equal(answer.output, 'due=false\n');
});

test('a push touching a dependency of the guards is due', () => {
  const { root, first } = planted();
  const after = commit(root, 'packages/lib/src/x.ts');
  assert.equal(guards(root, { GITHUB_EVENT_NAME: 'push', BEFORE: first, GITHUB_SHA: after }).output, 'due=true\n');
});

test('a pull request touching only a web source is not due the guards, and one touching a workflow is', () => {
  const { root, first } = planted();
  const web = commit(root, 'apps/web/src/x.tsx');
  assert.equal(guards(root, { GITHUB_EVENT_NAME: 'pull_request', BASE: first, HEAD_SHA: web }).output, 'due=false\n');
  const flow = commit(root, 'workflows/y.md');
  assert.equal(guards(root, { GITHUB_EVENT_NAME: 'pull_request', BASE: first, HEAD_SHA: flow }).output, 'due=true\n');
});

test("a branch's first push, whose before is all zeros, is due", () => {
  const { root } = planted();
  const after = commit(root, 'apps/web/src/x.tsx');
  const answer = guards(root, { GITHUB_EVENT_NAME: 'push', BEFORE: '0'.repeat(40), GITHUB_SHA: after });
  assert.equal(answer.status, 0);
  assert.equal(answer.output, 'due=true\n');
});

test('a range git cannot resolve is due', () => {
  const { root } = planted();
  const after = commit(root, 'apps/web/src/x.tsx');
  assert.equal(guards(root, { GITHUB_EVENT_NAME: 'push', BEFORE: 'f'.repeat(40), GITHUB_SHA: after }).output, 'due=true\n');
});

test('a workflow_dispatch is due', () => {
  const { root } = planted();
  const answer = guards(root, { GITHUB_EVENT_NAME: 'workflow_dispatch' });
  assert.equal(answer.status, 0);
  assert.equal(answer.output, 'due=true\n');
});

test('an input of a shape it does not read exits 1 and answers nothing', () => {
  const { root, first } = planted();
  write(root, 'turbo.json', JSON.stringify({ tasks: { 'guards#test': { inputs: ['$TURBO_ROOT$/{a,b}/**'] } } }));
  const after = commit(root, 'workflows/x.md');
  const answer = guards(root, { GITHUB_EVENT_NAME: 'push', BEFORE: first, GITHUB_SHA: after });
  assert.equal(answer.status, 1);
  assert.equal(answer.output, '');
  assert.equal(answer.summary, '');
});

test("a matrix leg reads its key off LEG: a push is due the leg of the workspace it touched and of each depending on it, and no other's", () => {
  const { root, first } = planted();
  const after = commit(root, 'packages/agent-runtime/src/x.ts');
  const push = { GITHUB_EVENT_NAME: 'push', BEFORE: first, GITHUB_SHA: after };
  const leg = (workspace: string) => run(root, ['test'], { ...push, LEG: workspace });
  assert.equal(leg('agent-runtime').output, 'due=true\n', 'the workspace touched');
  assert.equal(leg('agent-orchestrator').output, 'due=true\n', 'a workspace depending on it');
  assert.equal(leg('api').output, 'due=true\n', 'a workspace depending on it through another');
  assert.equal(leg('objects').output, 'due=false\n', 'a workspace that does not reach it');
  assert.equal(run(root, ['contracts'], { ...push, LEG: 'observe' }).output, 'due=true\n', "the contracts leg of the runtime's file");
  assert.equal(run(root, ['e2e-look'], push).output, 'due=false\n', 'the look, which reaches the board alone');
});

test('a push touching the lockfile is due every leg', () => {
  const { root, first } = planted();
  const after = commit(root, 'package-lock.json');
  assert.equal(run(root, ['test'], { GITHUB_EVENT_NAME: 'push', BEFORE: first, GITHUB_SHA: after, LEG: 'objects' }).output, 'due=true\n');
});

test('no job, and a key no claim holds, exit 1 and answer nothing', () => {
  const { root, first } = planted();
  const after = commit(root, 'workflows/x.md');
  const push = { GITHUB_EVENT_NAME: 'push', BEFORE: first, GITHUB_SHA: after };
  for (const [args, env, what] of [
    [[], push, 'no job'],
    [['nothing'], push, 'an unknown job'],
    [['test'], { ...push, LEG: 'nothing' }, 'an unknown leg'],
    [['test'], push, 'a matrix job with no leg'],
  ] as const) {
    const answer = run(root, [...args], env);
    assert.equal(answer.status, 1, what);
    assert.equal(answer.output, '', what);
    assert.equal(answer.summary, '', what);
  }
});

test("the run's summary is given one line naming the key and whether its work runs", () => {
  const { root, first } = planted();
  const after = commit(root, 'apps/web/src/x.tsx');
  const push = { GITHUB_EVENT_NAME: 'push', BEFORE: first, GITHUB_SHA: after };
  const skipped = run(root, ['test'], { ...push, LEG: 'objects' }).summary;
  assert.equal(skipped.split('\n').filter(Boolean).length, 1);
  assert.ok(skipped.includes('test objects') && skipped.includes('not due'), skipped);
  const ran = run(root, ['test'], { ...push, LEG: 'web' }).summary;
  assert.ok(ran.includes('test web') && !ran.includes('not due'), ran);
});
