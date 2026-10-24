/**
 * The merge check (`mergesOf`), against a run on a real repository and the git place's trial merges: a branch that merges cleanly, one
 * that conflicts, and one git does not have; and the entry that serves it (`MERGES`), refusing a run the store does not have. `WF_ROOT`
 * is set before the import, since the store reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import { promised } from '../../test/promised.ts';
import { runOver } from '../../test/placed.ts';

process.env.WF_ROOT = scratch('wf-merge-root-');
const { MERGES, mergesOf } = await import('./merges.verb.ts');
const { builtinGitPlace } = await import('../place/builtin.store.ts');
const { runWith: runEngine } = await import('../runtime-client.ts');
const { gitPlaceLayer } = await import('../place/builtin.store.ts');
const runWith = runOver(runEngine, gitPlaceLayer);

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
function runOn(id: string, repo: string): void {
  const file = path.join(process.env.WF_ROOT ?? '', 'runs', `${id}.json`);
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

test('a branch merges cleanly, then conflicts once main writes its file otherwise, and the checkout is untouched', () => {
  const { repo, git, commit } = repoOf();
  git('checkout', '-q', '-b', 'wf/r-1/implement');
  commit('src/a.ts', 'export const a = 1;\n', 'implement');
  git('checkout', '-q', 'main');
  runOn('r-1', repo);
  assert.deepEqual(mergesOf(builtinGitPlace, 'r-1', ['wf/r-1/implement']), {
    'wf/r-1/implement': { clean: true, said: 'merges cleanly onto main' },
  });
  commit('src/a.ts', 'export const a = 2;\n', 'main writes a.ts too');
  assert.deepEqual(mergesOf(builtinGitPlace, 'r-1', ['wf/r-1/implement']), {
    'wf/r-1/implement': { clean: false, conflicts: ['src/a.ts'], said: 'conflicts with main in 1 file: src/a.ts' },
  });
  assert.equal(git('status', '--porcelain'), '', "a trial in git's object store alone");
});

test("a branch git does not have is neither clean nor conflicted: it carries git's own word for why it cannot say", () => {
  const { repo } = repoOf();
  runOn('r-2', repo);
  const gone = mergesOf(builtinGitPlace, 'r-2', ['wf/no-such-run/implement'])['wf/no-such-run/implement'];
  assert.ok('error' in gone && /no-such-run/.test(gone.error), JSON.stringify(gone));
  assert.match(gone.said, /^whether it merges onto main is not known: .*no-such-run/);
});

test("REFUSED: the merge check of a run the store does not have, in the store's words whole", async () => {
  await assert.rejects(runWith(promised({}), MERGES.handler({ runId: 'r-none', branches: ['wf/r-none/implement'] })), (err: Error) => {
    assert.equal(err.message, "no such run: r-none  (try 'nemia ls')");
    return true;
  });
});
