/**
 * `nemia say`: tell a step's running session something, through the engine, which journals the words; and why an ask cannot be written
 * where a file that is not one stands (`strayAsk`), which `nemia retry` and `nemia retry --round` say. A controller, reaching the runtime
 * through the client (`runtime-client.ts`): an Effect program that requires the engine as a service (`sayRun`, over `EngineService`), run
 * by a caller with `runWith`.
 */
import { Cause, Effect, Exit } from 'effect';
import { EngineService, asked, type Engine } from '../runtime-client.ts';
import { tryOf, type Run, type SaidBefore } from '../record/record.ts';
import { saidAhead, sayRefusal, type Said } from './say.ts';
import type { Caller } from '../caller/index.ts';
import { framedForStep, stepSpeaker, type Speaker } from '../chat/index.ts';
import { stepsOf } from '../steps/steps.verb.ts';
import { phaseOfView } from '../views/views-words.ts';
import { Conflict } from '../refusal/refusal.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { RunId } from '../record/record.model.ts';

/**
 * What `nemia say` did: the step's task the words were said to, the try that task is, the engine's `said` entry, as it journalled it, and
 * who the words are from (`from`).
 */
export type Told = { run: Run; taskId: string; try: number; said: Said; from: Speaker };

/**
 * What `nemia say` did with words for a step nothing of which is filed yet: kept them beside the run's record, for its first try's brief
 * (`saidBeforeSection`), with when and the words as kept (`kept`, an agent's in its frame), and who they are from (`from`). Nothing was
 * delivered: no session of the step runs yet.
 */
export type Kept = { run: Run; try: 1; kept: SaidBefore; from: Speaker };

/**
 * Who says words to a step: the `caller` the request's token says — the person under any token of theirs, an agent by a standing token
 * minted for it, or a session by its run's token — which is who the words are from (`stepSpeaker`).
 */
export type SaidWho = { readonly caller: Caller };

/**
 * Tell a step's running session something — `nemia say` — through the engine's `say`, on the step's current try's task: the one `retry`
 * would replace, as `run.steps[step].taskId` names it. Who the words are from is the caller `by` names (`stepSpeaker`): the
 * person's words are said as they are, an agent's in the frame that names it (`framedForStep`), never as the person's. The engine hands the
 * words to the session through its harness, then journals them as a `said` entry on the task, which is the record: this verb writes nothing
 * of its own, and `nemia ls` and `nemia decide` read the words back off the engine's view of the task. Only the step's own task is read:
 * the engine's `say` observes its harness again, and a run's other tasks have no part in it.
 *
 * A step nothing of which is filed yet — waiting on `--after`, a hold, the store's pause or an earlier step — has no session to hear
 * anything, and its words are kept instead, beside the run's record (`keptFor`, answered as `Kept`): its first try's brief carries them,
 * and no try after it. The engine is not asked. A pass that files the step while the words are being kept may compose its brief before
 * they are there: the record is the tick's, and a person's file beside it is read on the next filing, which for that step is no first try.
 *
 * Refused before the engine is asked, with what to do instead (`sayRefusal`): a step the run does not have, a cancelled run, a pruned
 * run's step not filed, a step whose tries are behind it with none filed now, and one whose task has settled — each a `Conflict`; and
 * empty words for a step not filed, a `Conflict` as the engine's is. Then the engine's refusals, each a `Conflict` in the engine's words —
 * empty words, an attempt not started, a harness with no way in, a session its harness does not list running — and a failure to
 * deliver, as the engine throws it, which journals nothing and has no exit code: ask again. Fails with a refusal, the verb's, the
 * engine's (`toldBy`) or one a read threw; dies of anything else, a failure to deliver included (`asked`).
 */
export const sayRun = Effect.fn('say')(function* (id: string, stepName: string, text: string, by: SaidWho) {
  const from = stepSpeaker(by.caller);
  const e = yield* EngineService;
  const run = yield* (yield* RunDoor).runs.read(RunId.read(id));
  const steps = yield* stepsOf(run);
  const taskId = run.steps[stepName]?.taskId;
  const phase = taskId ? phaseOfView(yield* asked('view', e.view(taskId))) : 'unknown';
  const refused = sayRefusal(steps, run, stepName, () => phase);
  if (refused) return yield* Effect.fail(new Conflict({ message: refused }));
  if (saidAhead(run, stepName)) return yield* keptFor(run, stepName, text, from);
  if (!taskId)
    return yield* Effect.fail(
      new Conflict({ message: `${stepName} has no task filed, so there is no session to hear anything: nemia ls ${run.id}.` }),
    );
  const said = yield* toldBy(e, taskId, framedForStep(from, text));
  return { run, taskId, try: tryOf(run, stepName), said, from } satisfies Told;
});

/**
 * Words for a step nothing of which is filed yet, kept beside the run's record (`said.put`), framed as they would be said to its session
 * (`framedForStep`), for its first try's brief. Empty words are refused `Conflict`, as the engine refuses them of a session, and nothing
 * is kept.
 */
const keptFor = Effect.fnUntraced(function* (run: Run, stepName: string, text: string, from: Speaker) {
  if (!text.trim())
    return yield* Effect.fail(
      new Conflict({
        message: `\`text\` is empty: there is nothing to keep for ${stepName}. Give the words: nemia say ${run.id} ${stepName} "<words>".`,
      }),
    );
  const kept = yield* (yield* RunDoor).said.put(RunId.read(run.id), stepName, framedForStep(from, text));
  return { run, try: 1, kept, from } satisfies Kept;
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
