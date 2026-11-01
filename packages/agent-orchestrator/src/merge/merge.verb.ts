/**
 * `nemia refresh --base`: send a loop's work back to merge its base branch, on the round it is on. It refuses before anything is written,
 * and writes a person's own file — never the run's record, which the tick owns. A controller, reaching the runtime through the client
 * (`runtime-client.ts`): an Effect program that requires the engine as a service (`mergeRun`, over `EngineService`), run by a caller with
 * `runWith`, which the command table's `nemia refresh` calls given `--base`; what `nemia decide` offers (`mergeOffers`); and how the review
 * after a merge reads its own closeout (`closeoutsAfterMerge`).
 */
import { Effect } from 'effect';
import { asked, tried, type Engine } from '../runtime-client.ts';
import { isRepositoryRun, type CloseoutAsked, type Run, type TaskPhase } from '../record/record.ts';
import { endingStopped, merged, standing, type RoundAsk, type SpendOf } from '../status/status.ts';
import { parseCloseout, type Closeout } from '../closeout/index.ts';
import { roundsDue } from '../round/round.ts';
import { stepsOf } from '../record/record.store.ts';
import { PlaceService, trialMerges, type Place } from '../place/place.store.ts';
import { mergeWordOf } from '../branches/index.ts';
import { strayAsk } from '../say/say.verb.ts';
import { closeoutAsked, closeoutReader, spendReader, taskPhasesRead } from '../views/views.verb.ts';
import { Conflict, Missing } from '../refusal/refusal.ts';
import type { Workflow } from '../step/step.ts';
import { mergeAsk, mergeOffer, type MergeAsk, type MergeReads, type Tried } from './merge.ts';
import type { Decision, Offer } from '../decide/decide.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { RunId } from '../record/record.model.ts';

export type MergeAsked = { run: Run; ask: MergeAsk; file: string };

/** What a merge decides on of a run's steps (`MergeReads`), off their tasks as `nemia ls` reads them. */
function mergeReads(
  steps: readonly Workflow[],
  run: Run,
  phaseOf: (taskId: string) => TaskPhase,
  closeoutOf: (step: string) => Closeout | undefined,
  asked: (taskId: string) => CloseoutAsked,
  spendOf: SpendOf,
): MergeReads {
  return {
    standingOf: (step: Workflow) => standing(step, run, phaseOf, closeoutOf, asked, steps, spendOf),
    stopped: (step: Workflow) => endingStopped(step, run, phaseOf, closeoutOf, asked, steps, spendOf),
    goesRound: (looping: Workflow) => roundsDue(steps, run, phaseOf, closeoutOf, asked, [], spendOf).some((r) => r.step === looping.name),
  };
}

/**
 * A trial merge of a branch onto the run's base branch, by the place's trial merge (`trialMerges`), which touches no checkout, and the
 * commit the base branch was at as the place tried it.
 */
const trialOf =
  (run: Run, place: Place) =>
  (branch: string): Tried => {
    if (!isRepositoryRun(run)) return { trial: { error: 'no repository' }, base: null };
    const { at, trials } = trialMerges(run.repo, [{ onto: run.branch, branch }], place);
    const [trial = { unknown: `the place answered no trial of ${branch}` }] = trials;
    return { trial: mergeWordOf(trial), base: at[run.branch] ?? null };
  };

/**
 * The merges `nemia decide` offers on a run awaiting a person (`Decision`): one for each loop whose merge the verb would take now
 * (`mergeAsk`, which asks the place last, once nothing else refuses it), on the commit its trial read the base at, in the words of
 * `mergeOffer`.
 * None on any other run.
 */
