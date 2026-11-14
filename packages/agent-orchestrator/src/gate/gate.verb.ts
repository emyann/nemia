/**
 * `nemia approve`: approve a step waiting at its gate, by writing the person's approval and nothing else, refused before anything is
 * written. A controller, reaching the runtime through the client (`runtime-client.ts`): an Effect program that requires the engine as a
 * service (`approveRun`, over `EngineService`), run by a caller with `runWith`.
 */
import { Effect } from 'effect';
import type { Actor } from 'objects';
import { tried } from '../runtime-client.ts';
import { tryOf, type Approval, type Run, type TakenBack } from '../record/record.ts';
import { approvedFirst, approvedWork } from '../status/status.ts';
import { approvalRefusal, takeBackJudged } from './gate.ts';
import { stepsOf } from '../steps/steps.verb.ts';
import { runsAtOnce } from '../runs/runs.store.ts';
import { standingsOf } from '../branches/branches.store.ts';
import { standingLive } from '../standing/standing.verb.ts';
import { closeoutAsked, closeoutReader, exitVerdicts, spendReader, taskPhasesRead } from '../views/views.verb.ts';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { aboveTheWorkflow, approvedCaps, ceilingsOf, laterSteps, proposedBudgets, type StepBudget } from '../budget/budget.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { RunId } from '../record/record.model.ts';
import { StoreRoot } from '../config/root.store.ts';

/**
 * What `nemia approve` did: the run, the approval as written, and its file; the caps it set for the steps after the gate, in the order the
 * file holds them (`approvedCaps`), and the steps among them whose cap is above their own `budget:` (`aboveTheWorkflow`).
 */
export type Approved = { run: Run; approval: Approval; file: string; caps: StepBudget[]; above: string[] };

/**
 * Approve a step waiting at its gate — `nemia approve` — by writing the approval, and nothing else: `runs/<id>.asks/approve-<step>-<try>`,
 * whole and exclusively, beside the retry asks, with the time and the words given (`message`). The next tick reads it with the run
 * (`runRecord`) and files what waits on the step, handing each step after the gate the words under `## Approved`. Like a retry ask it is
 * the person's own file, and the verb never writes the run's json.
 *
 * Refused before anything is written, exit 2, with what to do instead: a run not there; and what `approvalRefusal` refuses — empty words, a
 * step the run does not have, a cancelled run, a step not gated, not signed off yet, or already approved, a send-back already asked for,
 * and an ending that merges whose result is already on the base branch. Where the result stands is asked of its place now (`standingLive`,
 * `standingsOf`) only for such an ending (`approvedFirst`): no other gate's approval turns on it. An approval written by someone else
 * between the look and the write is refused as the look would have refused it, and a file at the approval's name that is not one is
 * named, with how to clear it.
 *
 * The approval carries the caps it sets for the steps after the gate (`budgets`): the budgets the step's closeout proposes (`"x-shape":
 * "budgets"`), with each amount the person gave (`given`, `nemia approve --budget <step>=<amount>`) over them (`approvedCaps`). A given
 * amount that names no step after the gate, is given twice, or is no amount is refused `Invalid`, exit 2, before anything is written.
 *
 * Who approves (`actor`, the caller where it is known) is kept on the approval; an approval given in-process keeps none.
 *
 * Sending back is not this verb's: `nemia retry <run> <step> --message "<objection>"` — the try it files is one this approval does not
 * name. Fails with a refusal, the verb's or one a read threw; dies of anything else (`tried`).
 */
