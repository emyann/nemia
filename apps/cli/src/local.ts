/**
 * The one reach of the orchestrator: its own CLI entry, spawned with the argv, never imported. Every verb this client has not moved, a
 * help, and a read typed with `--local` run there, exactly as they did before the client (docs/architecture.md: spawning a package's
 * bin is using its CLI); under a remote context, a verb about the store is spawned there forwarded (`forwardedEnv`), to call the
 * daemon's endpoints.
 */
import { spawn } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { chosenOf } from './context.ts';
import { forwardedEnv } from './where.ts';

/** Which entry to spawn: `nemia`'s, or the `wf` alias's, which prints its hint first. */
export type Entry = 'nemia' | 'wf';

/** The orchestrator's CLI entry, resolved through its package's `exports`. */
export const entryOf = (entry: Entry): string =>
  fileURLToPath(import.meta.resolve(entry === 'wf' ? 'agent-orchestrator/bin/wf' : 'agent-orchestrator/bin'));

/** `argv` without `--local`, which this client reads and the old path does not know. */
export const unlocal = (argv: readonly string[]): string[] => argv.filter((word) => word !== '--local');

/** How the child's stdout is taken: shown as this process's own, or kept and answered. */
type Out = 'inherit' | 'pipe';

/**
 * The orchestrator's CLI on `argv` with this process's stdin, stderr and `env`, its stdout shown or kept as `out` says; answers its exit
 * code — 128 and the signal's number when a signal ended it — and what it printed where it was kept. A signal this process takes is passed
 * on to it, so a Ctrl-C ends the child, which ends here.
 */
function run(argv: readonly string[], entry: Entry, env: NodeJS.ProcessEnv, out: Out): Promise<{ code: number; stdout: string }> {
  const child = spawn(process.execPath, [entryOf(entry), ...argv], { stdio: ['inherit', out, 'inherit'], env });
  let stdout = '';
  child.stdout?.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
  const forward = (signal: NodeJS.Signals) => () => void child.kill(signal);
  const handlers = (['SIGINT', 'SIGTERM', 'SIGHUP'] as const).map((signal) => [signal, forward(signal)] as const);
  for (const [signal, handler] of handlers) process.on(signal, handler);
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code, signal) => {
      for (const [name, handler] of handlers) process.off(name, handler);
      resolve({ code: code ?? 128 + (signal === null ? 0 : os.constants.signals[signal]), stdout });
    });
  });
}

/**
 * Runs the orchestrator's CLI on `argv` with this process's stdio and `env` (this process's environment, or the forwarded one,
 * `forwardedEnv`), and answers its exit code (`run`).
 */
export const spawned = (argv: readonly string[], entry: Entry = 'nemia', env: NodeJS.ProcessEnv = process.env): Promise<number> =>
  run(argv, entry, env, 'inherit').then(({ code }) => code);

/**
 * The words a moved read does not read itself (`inbox rm`, `ls <run>`), handed to the old path as `spawned` runs them; forwarded under a
 * remote context (`forwardedEnv`), as the route forwards a verb about the store only that path has: run on this machine's store, they
 * would act on it, not on the daemon's the context names.
 */
export const handedOn = (argv: readonly string[], env: NodeJS.ProcessEnv = process.env): Promise<number> => {
  const chosen = chosenOf(env);
  return spawned(argv, 'nemia', chosen.kind === 'remote' ? forwardedEnv(chosen, env) : env);
};

/**
 * Runs `nemia <argv>` in process as `spawned` does, its stdout kept and answered beside its exit code: what a command's answer is read
 * off.
 */
export const captured = (argv: readonly string[], env: NodeJS.ProcessEnv = process.env): Promise<{ code: number; stdout: string }> =>
  run(argv, 'nemia', env, 'pipe');
