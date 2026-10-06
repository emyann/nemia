/**
 * A `git` on a `PATH` of its own, for a test that counts what git is asked: it writes each call's arguments as a line of a file, refuses a
 * `for-each-ref` format that names `refuse` where one is given, as git does a field it does not know, and hands the rest to the git this
 * process finds.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';

/**
 * The planted git: `env`, the environment given with the planted git first on its `PATH`, and `said()`, each call's arguments so far, one
 * line each.
 */
export function plantedGit(env: NodeJS.ProcessEnv, refuse?: string) {
  const bin = scratch('wf-planted-git-');
  const calls = path.join(bin, 'calls');
  const real = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
  fs.writeFileSync(
    path.join(bin, 'git'),
    [
      '#!/bin/sh',
      `printf '%s\\n' "$*" >> '${calls}'`,
      ...(refuse ? [`case "$*" in *for-each-ref*${refuse}*) echo "fatal: unknown field name: ${refuse}" >&2; exit 128;; esac`] : []),
      `exec '${real}' "$@"`,
    ].join('\n'),
    { mode: 0o755 },
  );
  const said = (): string[] => (fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').trim().split('\n') : []);
  return { env: { ...env, PATH: `${bin}${path.delimiter}${env.PATH ?? ''}` }, said, bin };
}

/** How many `%(ahead-behind:…)` columns each `for-each-ref` among `said` lists, in the order git was asked. */
export const columnsListed = (said: readonly string[]): number[] =>
  said.filter((line) => line.startsWith('for-each-ref')).map((line) => line.split('%(ahead-behind:').length - 1);
