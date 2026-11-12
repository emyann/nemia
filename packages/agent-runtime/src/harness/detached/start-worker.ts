/**
 * How a detached run's worker is started: what is asked of its request before a run file is written (`startable`), and the worker
 * launched on that file, let go (`startWorker`) — in a scope of its own under a memory limit where the request asks for one.
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
 * memory limit that cannot be held (`scopeFor`), its attempt ending `unstartable`. Else what its plan carries of its limit
 * (`memoryLimit`, bytes) and the argv its worker is put behind (`argv`), each absent with no limit.
 */
export const startable = (r: SpawnRequest, at: ScopeAt): { memoryLimit?: number; argv?: string[] } => {
  if (!isDirectory(r.cwd)) throw new Error(`cwd ${r.cwd} is not a directory`);
  const scope = scopeFor(r, at);
  if (scope !== undefined && 'refused' in scope) throw new Error(scope.refused);
  return scope ?? {};
};

/**
 * Starts the detached worker on the run file `file`, in `cwd`, and lets it go: in its own process group, its streams closed, in the
 * engine's environment less its telemetry (`withoutTelemetry`), which a runner hands a session itself. With `scope`, the argv that
 * makes a scope under a memory limit (`scopeArgv`), the worker is run in it: `systemd-run --scope` runs it itself, as its parent, so
 * the pid, the group and the stop path are the worker's, and the worker sits beside its harness in the cgroup, outliving it there to
 * read what the cgroup saw. Answers the pid of the process launched, the worker's own (the spawn records it, `.launched`, so a look
 * tells a slow worker from a gone one), or `undefined` where the launch failed at once.
 */
export const startWorker = (file: string, cwd: string, scope: readonly string[] = []): number | undefined => {
  const [program, ...prefix] = [...scope, process.execPath];
  const env = withoutTelemetry(process.env);
  const child = spawn(program ?? process.execPath, [...prefix, WORKER, file], { detached: true, stdio: 'ignore', cwd, env });
  child.on('error', () => {});
  child.unref();
  countSpawn();
  return child.pid;
};
