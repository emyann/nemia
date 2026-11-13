/**
 * How a detached run's worker is started: what is asked of its request before a run file is written (`startable`), and the worker
 * launched on that file, let go (`startWorker`) — in a scope of its own where the host makes one, under a memory limit where the
 * request asks for one, and bare where an unlimited run's scope cannot be made after all (`bareIfRefused`).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withoutTelemetry } from '../telemetry.ts';
import { countSpawn } from '../../core/engine/tally.ts';
import { scopeFor, type ScopeAt } from '../scope.ts';
import type { SpawnRequest } from '../seam.ts';

/** The worker a detached run is spawned with, `bin/ae-worker.ts`, found from this file's own folder. */
export const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'bin', 'ae-worker.ts');

const isDirectory = (p: string) => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};

/**
 * Why `r` cannot be started here, thrown so the spawn is refused before a run file is written: a `cwd` that is no directory, and a
 * memory limit that cannot be held (`scopeFor`), its attempt ending `unstartable`. Else what its plan carries of its scope: its limit
 * (`memoryLimit`, bytes), absent with none, and `scoped` whenever the worker is put behind a scope's argv (`argv`), limited or not, which
 * tells the worker to record the scope's folder; both absent, with the argv, where the host makes no scope and the run has no limit.
 */
export const startable = (r: SpawnRequest, at: ScopeAt): { memoryLimit?: number; argv?: string[]; scoped?: true } => {
  if (!isDirectory(r.cwd)) throw new Error(`cwd ${r.cwd} is not a directory`);
  const scope = scopeFor(r, at);
  if (scope !== undefined && 'refused' in scope) throw new Error(scope.refused);
  return scope === undefined ? {} : { ...scope, scoped: true };
};

/**
 * Starts the detached worker on the run file `file`, in `cwd`, and lets it go: in its own process group, its streams closed, in the
 * engine's environment less its telemetry (`withoutTelemetry`), which a runner hands a session itself. With `scope`, the argv that
 * makes a scope (`scopeArgv`), the worker is run in it: `systemd-run --scope` runs it itself, as its parent, so the pid, the group and
 * the stop path are the worker's, and the worker sits beside its harness in the cgroup, outliving it there to read what the cgroup saw.
 * Its stderr then goes to `log`, the run's, appended, where `systemd-run` says why it made no scope.
 *
 * With `bareIfRefused`, for a run with no limit, behind a scope, the worker is started bare and handed the scope's argv
 * (`--scope-by`): it starts the worker that runs the session behind it, and runs the session itself, bare, where the scope's program
 * refuses (`bin/ae-worker.ts`). The probe (`scopeRefusal`) is asked once a process, and a user manager gone since it passed has
 * `systemd-run` exit before it runs anything: a session with no limit never needed a scope to run, so it starts as it did before
 * scopes, never refused for it.
 *
 * Answers the pid of the process launched (the spawn records it, `.launched`, so a look tells a slow worker from a gone one), or
 * `undefined` where the launch failed at once.
 */
export const startWorker = (
  file: string,
  cwd: string,
  scope: readonly string[] = [],
  { log, bareIfRefused = false }: { log?: string; bareIfRefused?: boolean } = {},
): number | undefined => {
  const handed = bareIfRefused && scope.length > 0;
  const [program, ...prefix] = handed ? [process.execPath] : [...scope, process.execPath];
  const env = withoutTelemetry(process.env);
  const err = scope.length > 0 && log !== undefined ? fs.openSync(log, 'a') : 'ignore';
  try {
    const child = spawn(program ?? process.execPath, [...prefix, WORKER, file, ...(handed ? ['--scope-by', ...scope] : [])], {
      detached: true,
      stdio: ['ignore', 'ignore', err],
      cwd,
      env,
    });
    child.on('error', () => {});
    child.unref();
    countSpawn();
    return child.pid;
  } finally {
    if (typeof err === 'number') fs.closeSync(err);
  }
};