export function mergeOffers(
  place: Place,
  steps: readonly Workflow[],
  run: Run,
  d: Decision,
  rounds: readonly RoundAsk[],
  ...read: [
    phaseOf: (taskId: string) => TaskPhase,
    closeoutOf: (step: string) => Closeout | undefined,
    asked: (taskId: string) => CloseoutAsked,
    spendOf: SpendOf,
  ]
): Offer[] {
  if (d.kind !== 'awaiting' || !isRepositoryRun(run)) return [];
  const reads = mergeReads(steps, run, ...read);
  const at = new Date().toISOString();
  return steps
    .filter((s) => s.loop)
    .flatMap((looping) => {
      const answer = mergeAsk(steps, run, looping.name, reads, rounds, trialOf(run, place), at);
      return 'ask' in answer ? [mergeOffer(run, answer.ask)] : [];
    });
}

/**
 * Ask that a loop's target merge the run's base branch, on the round the loop is on — `nemia refresh --base` — by writing the ask, and
 * nothing else. The next tick honours it once, and moves the run's base to the commit merged.
 *
 * Refused before anything is written, with what to do instead (`mergeAsk`): among them a run whose result step closes no loop, pointed to
 * `nemia retry`, work whose trial merge onto the base is clean, pointed to the landing's approval, and a base whose commit the trial
 * did not read. The trial is the place's (`trialMerges`), which touches no checkout. An ask written by someone else between the look and
 * the write is refused as the look would have refused it, and a file at the ask's name that does not read as one is named (`strayAsk`).
 * Fails with a refusal, the verb's or one a read threw (`Missing` for no such run); dies of anything else (`tried`).
 */
export const mergeRun = Effect.fn('merge')(function* (id: string, stepName?: string) {
  if (!(yield* (yield* RunDoor).runs.exists(RunId.read(id))))
    return yield* Effect.fail(
      new Missing({
        message: `no such run: ${id}. nemia refresh --base takes a run by its id, as nemia ls lists it: nemia refresh <runId> [<step>] --base.`,
      }),
    );
  const run = yield* (yield* RunDoor).runs.read(RunId.read(id));
  const steps = yield* tried(() => stepsOf(run));
  const { views, phaseOf } = yield* taskPhasesRead(run);
  const reads = mergeReads(steps, run, phaseOf, closeoutReader(views, run), closeoutAsked(views), spendReader(views));
  const at = new Date().toISOString();
  const place = yield* PlaceService;
  const answer = (asks: readonly RoundAsk[]) => mergeAsk(steps, run, stepName, reads, asks, trialOf(run, place), at);

  const first = answer((yield* (yield* RunDoor).asks.read(RunId.read(id))).rounds);
  if ('refusal' in first) return yield* Effect.fail(new Conflict({ message: first.refusal }));
  const { ask } = first;
  const written = yield* (yield* RunDoor).asks.write(RunId.read(id), { kind: 'refresh', of: 'base', ask });
  if (!written.written) {
    const now = answer((yield* (yield* RunDoor).asks.read(RunId.read(id))).rounds);
    const why =
      'refusal' in now
        ? now.refusal
        : strayAsk(written.where, written.stray, `a merge into ${ask.merge.target}'s work`, `nemia refresh ${id} ${ask.step} --base`);
    return yield* Effect.fail(
      new Conflict({ message: why ?? `a merge into ${ask.merge.target}'s work is already asked. Wait for it: nemia ls ${id}.` }),
    );
  }
  return { run, ask, file: written.where } satisfies MergeAsked;
});

/**
 * How a ready step's brief reads the closeouts: a looping step filed after its target merged the base (`merged`) reads its own off the try
 * the merge moved behind, as the engine kept it, and every other as it signed (`signedOff`).
 */
export const closeoutsAfterMerge = Effect.fnUntraced(function* (
  e: Engine,
  run: Run,
  step: Workflow,
  signedOff: (step: string) => Closeout | undefined,
) {
  const before = step.loop && merged(run.steps[step.name]) ? run.steps[step.name]?.tries?.at(-1) : undefined;
  const said = before ? (yield* asked('view', e.view(before.taskId))).state.attempts.at(-1)?.closeout : undefined;
  const own = said === undefined ? undefined : parseCloseout(said);
  return (name: string): Closeout | undefined => (own && name === step.name && !('error' in own) ? own : signedOff(name));
});
