/**
 * A person's ask taken back (`takeBackAsk`): a try, a round, a merge of the base, a loop's acceptance or a stray at a gate's key, set
 * aside under the run's asks' `done/` by the Run door, never deleted. A controller over the door, run by a caller with `runWith`.
 */
import { Effect } from 'effect';
import type { Actor } from 'objects';
import type { AskKey, Run, TakenBack } from '../record/record.ts';
import type { RetryAsk } from '../retry/index.ts';
import type { RoundAsk } from '../status/status.ts';
import { stepsOf } from '../steps/steps.verb.ts';
import { Conflict, Missing } from '../refusal/refusal.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { RunId } from '../record/record.model.ts';
import { askTakeBackJudged, askTakenAt, takeBackCommand, type AskTakenOf } from './take-back.ts';

/**
 * What a take-back did: the run as it was read, the key set aside and the step it is of, where it was set aside, whether it was a stray,
 * when and by whom; and the ask as it was read before it was moved, a try's or a round's (a merge is a round's), where one was.
 */
export type TakenBackAsk = {
  run: Run;
  key: AskKey;
  step: string;
  file: string;
  stray: boolean;
  takenBack: TakenBack;
  ask?: RetryAsk;
  round?: RoundAsk;
};

/**
 * Take back the ask of `of` of the step `stepName` — left out of a loop's ask on a run with one loop — by setting the record at its key
 * aside under the run's asks' `done/`, with when and by whom (`actor`) written on it: never deleted. A record there that reads as no ask
 * (a stray) is set aside too, its text kept whole.
 *
 * Refused before anything is moved, exit 2, with what to do instead: a run not there (`Missing`); and what `askTakeBackJudged` refuses
 * (`Conflict`) — a step the run does not have, a loop's ask of a step that closes no loop, nothing asked, and an acceptance that has
 * handed on. An ask the pass spent between the look and the move is refused as the look then refuses it.
 * @param id The run's id.
 * @param of The kind of ask taken back.
 * @param stepName The step the person named, or undefined where they named none.
 * @param actor Who takes it back, where the caller is known.
 */
export const takeBackAsk = Effect.fn('take-back')(function* (id: string, of: AskTakenOf, stepName: string | undefined, actor?: Actor) {
  const door = yield* RunDoor;
  if (!(yield* door.runs.exists(RunId.read(id))))
    return yield* Effect.fail(
      new Missing({
        message: `no such run: ${id}. A take-back takes a run by its id, as nemia ls lists it: ${takeBackCommand(of, '<runId>', '<step>')}.`,
      }),
    );
  const run = yield* door.runs.read(RunId.read(id));
  const steps = yield* stepsOf(run);
  const at = askTakenAt(of, steps, run, stepName);
  const held = at === undefined ? 'none' : yield* door.asks.held(RunId.read(id), at.key);
  const judged = askTakeBackJudged(of, steps, run, stepName, held);
  if ('refused' in judged) return yield* Effect.fail(new Conflict({ message: judged.refused }));
  const { key, step } = judged;
  const read = yield* door.asks.read(RunId.read(id));
  const ask = key.of === 'try' ? read.asks.find((a) => a.step === key.step && a.try === key.n) : undefined;
  const round =
    key.of === 'round'
      ? read.rounds.find((a) => !a.merge && a.step === key.step && a.round === key.n)
      : key.of === 'base'
        ? read.rounds.find((a) => a.merge?.target === key.step && a.merge.try === key.n)
        : undefined;
  const takenBack: TakenBack = { at: new Date().toISOString(), ...(actor ? { actor } : {}) };
  const moved = yield* door.asks.takeBack(RunId.read(id), key, takenBack);
  if (moved === null) {
    const now = yield* door.runs.read(RunId.read(id));
    const again = askTakeBackJudged(of, steps, now, stepName, 'none');
    return yield* Effect.fail(
      new Conflict({
        message:
          'refused' in again
            ? again.refused
            : `the ask of ${step} was set aside while it was being taken back. See where the run stands: nemia ls ${id}.`,
      }),
    );
  }
  return {
    run,
    key,
    step,
    file: moved.where,
    stray: moved.stray,
    takenBack,
    ...(ask ? { ask } : {}),
    ...(round ? { round } : {}),
  } satisfies TakenBackAsk;
});
