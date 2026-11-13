/**
 * What the two files that drive sdlc's landing script share (`landing.boundary.test.ts`, its merge and its receipt, and
 * `refresh.boundary.test.ts`, the refresh a merge makes of a branch that lacks its base): the script's path, a bounded run of one of its
 * verbs in a checkout with the stub `gh` of `origin.ts` first on the PATH, the calls of that stub picked by their words, a file holding
 * a merge commit's body, and where a checkout stands. Two files and not one, since together they pass the 800 lines a file stops at.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { type Called, type Gh, gitIn } from './origin.ts';

/** The carried folder, where the landing and the helpers it shares with the pull-request script are kept once. */
export const CARRIED = path.join(import.meta.dirname, '..', 'sdlc', 'carried');

/** The landing script. */
export const SCRIPT = path.join(CARRIED, 'landing.ts');

/** What a run of the script did: its exit, its streams, and the calls the stub `gh` was given. */
export type Ran = { code: number | null; out: string; err: string; calls: Called[] };

/** Run the script's `verb` in `repo` with `args` and the stub `gh`, bounded; `more` adds to its environment. */
export function landIn(repo: string, gh: Gh, verb: string, args: string[] = [], more: Record<string, string> = {}): Ran {
  const ran = spawnSync(process.execPath, [SCRIPT, verb, ...args], {
    cwd: repo,
    env: {
      PATH: `${gh.bin}${path.delimiter}${process.env.PATH ?? ''}`,
      HOME: repo,
      WF_STEP: 'land',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@t',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@t',
      ...gh.env(),
      ...more,
    },
    encoding: 'utf8',
    timeout: 60_000,
  });
  return { code: ran.status, out: ran.stdout, err: ran.stderr, calls: gh.calls() };
}

/** The calls of the stub `gh` that begin with `words`. */
export const asked = (calls: readonly Called[], ...words: string[]): Called[] =>
  calls.filter((call) => words.every((word, i) => call.argv[i] === word));

/** A file holding the merge commit's body, in `dir` (a scratch folder of its own where none is given): its path. */
export function body(text = 'What landed, and why.\n\nRun r-1: 1 commit.\n', dir = scratch('wf-land-files-')): string {
  const file = path.join(dir, 'merge-body.md');
  fs.writeFileSync(file, text);
  return file;
}

/** Where the checkout stands: the branch it is on, its HEAD, whether it is clean, and whether a merge is in progress. */
export const stands = (repo: string): { branch: string; head: string; clean: boolean; merging: boolean } => ({
  branch: gitIn(repo, 'symbolic-ref', '--short', 'HEAD').trim(),
  head: gitIn(repo, 'rev-parse', 'HEAD').trim(),
  clean: gitIn(repo, 'status', '--porcelain', '--untracked-files=no').trim() === '',
  merging: spawnSync('git', ['-C', repo, 'rev-parse', '-q', '--verify', 'MERGE_HEAD']).status === 0,
});
