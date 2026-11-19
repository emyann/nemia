/**
 * The person's own Claude Code session, started by `nemia factory home` (`ownSessionRun`): the client's third process beside
 * `src/local.ts` and `src/browser.ts`. `claude` is found on the person's PATH and run with their terminal, in the copy of the home, with
 * the flags and the environment `ownSessionOf` decided; a signal this process takes is passed on to it, and its exit code is answered.
 */
import { spawn } from 'node:child_process';
import os from 'node:os';
import type { OwnSession } from './own-session.ts';
import { Refused } from '../refused.ts';

/** The program a person's session runs: Claude Code's command, found on PATH. */
export const SESSION_PROGRAM = 'claude';

/**
 * Runs the person's session `start` with their terminal, and answers its exit code — 128 and the signal's number when a signal ended it.
 * Refused, exit 2, where Claude Code is not on PATH, naming how to install it and the command to type again.
 * @param start The session as `ownSessionOf` started it.
 * @param env The person's environment, which the session's adds to.
 * @param again The command that opens the session again, named where Claude Code is missing.
 */
export function ownSessionRun(start: Extract<OwnSession, { kind: 'start' }>, env: NodeJS.ProcessEnv, again: string) {
  const argv = start.flags.flatMap((f) => [f.name, f.value]);
  const child = spawn(SESSION_PROGRAM, argv, { cwd: start.cwd, env: { ...env, ...start.env }, stdio: 'inherit' });
  const forward = (signal: NodeJS.Signals) => () => void child.kill(signal);
  const handlers = (['SIGINT', 'SIGTERM', 'SIGHUP'] as const).map((signal) => [signal, forward(signal)] as const);
  for (const [signal, handler] of handlers) process.on(signal, handler);
  const off = () => {
    for (const [name, handler] of handlers) process.off(name, handler);
  };
  return new Promise((resolve, reject) => {
    child.on('error', (err: NodeJS.ErrnoException) => {
      off();
      reject(
        err.code === 'ENOENT'
          ? new Refused(
              `${SESSION_PROGRAM} is not on your PATH: install Claude Code (npm install -g @anthropic-ai/claude-code), then type ${again} again.`,
            )
          : err,
      );
    });
    child.on('close', (code, signal) => {
      off();
      resolve(code ?? 128 + (signal === null ? 0 : os.constants.signals[signal]));
    });
  }) satisfies Promise<number>;
}
