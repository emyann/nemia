/**
 * Runs of a detached harness that is `sh`, against the REAL worker, whose start event (`HarnessSpec.start`) the worker reads off
 * whole lines of its stdout: the builders of `test/start-event.test.ts` and `test/unread-session.test.ts`.
 */
import { Effect } from 'effect';
import fs from 'node:fs';
import path from 'node:path';
import { detachedOps, type HarnessSpec, type StartEvent } from '../src/harness/detached/detached.ts';
import { scratch } from './scratch.ts';
import { until, type Waiter } from '../src/waits/index.ts';

/** A Codex thread's id, of the shape Codex prints. */
export const THREAD = '01a09996-d343-7932-8971-b2f209ba315b';

/** A harness that runs `script` under `sh`, whose start event is `start`. */
export const sh = (script: string, start: StartEvent, more: Partial<HarnessSpec> = {}): HarnessSpec => ({
  name: 'sh',
  command: () => ({ cmd: 'sh', args: ['-c', script] }),
  start,
  ...more,
});

/** A script that prints each of `lines` on stdout, a line each. */
export const printed = (...lines: string[]) => lines.map((l) => `printf '%s\\n' '${l}'`).join('; ');

/** Codex's start line, its thread's id `thread_id`. */
export const threadStarted = (thread_id: unknown) => JSON.stringify({ type: 'thread.started', thread_id });

/** The run file of the run under `name`, as the worker last wrote it. */
export const runFile = (root: string, name: string): Record<string, unknown> =>
  JSON.parse(fs.readFileSync(path.join(root, 'runs', 'sh', `${name.replace(/[^a-zA-Z0-9]+/g, '_')}.json`), 'utf8'));

/** The run file of the run under `name`, or nothing yet. */
export const runFileOr = (root: string, name: string): Record<string, unknown> => {
  try {
    return runFile(root, name);
  } catch {
    return {};
  }
};

/**
 * Spawns `spec`'s run under `name` and waits for its worker to write an end, then gives back its run file; `t`'s test fails if none
 * comes.
 */
export const ran = async (t: Waiter, spec: HarnessSpec, name = 'ae/t/1', root = scratch('ae-start-')) => {
  const ops = detachedOps(spec, root);
  await Effect.runPromise(ops.spawn({ name, brief: 'x', cwd: root }));
  await until(
    t,
    () => ![undefined, 'working'].includes(runFileOr(root, name).state as string | undefined),
    () => `${name} ended: its run file is ${JSON.stringify(runFileOr(root, name))}`,
    { everyMs: 100 },
  );
  return { ops, root, run: runFile(root, name) };
};
