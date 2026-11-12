/**
 * The one reach of the orchestrator: its own CLI entry, spawned with the argv, never imported (docs/architecture.md: spawning a package's
 * bin is using its CLI). The verbs about this machine (`MACHINE_VERBS`) and a help of one run there, with this process's environment, and
 * so does the starter this client spawns to start this machine's daemon on demand (`daemon --json`, `src/daemon.ts`); no store verb does.
 */
import { spawn } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

/** Which entry to spawn: `nemia`'s, or the `wf` alias's, which prints its hint first. */
export type Entry = 'nemia' | 'wf';

/** The orchestrator's CLI entry, resolved through its package's `exports`. */
export const entryOf = (entry: Entry): string =>
  fileURLToPath(import.meta.resolve(entry === 'wf' ? 'agent-orchestrator/bin/wf' : 'agent-orchestrator/bin'));

/** Whether `--local` was typed among `argv`: refused by the route (`routeOf`), never passed on. */
export const unlocal = (argv: readonly string[]): boolean => argv.includes('--local');

/** How the child's stdout is taken: shown as this process's own, or kept and answered. */
type Out = 'inherit' | 'pipe';

/**
 * The orchestrator's CLI on `argv` with this process's stderr and `env`, its stdin this process's or the text `input` where one is
 * given, its stdout shown or kept as `out` says; answers its exit code — 128 and the signal's number when a signal ended it — and what it
 * printed where it was kept. A signal this process takes is passed on to it, so a Ctrl-C ends the child, which ends here.
 */
function run(
  argv: readonly string[],
  entry: Entry,
  env: NodeJS.ProcessEnv,
  out: Out,
  input?: string,
): Promise<{ code: number; stdout: string }> {
  const child = spawn(process.execPath, [entryOf(entry), ...argv], {
    stdio: [input === undefined ? 'inherit' : 'pipe', out, 'inherit'],
    env,
  });
  child.stdin?.end(input);
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

/** Runs the orchestrator's CLI on `argv` with this process's stdio and `env`, and answers its exit code (`run`). */
export const spawned = (argv: readonly string[], entry: Entry = 'nemia', env: NodeJS.ProcessEnv = process.env): Promise<number> =>
  run(argv, entry, env, 'inherit').then(({ code }) => code);

/** Runs the orchestrator's CLI on `argv` as `spawned` does, the text `input` its stdin, and answers its exit code. */
export const piped = (
  argv: readonly string[],
  input: string,
  entry: Entry = 'nemia',
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> => run(argv, entry, env, 'inherit', input).then(({ code }) => code);

/**
 * Runs `nemia <argv>` in process as `spawned` does, its stdout kept and answered beside its exit code: what a command's answer is read
 * off.
 */
export const captured = (argv: readonly string[], env: NodeJS.ProcessEnv = process.env): Promise<{ code: number; stdout: string }> =>
  run(argv, 'nemia', env, 'pipe');
