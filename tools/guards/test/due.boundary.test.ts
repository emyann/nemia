/**
 * `due.ts` run as CI runs it: a child process in a scratch git repository with a planted root `package.json`, `turbo.json` and
 * `tools/guards/package.json`, the range given by env, the answer read from the file `GITHUB_OUTPUT` names.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';

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

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...GIT_ENV, HOME: cwd } }).trim();

const write = (root: string, file: string, text: string): void => {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), text);
};

/** A repository with the three manifests committed, and its first commit's sha. */
const planted = (): { root: string; first: string } => {
  const root = scratch('guards-due-');
  git(root, 'init', '-q', '-b', 'main');
  write(root, 'package.json', JSON.stringify({ name: 'r', private: true, workspaces: ['packages/*', 'apps/*'] }));
  write(root, 'packages/lib/package.json', JSON.stringify({ name: 'lib' }));
  write(root, 'apps/web/package.json', JSON.stringify({ name: 'web' }));
  write(root, 'tools/guards/package.json', JSON.stringify({ name: 'guards', devDependencies: { lib: '*', typescript: '*' } }));
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
const commit = (root: string, file: string): string => {
  write(root, file, 'x\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', file);
  return git(root, 'rev-parse', 'HEAD');
};

/** The CLI run in `root` with exactly `env` and a fresh GITHUB_OUTPUT: its exit code and what it appended. */
const run = (root: string, env: Record<string, string>): { status: number | null; output: string } => {
  const output = path.join(scratch('guards-due-out-'), 'output');
  fs.writeFileSync(output, '');
  const child = spawnSync(process.execPath, [DUE], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...GIT_ENV,
      HOME: root,
      GITHUB_OUTPUT: output,
      GITHUB_EVENT_NAME: '',
      BASE: '',
      HEAD_SHA: '',
      BEFORE: '',
      GITHUB_SHA: '',
      ...env,
    },
  });
  return { status: child.status, output: fs.readFileSync(output, 'utf8') };
};

test('a push touching a workflow file is due', () => {
  const { root, first } = planted();
  const after = commit(root, 'workflows/x.md');
  const answer = run(root, { GITHUB_EVENT_NAME: 'push', BEFORE: first, GITHUB_SHA: after });
  assert.equal(answer.status, 0);
  assert.equal(answer.output, 'due=true\n');
});

test('a push touching only a web source is not due', () => {
  const { root, first } = planted();
  const after = commit(root, 'apps/web/src/x.tsx');
  const answer = run(root, { GITHUB_EVENT_NAME: 'push', BEFORE: first, GITHUB_SHA: after });
  assert.equal(answer.status, 0);
  assert.equal(answer.output, 'due=false\n');
});

test('a push touching a dependency of the guards is due', () => {
  const { root, first } = planted();
  const after = commit(root, 'packages/lib/src/x.ts');
  assert.equal(run(root, { GITHUB_EVENT_NAME: 'push', BEFORE: first, GITHUB_SHA: after }).output, 'due=true\n');
});

test('a pull request touching only a web source is not due, and one touching a workflow is', () => {
  const { root, first } = planted();
  const web = commit(root, 'apps/web/src/x.tsx');
  assert.equal(run(root, { GITHUB_EVENT_NAME: 'pull_request', BASE: first, HEAD_SHA: web }).output, 'due=false\n');
  const flow = commit(root, 'workflows/y.md');
  assert.equal(run(root, { GITHUB_EVENT_NAME: 'pull_request', BASE: first, HEAD_SHA: flow }).output, 'due=true\n');
});

test("a branch's first push, whose before is all zeros, is due", () => {
  const { root } = planted();
  const after = commit(root, 'apps/web/src/x.tsx');
  const answer = run(root, { GITHUB_EVENT_NAME: 'push', BEFORE: '0'.repeat(40), GITHUB_SHA: after });
  assert.equal(answer.status, 0);
  assert.equal(answer.output, 'due=true\n');
});

test('a range git cannot resolve is due', () => {
  const { root } = planted();
  const after = commit(root, 'apps/web/src/x.tsx');
  assert.equal(run(root, { GITHUB_EVENT_NAME: 'push', BEFORE: 'f'.repeat(40), GITHUB_SHA: after }).output, 'due=true\n');
});

test('a workflow_dispatch is due', () => {
  const { root } = planted();
  const answer = run(root, { GITHUB_EVENT_NAME: 'workflow_dispatch' });
  assert.equal(answer.status, 0);
  assert.equal(answer.output, 'due=true\n');
});

test('an input of a shape it does not read exits 1 and answers nothing', () => {
  const { root, first } = planted();
  write(root, 'turbo.json', JSON.stringify({ tasks: { 'guards#test': { inputs: ['$TURBO_ROOT$/{a,b}/**'] } } }));
  const after = commit(root, 'workflows/x.md');
  const answer = run(root, { GITHUB_EVENT_NAME: 'push', BEFORE: first, GITHUB_SHA: after });
  assert.equal(answer.status, 1);
  assert.equal(answer.output, '');
});
