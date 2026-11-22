/**
 * The merge check (`mergesOf`), against a run on a real repository and the git place's trial merges: a branch that merges cleanly, one
 * that conflicts, and one git does not have; and a run the store does not have, refused.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { Missing } from '../refusal/refusal.ts';
import { mergesOf } from './merges.verb.ts';
import { atStore } from '../../testing.ts';
import { builtinGitPlace } from '../place/builtin.store.ts';

const ROOT = scratch('wf-merge-root-');

/** The merge check of the run `id` on the git place, the run's planted record imported first. */
const merged = (id: string, branches: readonly string[]) => atStore(ROOT, mergesOf(builtinGitPlace, id, branches));

/** A repository on `main` with `src/a.ts`, and its git. */
function repoOf() {
  const repo = scratch('wf-merge-repo-');
  const git = (...args: string[]) =>
    execFileSync(
      'git',
      ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args],
      { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
  const commit = (file: string, text: string, message: string) => {
    fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
    fs.writeFileSync(path.join(repo, file), text);
    git('add', '-A');
    git('commit', '-q', '-m', message);
  };
  git('init', '-q', '-b', 'main');
  commit('src/a.ts', 'export const a = 0;\n', 'base');
  return { repo, git, commit };
}

/** A repository run `id` on `repo`, branched from `main`, its record written as `nemia start` would. */
function runOn(id: string, repo: string) {
  const file = path.join(ROOT, 'runs', `${id}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({
      id,
      repo,
      workspace: repo,
      baseRef: 'main',
      branch: 'main',
      isolate: true,
      brief: 'b',
      createdAt: '2026-10-05T00:00:00.000Z',
      workflowDir: path.join(repo, 'no-such-workflow'),
      workflow: [{ name: 'implement', after: [], body: 'Do it.', harness: 'codex' }],
      steps: {},
    }),
  );
}

test('a branch merges cleanly, then conflicts once main writes its file otherwise, and the checkout is untouched', async () => {
  const { repo, git, commit } = repoOf();
  git('checkout', '-q', '-b', 'wf/r-1/implement');
  commit('src/a.ts', 'export const a = 1;\n', 'implement');
  git('checkout', '-q', 'main');
  runOn('r-1', repo);
  assert.deepEqual(await merged('r-1', ['wf/r-1/implement']), {
    'wf/r-1/implement': { clean: true, said: 'merges cleanly onto main' },
  });
  commit('src/a.ts', 'export const a = 2;\n', 'main writes a.ts too');
  assert.deepEqual(await merged('r-1', ['wf/r-1/implement']), {
    'wf/r-1/implement': { clean: false, conflicts: ['src/a.ts'], said: 'conflicts with main in 1 file: src/a.ts' },
  });
  assert.equal(git('status', '--porcelain'), '', "a trial in git's object store alone");
});

test("a branch git does not have is neither clean nor conflicted: it carries git's own word for why it cannot say", async () => {
  const { repo } = repoOf();
  runOn('r-2', repo);
  const gone = (await merged('r-2', ['wf/no-such-run/implement']))['wf/no-such-run/implement'];
  assert.ok('error' in gone && /no-such-run/.test(gone.error), JSON.stringify(gone));
  assert.match(gone.said, /^whether it merges onto main is not known: .*no-such-run/);
});

test('REFUSED: the merge check of a run the store does not have is `Missing`, naming the run', async () => {
  await assert.rejects(
    () => merged('r-none', ['wf/r-none/implement']),
    (err: Error) => err instanceof Missing && /r-none/.test(err.message),
  );
});
