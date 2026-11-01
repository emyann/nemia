/**
 * `nemia retry --round` and `nemia approve`: go round a loop once more, and end a loop as it stands. Each refuses before anything is
 * written, and writes a person's own file — never the run's record, which the tick owns. A controller, reaching the runtime through the
 * client (`runtime-client.ts`): Effect programs that require the engine as a service (`roundRun` and `acceptRun`, over `EngineService`),
 * run by a caller with `runWith`.
 */
import { Effect } from 'effect';
import { tried } from '../runtime-client.ts';
import { type Acceptance, type Run } from '../record/record.ts';
import { type RoundAsk } from '../status/status.ts';
import { acceptAsk, roundAsk } from './round.ts';
import { stepsOf } from '../record/record.store.ts';
import { runStore } from '../record/files.store.ts';
import { strayAsk } from '../say/say.verb.ts';
import { closeoutAsked, closeoutReader, spendReader, taskPhasesRead } from '../views/views.verb.ts';
import { Conflict, Missing } from '../refusal/refusal.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { RunId } from '../record/record.model.ts';

export type RoundAsked = { run: Run; ask: RoundAsk; file: string };

/**
 * Ask for one more round of a loop whose rounds are spent — `nemia retry --round` — by writing the ask, and nothing else. The next tick
 * honours it once.
 *
 * Refused before anything is written, with what to do instead (`roundAsk`): a round still running, one the run files itself, a loop that
 * ended without asking again, a step of the loop that stopped, a cancelled run, a round already asked for. Like `nemia retry`'s, the ask is
 * the person's own file, and the verb never writes the run's json, which the tick owns. `stepName` may be left out when the run has one
 * loop. `budget` raises the cap of each step of the loop over its budget, for a round held on it: the ask carries it, and the tick keeps
 * it. An ask written by someone else between the look and the write is refused as the look would have refused it, and a file at the ask's
 * name that does not read as one is named (`strayAsk`). Fails with a refusal, the verb's or one a read threw; dies of anything else
 * (`tried`).
 */
export const roundRun = Effect.fn('round')(function* (id: string, stepName?: string, budget?: number) {
  const run = yield* (yield* RunDoor).runs.read(RunId.read(id));
  const steps = yield* tried(() => stepsOf(run));
  const { views, phaseOf } = yield* taskPhasesRead(run);
  const answer = (asks: readonly RoundAsk[]) =>
    roundAsk(steps, run, stepName, phaseOf, closeoutReader(views, run), closeoutAsked(views), asks, spendReader(views), budget);

  const first = answer((yield* (yield* RunDoor).asks.read(RunId.read(id))).rounds);
  if ('refusal' in first) return yield* Effect.fail(new Conflict({ message: first.refusal }));
  const ask: RoundAsk = {
    step: first.step,
    round: first.round,
    ...(first.budget !== undefined ? { budget: first.budget } : {}),
    at: new Date().toISOString(),
  };
  const written = yield* (yield* RunDoor).asks.write(RunId.read(id), { kind: 'retry', of: 'round', ask });
  const file = written.where;
  if (!written.written) {
    const now = answer((yield* (yield* RunDoor).asks.read(RunId.read(id))).rounds);
    const why =
      'refusal' in now
        ? now.refusal
        : strayAsk(file, written.stray, `round ${ask.round} of ${ask.step}'s loop`, `nemia retry ${id} ${ask.step} --round`);
    return yield* Effect.fail(
      new Conflict({ message: why ?? `round ${ask.round} of ${ask.step}'s loop is already asked for. Wait for it: nemia ls ${id}.` }),
    );
  }
  return { run, ask, file } satisfies RoundAsked;
});

export type Accepted = { run: Run; acceptance: Acceptance; file: string };

/**
 * End a loop out of rounds on a person's word, with what they said — `nemia approve` — by writing the acceptance, and nothing else. From
 * the next tick the looping step reads as having handed on, and what waits on it is filed: a gated ending goes to its gate, `awaiting
 * approval`, and is approved or not as ever.
 *
 * Refused before anything is written, with what to do instead (`acceptAsk`): no words, a round the run files itself or that waits on a
 * budget, a round already asked for, a loop that ended `again: false`, a round still running, a try already accepted, a cancelled run. Like
 * `nemia retry --round`'s, the acceptance is the person's own file, and the verb never writes the run's json, which the tick owns.
 * `stepName` may be left out when the run has one loop. An acceptance written by someone else between the look and the write is refused as
 * the look would have refused it, and a file at the acceptance's name that ends no loop is named, with how to clear it.
 *
 * Going round once more is not this verb's: `nemia retry <run> [<step>] --round` — and the two are offered side by side (`roundLines`).
 * Fails with a refusal, the verb's or one a read threw; dies of anything else (`tried`).
 */
export const acceptRun = Effect.fn('accept')(function* (id: string, stepName?: string, message?: string) {
  if (!(yield* (yield* RunDoor).runs.exists(RunId.read(id))))
    return yield* Effect.fail(
      new Missing({
        message: `no such run: ${id}. nemia approve takes a run by its id, as nemia ls lists it: nemia approve <runId> [<step>] --message "<why>".`,
      }),
    );
  const run = yield* (yield* RunDoor).runs.read(RunId.read(id));
  const steps = yield* tried(() => stepsOf(run));
  const { views, phaseOf } = yield* taskPhasesRead(run);
  const answer = (now: Run, rounds: readonly RoundAsk[]) =>
    acceptAsk(steps, now, stepName, message, phaseOf, closeoutReader(views, now), closeoutAsked(views), rounds, spendReader(views));

  const first = answer(run, (yield* (yield* RunDoor).asks.read(RunId.read(id))).rounds);
  if ('refusal' in first) return yield* Effect.fail(new Conflict({ message: first.refusal }));
  const acceptance: Acceptance = { step: first.step, try: first.try, at: new Date().toISOString(), message: message! };
  const written = yield* (yield* RunDoor).asks.write(RunId.read(id), { kind: 'approve', of: 'loop', ask: acceptance });
  const file = written.where;
  if (!written.written) {
    const { stray } = written;
    const why = yield* tried(() =>
      acceptedAlready(file, stray, acceptance, answer(runStore.runs.read(id), runStore.asks.read(id).rounds), id),
    );
    return yield* Effect.fail(new Conflict({ message: why }));
  }
  return { run, acceptance, file } satisfies Accepted;
});

/**
 * Why `acceptance` could not be written at `file` of the run `id`, read again: the refusal the look would now give (`now`), else the
 * file there that is not an acceptance, named with why (`stray`) and how to clear it, else the acceptance someone else wrote first.
 */
function acceptedAlready(
  file: string,
  stray: string | null,
  acceptance: Acceptance,
  now: ReturnType<typeof acceptAsk>,
  id: string,
): string {
  if ('refusal' in now) return now.refusal;
  return stray !== null
    ? `try ${acceptance.try} of ${acceptance.step} cannot be accepted: ${file} is already there, and it is not an acceptance — ${stray}. It ends no loop, and no tick moves it, so waiting would be for ever. Delete it (rm ${file}), then accept again: nemia approve ${id} ${acceptance.step} --message "<why>".`
    : `try ${acceptance.try} of ${acceptance.step} is already accepted. What waits on it is filed on the next tick: nemia ls ${id}.`;
}
