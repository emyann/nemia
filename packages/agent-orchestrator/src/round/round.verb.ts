/**
 * `wf round` and `wf accept`: go round a loop once more (`round`), and end a loop as it stands (`accept`). Each refuses before anything is
 * written, and writes a person's own file — never the run's record, which the tick owns. A controller, reaching the runtime through the
 * client (`runtime-client.ts`).
 */
import fs from 'node:fs';
import type { Engine } from '../runtime-client.ts';
import { type Acceptance, type Run } from '../record/record.ts';
import { type RoundAsk } from '../status/status.ts';
import { acceptAsk, roundAsk } from './round.ts';
import {
  acceptFile,
  acceptanceIn,
  lstatOf,
  readAsks,
  readRun,
  roundAskFile,
  roundAskIn,
  runFile,
  stepsOf,
  writeAsk,
} from '../record/record.store.ts';
import { strayAsk } from '../say/say.verb.ts';
import { closeoutAsked, closeoutReader, spendReader, taskPhases } from '../views/views.verb.ts';
import { Conflict, Missing } from '../refusal/refusal.ts';

export type RoundAsked = { run: Run; ask: RoundAsk; file: string };

/**
 * Ask for one more round of a loop whose rounds are spent — `wf round` — by writing the ask, and nothing else. The next tick honours it once.
 *
 * Refused before anything is written, with what to do instead (`roundAsk`): a round still running, one the run files itself, a loop that
 * ended without asking again, a step of the loop that stopped, a cancelled run, a round already asked for. Like `wf retry`'s, the ask is the
 * person's own file, and the verb never writes the run's json, which the tick owns. `stepName` may be left out when the run has one loop.
 * `budget` raises the cap of each step of the loop over its budget, for a round held on it: the ask carries it, and the tick keeps it.
 * An ask written by someone else between the look and the write is refused as the look would have refused it, and a file at the ask's
 * name that does not read as one is named (`strayAsk`).
 */
export async function round(e: Engine, id: string, stepName?: string, budget?: number): Promise<RoundAsked> {
  const run = readRun(id);
  const steps = stepsOf(run);
  const { views, phaseOf } = await taskPhases(e, run);
  const answer = (asks: readonly RoundAsk[]) =>
    roundAsk(steps, run, stepName, phaseOf, closeoutReader(views, run), closeoutAsked(views), asks, spendReader(views), budget);

  const first = answer(readAsks(id).rounds);
  if ('refusal' in first) throw new Conflict({ message: first.refusal });
  const ask: RoundAsk = {
    step: first.step,
    round: first.round,
    ...(first.budget !== undefined ? { budget: first.budget } : {}),
    at: new Date().toISOString(),
  };
  const file = roundAskFile(id, ask.step, ask.round);
  if (!writeAsk(file, ask)) {
    const now = answer(readAsks(id).rounds);
    throw new Conflict({
      message:
        'refusal' in now
          ? now.refusal
          : (strayAsk(
              file,
              roundAskIn(file, ask.step, ask.round),
              `round ${ask.round} of ${ask.step}'s loop`,
              `wf round ${id} ${ask.step}`,
            ) ?? `round ${ask.round} of ${ask.step}'s loop is already asked for. Wait for it: wf ls ${id}.`),
    });
  }
  return { run, ask, file };
}

export type Accepted = { run: Run; acceptance: Acceptance; file: string };

/**
 * End a loop out of rounds on a person's word, with what they said — `wf accept` — by writing the acceptance, and nothing else. From the
 * next tick the looping step reads as having handed on, and what waits on it is filed: a gated ending goes to its gate, `awaiting
 * approval`, and is approved or not as ever.
 *
 * Refused before anything is written, with what to do instead (`acceptAsk`): no words, a round the run files itself or that waits on a
 * budget, a round already asked for, a loop that ended `again: false`, a round still running, a try already accepted, a cancelled run. Like
 * `wf round`'s, the acceptance is the person's own file, and the verb never writes the run's json, which the tick owns. `stepName` may be
 * left out when the run has one loop. An acceptance written by someone else between the look and the write is refused as the look would
 * have refused it, and a file at the acceptance's name that ends no loop is named, with how to clear it.
 *
 * Going round once more is not this verb's: `wf round <run> [<step>]` — and the two are offered side by side (`roundLines`).
 */
export async function accept(e: Engine, id: string, stepName?: string, message?: string): Promise<Accepted> {
  if (!fs.existsSync(runFile(id)))
    throw new Missing({
      message: `no such run: ${id}. wf accept takes a run by its id, as wf ls lists it: wf accept <runId> [<step>] --message "<why>".`,
    });
  const run = readRun(id);
  const steps = stepsOf(run);
  const { views, phaseOf } = await taskPhases(e, run);
  const answer = (now: Run, rounds: readonly RoundAsk[]) =>
    acceptAsk(steps, now, stepName, message, phaseOf, closeoutReader(views, now), closeoutAsked(views), rounds, spendReader(views));

  const first = answer(run, readAsks(id).rounds);
  if ('refusal' in first) throw new Conflict({ message: first.refusal });
  const acceptance: Acceptance = { step: first.step, try: first.try, at: new Date().toISOString(), message: message! };
  const file = acceptFile(id, acceptance.step, acceptance.try);
  if (!writeAsk(file, acceptance)) {
    const now = answer(readRun(id), readAsks(id).rounds);
    const read = acceptanceIn(file, acceptance.step, acceptance.try);
    throw new Conflict({
      message:
        'refusal' in now
          ? now.refusal
          : typeof read === 'string' && lstatOf(file)
            ? `try ${acceptance.try} of ${acceptance.step} cannot be accepted: ${file} is already there, and it is not an acceptance — ${read}. It ends no loop, and no tick moves it, so waiting would be for ever. Delete it (rm ${file}), then accept again: wf accept ${id} ${acceptance.step} --message "<why>".`
            : `try ${acceptance.try} of ${acceptance.step} is already accepted. What waits on it is filed on the next tick: wf ls ${id}.`,
    });
  }
  return { run, acceptance, file };
}
