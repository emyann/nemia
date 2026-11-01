/**
 * `nemia say`: tell a step's running session something, through the engine, which journals the words; and why an ask cannot be written
 * where a file that is not one stands (`strayAsk`), which `nemia retry` and `nemia retry --round` say. A controller, reaching the runtime
 * through the client (`runtime-client.ts`): an Effect program that requires the engine as a service (`sayRun`, over `EngineService`), run
 * by a caller with `runWith`.
 */
import { Cause, Effect, Exit } from 'effect';
import { EngineService, asked, tried, type Engine } from '../runtime-client.ts';
import { tryOf, type Run } from '../record/record.ts';
import { sayRefusal, type Said } from './say.ts';
import { stepsOf } from '../record/record.store.ts';
import { phaseOfView } from '../views/views-words.ts';
import { Conflict } from '../refusal/refusal.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { RunId } from '../record/record.model.ts';

/**
 * What `nemia say` did: the step's task the words were said to, the try that task is, and the engine's `said` entry, as it journalled it.
 */
export type Told = { run: Run; taskId: string; try: number; said: Said };

/**
 * Tell a step's running session something — `nemia say` — through the engine's `say`, on the step's current try's task: the one `retry`
 * would replace, as `run.steps[step].taskId` names it. The engine hands the words to the session through its harness, then journals them as
 * a `said` entry on the task, which is the record: this verb writes nothing of its own, and `nemia ls` and `nemia decide` read the words
 * back off the engine's view of the task. Only the step's own task is read: the engine's `say` observes its harness again, and a run's
 * other tasks have no part in it.
 *
 * Refused before the engine is asked, with what to do instead (`sayRefusal`): a step the run does not have, a cancelled run, a step with no
 * task filed, and one whose task has settled — each a `Conflict`. Then the engine's refusals, each a `Conflict` in the engine's words —
 * empty words, an attempt not started, a harness with no way in, a session its harness does not list running — and a failure to deliver,
 * as the engine throws it, which journals nothing and has no exit code: ask again. Fails with a refusal, the verb's, the engine's
 * (`toldBy`) or one a read threw; dies of anything else, a failure to deliver included (`tried`, `asked`).
 */
export const sayRun = Effect.fn('say')(function* (id: string, stepName: string, text: string) {
  const e = yield* EngineService;
  const run = yield* (yield* RunDoor).runs.read(RunId.read(id));
  const steps = yield* tried(() => stepsOf(run));
  const taskId = run.steps[stepName]?.taskId;
  const phase = taskId ? phaseOfView(yield* asked('view', e.view(taskId))) : 'unknown';
  const refused = sayRefusal(steps, run, stepName, () => phase);
  if (refused || !taskId)
    return yield* Effect.fail(
      new Conflict({
        message: refused ?? `${stepName} has not been filed yet, so there is no session to hear anything: nemia ls ${run.id}.`,
      }),
    );
  const said = yield* toldBy(e, taskId, text);
  return { run, taskId, try: tryOf(run, stepName), said } satisfies Told;
});

/**
 * The engine's `say` of `text` to the task `taskId`, in `nemia say`'s program: the `said` entry it journalled, or its refusal — an error it
 * fails with carrying exit code 2 — as a `Conflict` in its words; anything else it fails with, a failure to deliver among them, the
 * program dies of.
 */
const toldBy = (e: Engine, taskId: string, text: string): Effect.Effect<Said, Conflict> =>
  Effect.exit(asked('say', e.say(taskId, text))).pipe(
    Effect.flatMap((exit) => {
      if (Exit.isSuccess(exit)) return Effect.succeed(exit.value);
      const err = Cause.squash(exit.cause);
      return (err as { exitCode?: unknown }).exitCode === 2
        ? Effect.fail(new Conflict({ message: (err as Error).message }))
        : Effect.failCause(exit.cause);
    }),
  );

/**
 * Why an ask cannot be written where a file that is not one already stands, in words that name it — or null, when there is none: the file
 * reads as an ask, or it is gone, consumed by a pass since the verb looked. `where` and `stray` are the store's answer to the write
 * (`AskWritten`): the file, and why it is no ask, read as the tick reads it.
 *
 * An ask is written under its try's name, exclusively, and never over a file there. One that does not read as an ask — `{}`, a hand edit, a
 * torn copy — is honoured by no pass, and `nemia ls` shows nothing asked, so "already asked for, wait for it" would be a wait for ever. The
 * way out is a person's: delete the file, and ask again.
 */
export function strayAsk(where: string, stray: string | null, what: string, again: string): string | null {
  if (stray === null) return null;
  return `${what} cannot be asked for: ${where} is already there, and it is not an ask — ${stray}. No tick honours it, and nemia ls shows nothing asked, so waiting would be for ever. Delete it (rm ${where}), then ask again: ${again}.`;
}