export const approveRun = Effect.fn('approve')(function* (
  id: string,
  stepName: string,
  message?: string,
  given: readonly StepBudget[] = [],
  actor?: Actor,
) {
  const home = yield* StoreRoot;
  if (!(yield* (yield* RunDoor).runs.exists(RunId.read(id))))
    return yield* Effect.fail(
      new Missing({
        message: `no such run: ${id}. nemia approve takes a run by its id, as nemia ls lists it: nemia approve <runId> <step>.`,
      }),
    );
  const run = yield* (yield* RunDoor).runs.read(RunId.read(id));
  const steps = yield* stepsOf(run);
  const { views, phaseOf } = yield* taskPhasesRead(run);
  const asks = steps.some((s) => s.name === stepName && approvedFirst(s, run));
  const standings = asks ? standingsOf(run, steps, yield* standingLive([run])) : [];
  const refusal = (now: Run) =>
    approvalRefusal(
      steps,
      now,
      stepName,
      message,
      phaseOf,
      closeoutReader(views, now, steps),
      closeoutAsked(views),
      exitVerdicts(views, now),
      runsAtOnce(home).asks.read(id).asks,
      spendReader(views),
      standings,
    );
  const refused = yield* tried(() => refusal(run));
  if (refused) return yield* Effect.fail(new Conflict({ message: refused }));
  const proposed = proposedBudgets(
    steps.find((s) => s.name === stepName),
    closeoutReader(views, run, steps)(stepName),
  ).map((p) => ({ step: p.step, usd: p.usd }));
  const set = approvedCaps(proposed, given, laterSteps(steps, stepName));
  if ('refused' in set) {
    return yield* Effect.fail(
      new Invalid({
        message: `${set.refused}. Give each step after ${stepName} at most one amount: nemia approve ${id} ${stepName} --budget <step>=<amount>, once for each step.`,
      }),
    );
  }
  const caps = set.caps.map((c) => ({ step: c.step, usd: c.usd }));
  const gated = steps.find((s) => s.name === stepName);
  const work = gated ? approvedWork(gated, run) : undefined;
  const approval: Approval = {
    step: stepName,
    try: tryOf(run, stepName),
    at: new Date().toISOString(),
    ...(message !== undefined ? { message } : {}),
    ...(caps.length ? { budgets: Object.fromEntries(caps.map((c) => [c.step, c.usd])) } : {}),
    ...(work ? { work } : {}),
    ...(actor ? { actor } : {}),
  };
  const written = yield* (yield* RunDoor).asks.write(RunId.read(id), { kind: 'approve', of: 'gate', ask: approval });
  const file = written.where;
  if (!written.written) {
    const { stray } = written;
    const why = yield* tried(
      () =>
        refusal(runsAtOnce(home).runs.read(id)) ??
        (stray !== null
          ? `try ${approval.try} of ${stepName} cannot be approved: ${file} is already there, and it is not an approval — ${stray}. It opens no gate, and no tick moves it, so waiting would be for ever. Delete it (rm ${file}), then approve again: nemia approve ${id} ${stepName}.`
          : `try ${approval.try} of ${stepName} is already approved. What waits on it is filed on the next tick: nemia ls ${id}.`),
    );
    return yield* Effect.fail(new Conflict({ message: why }));
  }
  return { run, approval, file, caps, above: aboveTheWorkflow(caps, ceilingsOf(steps)) } satisfies Approved;
});

/** What `nemia approve --off` did: the run, the approval as given, where it was set aside, and when and by whom it was taken back. */
export type TakenBackApproval = { run: Run; approval: Approval; file: string; takenBack: TakenBack };

/**
 * Take back the approval of a step that stands approved while nothing it approved has been filed — `nemia approve <run> <step> --off` —
 * by setting its file aside in the run's `.asks/done/` as the pass sets a spent approval aside, with when and by whom (`actor`) written on
 * it (`asks.takeBack`): never deleted. The step then waits at its gate again. The same for an approval that names the work it approved
 * and one an older nemia wrote with none.
 *
 * Refused before anything is moved, exit 2, with what to do instead: a run not there (`Missing`); and what `takeBackJudged` refuses
 * (`Conflict`) — a step the run does not have, one not approved, and one anything of which is filed, its session or its check. An approval
 * set aside between the look and the move (a pass found it spent) is refused as the look then refuses it.
 */
export const takeBackRun = Effect.fn('approve-off')(function* (id: string, stepName: string, actor?: Actor) {
  const door = yield* RunDoor;
  if (!(yield* door.runs.exists(RunId.read(id))))
    return yield* Effect.fail(
      new Missing({
        message: `no such run: ${id}. nemia approve --off takes a run by its id, as nemia ls lists it: nemia approve <runId> <step> --off.`,
      }),
    );
  const run = yield* door.runs.read(RunId.read(id));
  const steps = yield* stepsOf(run);
  const judged = takeBackJudged(steps, run, stepName);
  if ('refused' in judged) return yield* Effect.fail(new Conflict({ message: judged.refused }));
  const { approval } = judged;
  const takenBack: TakenBack = { at: new Date().toISOString(), ...(actor ? { actor } : {}) };
  const file = yield* door.asks.takeBack(RunId.read(id), stepName, approval.try, takenBack);
  if (file === null) {
    const now = takeBackJudged(steps, yield* door.runs.read(RunId.read(id)), stepName);
    return yield* Effect.fail(
      new Conflict({
        message:
          'refused' in now
            ? now.refused
            : `try ${approval.try} of ${stepName}'s approval was set aside while it was being taken back. See where the run stands: nemia ls ${id}.`,
      }),
    );
  }
  return { run, approval, file, takenBack } satisfies TakenBackApproval;
});
