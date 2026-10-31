/**
 * `nemia approve`: approve a step waiting at its gate, by writing the person's approval and nothing else, refused before anything is
 * written. A controller, reaching the runtime through the client (`runtime-client.ts`): an Effect program that requires the engine as a
 * service (`approveRun`, over `EngineService`), run by a caller with `runWith`.
 */
import { Effect } from 'effect';
import { tried } from '../runtime-client.ts';
import { tryOf, type Approval, type Run } from '../record/record.ts';
import { approvedFirst } from '../status/status.ts';
import { approvalRefusal } from './gate.ts';
import { stepsOf } from '../record/record.store.ts';
import { runStore } from '../record/files.store.ts';
import { standingsOf } from '../branches/branches.store.ts';
import { standingLive } from '../standing/standing.verb.ts';
import { closeoutAsked, closeoutReader, exitVerdicts, spendReader, taskPhasesRead } from '../views/views.verb.ts';
import { Conflict, Missing } from '../refusal/refusal.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { RunId } from '../record/record.model.ts';

/** What `nemia approve` did: the run, the approval as written, and its file. */
export type Approved = { run: Run; approval: Approval; file: string };

/**
 * Approve a step waiting at its gate — `nemia approve` — by writing the approval, and nothing else: `runs/<id>.asks/approve-<step>-<try>`,
 * whole and exclusively, beside the retry asks, with the time and the words given (`message`). The next tick reads it with the run
 * (`readRun`) and files what waits on the step, handing each step after the gate the words under `## Approved`. Like a retry ask it is the
 * person's own file, and the verb never writes the run's json.
 *
 * Refused before anything is written, exit 2, with what to do instead: a run not there; and what `approvalRefusal` refuses — empty words, a
 * step the run does not have, a cancelled run, a step not gated, not signed off yet, or already approved, a send-back already asked for,
 * and an ending that merges whose result is already on the base branch. Where the result stands is asked of its place now (`standingLive`,
 * `standingsOf`) only for such an ending (`approvedFirst`): no other gate's approval turns on it. An approval written by someone else
 * between the look and the write is refused as the look would have refused it, and a file at the approval's name that is not one is
 * named, with how to clear it.
 *
 * Sending back is not this verb's: `nemia retry <run> <step> --message "<objection>"` — the try it files is one this approval does not
 * name. Fails with a refusal, the verb's or one a read threw; dies of anything else (`tried`).
 */
export const approveRun = Effect.fn('approve')(function* (id: string, stepName: string, message?: string) {
  if (!(yield* (yield* RunDoor).runs.exists(RunId.read(id))))
    return yield* Effect.fail(
      new Missing({
        message: `no such run: ${id}. nemia approve takes a run by its id, as nemia ls lists it: nemia approve <runId> <step>.`,
      }),
    );
  const run = yield* (yield* RunDoor).runs.read(RunId.read(id));
  const steps = yield* tried(() => stepsOf(run));
  const { views, phaseOf } = yield* taskPhasesRead(run);
  const asks = steps.some((s) => s.name === stepName && approvedFirst(s, run));
  const standings = asks ? standingsOf(run, yield* standingLive([run])) : [];
  const refusal = (now: Run) =>
    approvalRefusal(
      steps,
      now,
      stepName,
      message,
      phaseOf,
      closeoutReader(views, now),
      closeoutAsked(views),
      exitVerdicts(views, now),
      runStore.asks.read(id).asks,
      spendReader(views),
      standings,
    );
  const refused = yield* tried(() => refusal(run));
  if (refused) return yield* Effect.fail(new Conflict({ message: refused }));
  const approval: Approval = {
    step: stepName,
    try: tryOf(run, stepName),
    at: new Date().toISOString(),
    ...(message !== undefined ? { message } : {}),
  };
  const written = yield* (yield* RunDoor).asks.write(RunId.read(id), { kind: 'approve', ask: approval });
  const file = written.where;
  if (!written.written) {
    const { stray } = written;
    const why = yield* tried(
      () =>
        refusal(runStore.runs.read(id)) ??
        (stray !== null
          ? `try ${approval.try} of ${stepName} cannot be approved: ${file} is already there, and it is not an approval — ${stray}. It opens no gate, and no tick moves it, so waiting would be for ever. Delete it (rm ${file}), then approve again: nemia approve ${id} ${stepName}.`
          : `try ${approval.try} of ${stepName} is already approved. What waits on it is filed on the next tick: nemia ls ${id}.`),
    );
    return yield* Effect.fail(new Conflict({ message: why }));
  }
  return { run, approval, file } satisfies Approved;
});
