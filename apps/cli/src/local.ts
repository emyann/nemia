/**
 * The one reach of the orchestrator: its own CLI entry, spawned with the argv, never imported. Every verb this client has not moved, a
 * help, and a read typed with `--local` run there, exactly as they did before the client (docs/architecture.md: spawning a package's
 * bin is using its CLI).
 */
import { spawn } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

/** Which entry to spawn: `nemia`'s, or the `wf` alias's, which prints its hint first. */
export type Entry = 'nemia' | 'wf';

/** The orchestrator's CLI entry, resolved through its package's `exports`. */
export const entryOf = (entry: Entry): string =>
  fileURLToPath(import.meta.resolve(entry === 'wf' ? 'agent-orchestrator/bin/wf' : 'agent-orchestrator/bin'));

/** `argv` without `--local`, which this client reads and the old path does not know. */
export const unlocal = (argv: readonly string[]): string[] => argv.filter((word) => word !== '--local');

/**
 * Runs the orchestrator's CLI on `argv` with this process's stdio and environment, and answers its exit code: 128 and the signal's number
 * when a signal ended it. A signal this process takes is passed on to it, so a Ctrl-C ends the child, which ends here.
 */
export function spawned(argv: readonly string[], entry: Entry = 'nemia', env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const child = spawn(process.execPath, [entryOf(entry), ...argv], { stdio: 'inherit', env });
  const forward = (signal: NodeJS.Signals) => () => void child.kill(signal);
  const handlers = (['SIGINT', 'SIGTERM', 'SIGHUP'] as const).map((signal) => [signal, forward(signal)] as const);
  for (const [signal, handler] of handlers) process.on(signal, handler);
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      for (const [name, handler] of handlers) process.off(name, handler);
      resolve(code ?? 128 + (signal === null ? 0 : os.constants.signals[signal]));
    });
  });
}
