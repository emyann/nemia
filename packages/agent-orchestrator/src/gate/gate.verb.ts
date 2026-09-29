/**
 * `wf approve`: approve a step waiting at its gate (`approve`), by writing the person's approval and nothing else, refused before anything is
 * written. A controller, reaching the runtime through the client (`runtime-client.ts`).
 */
import fs from 'node:fs';
import type { Engine } from '../runtime-client.ts';
import { tryOf, type Approval, type Run } from '../record/record.ts';
import { approvedFirst } from '../status/status.ts';
import { approvalRefusal } from './gate.ts';
import { approvalFile, approvalIn, lstatOf, readAsks, readRun, runFile, stepsOf, writeAsk } from '../record/record.store.ts';
import { standingsOf } from '../branches/branches.store.ts';
import { closeoutAsked, closeoutReader, exitVerdicts, spendReader, taskPhases } from '../views/views.verb.ts';
import { Conflict, Missing } from '../refusal/refusal.ts';

/** What `wf approve` did: the run, the approval as written, and its file. */
export type Approved = { run: Run; approval: Approval; file: string };

/**
 * Approve a step waiting at its gate — `wf approve` — by writing the approval, and nothing else: `runs/<id>.asks/approve-<step>-<try>`, whole and
 * exclusively, beside the retry asks, with the time and the words given (`message`). The next tick reads it with the run (`readRun`) and files
 * what waits on the step, handing each step after the gate the words under `## Approved`. Like a retry ask it is the person's own file, and the
 * verb never writes the run's json.
 *
 * Refused before anything is written, exit 2, with what to do instead: a run not there; and what `approvalRefusal` refuses — empty words, a
 * step the run does not have, a cancelled run, a step not gated, not signed off yet, or already approved, a send-back already asked for, and
 * an ending that merges whose result is already on the base branch. Where the result stands is read off git (`standingsOf`) only for such
 * an ending (`approvedFirst`): no other gate's approval turns on it. An approval written by someone else between the look and the write is
 * refused as the look would have refused it, and a file at the approval's name that is not one is named, with how to clear it.
 *
 * Sending back is not this verb's: `wf retry <run> <step> --message "<objection>"` — the try it files is one this approval does not name.
 */
export async function approve(e: Engine, id: string, stepName: string, message?: string): Promise<Approved> {
  if (!fs.existsSync(runFile(id)))
    throw new Missing({ message: `no such run: ${id}. wf approve takes a run by its id, as wf ls lists it: wf approve <runId> <step>.` });
  const run = readRun(id);
  const steps = stepsOf(run);
  const { views, phaseOf } = await taskPhases(e, run);
  const standings = steps.some((s) => s.name === stepName && approvedFirst(s, run)) ? standingsOf(run) : [];
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
      readAsks(id).asks,
      spendReader(views),
      standings,
    );
  const refused = refusal(run);
  if (refused) throw new Conflict({ message: refused });
  const approval: Approval = {
    step: stepName,
    try: tryOf(run, stepName),
    at: new Date().toISOString(),
    ...(message !== undefined ? { message } : {}),
  };
  const file = approvalFile(id, stepName, approval.try);
  if (!writeAsk(file, approval)) {
    const read = approvalIn(file, stepName, approval.try);
    throw new Conflict({
      message:
        refusal(readRun(id)) ??
        (typeof read === 'string' && lstatOf(file)
          ? `try ${approval.try} of ${stepName} cannot be approved: ${file} is already there, and it is not an approval — ${read}. It opens no gate, and no tick moves it, so waiting would be for ever. Delete it (rm ${file}), then approve again: wf approve ${id} ${stepName}.`
          : `try ${approval.try} of ${stepName} is already approved. What waits on it is filed on the next tick: wf ls ${id}.`),
    });
  }
  return { run, approval, file };
}
