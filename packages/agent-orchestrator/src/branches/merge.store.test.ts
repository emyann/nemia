/**
 * The merge check (`mergesOnto`, `mergeWord`), against a real repository: a branch that merges cleanly, one that conflicts, and one git
 * does not have; and the entry that serves it (`MERGES`), refusing a run the store does not have. `WF_ROOT` is set before the import,
 * since the store reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';

process.env.WF_ROOT = scratch('wf-merge-root-');
const { mergesOnto, mergeWord } = await import('./merge.store.ts');
const { MERGES } = await import('./merges.verb.ts');

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

test('a branch merges cleanly, then conflicts once main writes its file otherwise, and the checkout is untouched', () => {
  const { repo, git, commit } = repoOf();
  git('checkout', '-q', '-b', 'wf/r-1/implement');
  commit('src/a.ts', 'export const a = 1;\n', 'implement');
  git('checkout', '-q', 'main');
  const clean = mergesOnto(repo, 'main', 'wf/r-1/implement');
  assert.deepEqual(clean, { clean: true });
  assert.equal(mergeWord(clean, 'main'), 'merges cleanly onto main');
  commit('src/a.ts', 'export const a = 2;\n', 'main writes a.ts too');
  const conflicted = mergesOnto(repo, 'main', 'wf/r-1/implement');
  assert.deepEqual(conflicted, { clean: false, conflicts: ['src/a.ts'] });
  assert.equal(mergeWord(conflicted, 'main'), 'conflicts with main in 1 file: src/a.ts');
  assert.equal(mergeWord({ clean: false, conflicts: ['a', 'b'] }, 'main'), 'conflicts with main in 2 files: a, b');
  assert.equal(git('status', '--porcelain'), '', "a trial in git's object store alone");
});

test("a branch git does not have is neither clean nor conflicted: it carries git's own word for why it cannot say", () => {
  const { repo } = repoOf();
  const gone = mergesOnto(repo, 'main', 'wf/no-such-run/implement');
  assert.ok('error' in gone && /no-such-run/.test(gone.error), JSON.stringify(gone));
  assert.equal(mergeWord({ error: 'no such ref' }, 'main'), 'whether it merges onto main is not known: no such ref');
});

test("REFUSED: the merge check of a run the store does not have, in the store's words whole", async () => {
  await assert.rejects(MERGES.handler({} as never, { runId: 'r-none', branches: ['wf/r-none/implement'] }), (err: Error) => {
    assert.equal(err.message, "no such run: r-none  (try 'nemia ls')");
    return true;
  });
});
