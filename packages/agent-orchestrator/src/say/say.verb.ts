/**
 * `wf say`: tell a step's running session something (`say`), through the engine, which journals the words; and why an ask cannot be
 * written where a file that is not one stands (`strayAsk`), which `wf retry` and `wf round` say. A controller, reaching the runtime through
 * the client (`runtime-client.ts`).
 */
import type { Engine } from './runtime-client.ts';
import { tryOf, type Run } from './record/record.ts';
import { sayRefusal, type Said } from './say/say.ts';
import { type RoundAsk } from './status/status.ts';
import { type RetryAsk } from './retry/index.ts';
import { lstatOf, readRun, stepsOf } from './record/record.store.ts';
import { phaseOfView } from './views.ts';
import { Conflict } from './refusal/refusal.ts';

/** What `wf say` did: the step's task the words were said to, the try that task is, and the engine's `said` entry, as it journalled it. */
export type Told = { run: Run; taskId: string; try: number; said: Said };

/**
 * Tell a step's running session something — `wf say` — through the engine's `say`, on the step's current try's task: the one `retry` would
 * replace, as `run.steps[step].taskId` names it. The engine hands the words to the session through its harness, then journals them as a
 * `said` entry on the task, which is the record: this verb writes nothing of its own, and `wf ls` and `wf decide` read the words back off
 * the engine's view of the task. Only the step's own task is read: the engine's `say` observes its harness again, and a run's other tasks
 * have no part in it.
 *
 * Refused before the engine is asked, with what to do instead (`sayRefusal`): a step the run does not have, a cancelled run, a step with no
 * task filed, and one whose task has settled — each a `Conflict`. Then the engine's refusals, each a `Conflict` in the engine's words —
 * empty words, an attempt not started, a harness with no way in, a session its harness does not list running — and a failure to deliver,
 * as the engine throws it, which journals nothing and has no exit code: ask again.
 */
export async function say(e: Engine, id: string, stepName: string, text: string): Promise<Told> {
  const run = readRun(id);
  const steps = stepsOf(run);
  const taskId = run.steps[stepName]?.taskId;
  const phase = taskId ? phaseOfView(await e.view(taskId)) : 'unknown';
  const refused = sayRefusal(steps, run, stepName, () => phase);
  if (refused) throw new Conflict({ message: refused });
  const said = await e.say(taskId!, text).catch((err: unknown) => {
    throw (err as { exitCode?: unknown }).exitCode === 2 ? new Conflict({ message: (err as Error).message }) : err;
  });
  return { run, taskId: taskId!, try: tryOf(run, stepName), said };
}

/**
 * Why an ask cannot be written where a file that is not one already stands, in words that name it — or null, when there is none: the file reads
 * as an ask, or it is gone, consumed by a pass since the verb looked. `read` is the file read as the tick reads it (`askIn`, `roundAskIn`).
 *
 * An ask is written under its try's name, exclusively, and never over a file there. One that does not read as an ask — `{}`, a hand edit, a torn
 * copy — is honoured by no pass, and `wf ls` shows nothing asked, so "already asked for, wait for it" would be a wait for ever. The way out is a
 * person's: delete the file, and ask again.
 */
export function strayAsk(file: string, read: RetryAsk | RoundAsk | string, what: string, again: string): string | null {
  if (typeof read !== 'string' || !lstatOf(file)) return null;
  return `${what} cannot be asked for: ${file} is already there, and it is not an ask — ${read}. No tick honours it, and wf ls shows nothing asked, so waiting would be for ever. Delete it (rm ${file}), then ask again: ${again}.`;
}
