/**
 * What a run's roots are handed of the runs it waited on and was handed as context, read off their records and the engine: what each
 * concluded (`parentCloseouts`) and, on the pass that files the roots, all of it in order (`handedOf`). A controller, reaching the runtime
 * through the client (`runtime-client.ts`); `handed.ts` words what it reads.
 */
import { Cause, Effect, Exit } from 'effect';
import { asked, over, type Engine } from '../runtime-client.ts';
import type { Workflow } from '../workflow.ts';
import type { Run } from '../record/record.ts';
import { resultSteps } from '../branches/index.ts';
import { stepsOf } from '../record/record.store.ts';
import { runStore } from '../record/files.store.ts';
import { closeoutOf, parentRead } from '../views/views.verb.ts';
import type { BranchReader } from '../branches/branches.store.ts';
import { phaseOfView } from '../views/views-words.ts';
import type { ParentCloseout, ParentStep } from './handed.ts';
import { firstPiece } from '../piece/piece.ts';

/**
 * What the step `step` of the run `record` said, on the engine's record of its current try (`closeoutOf`) — or why it cannot be given: it
 * was never filed, the engine could not be asked, it holds no closeout, or the closeout does not parse. Never fails.
 */
const stepSaid = Effect.fn('stepSaid')(function* (e: Engine, record: Run, step: Workflow) {
  const taskId = record.steps[step.name]?.taskId;
  if (!taskId) return { name: step.name, unreadable: 'it was never filed' } satisfies ParentStep;
  const viewed = yield* Effect.exit(asked('view', e.view(taskId)));
  if (Exit.isFailure(viewed)) {
    const err = Cause.squash(viewed.cause) as Error;
    return { name: step.name, unreadable: `the engine could not be asked for its task ${taskId}: ${err.message}` } satisfies ParentStep;
  }
  const view = viewed.value;
  const c = closeoutOf(new Map([[taskId, view]]), record, step.name);
  if (!c) return { name: step.name, unreadable: `the engine holds no closeout for its task ${taskId}, which is ${phaseOfView(view)}` };
  if ('error' in c) return { name: step.name, unreadable: `its closeout cannot be read: ${c.error}` };
  return { step, said: c } satisfies ParentStep;
});

/**
 * What each run this one waited on or was handed as context concluded, for its roots' briefs (`## From run <id>` in `composeBrief`), each
 * marked `how` it was given and whether it had landed — every run waited on has, and a run read is as `parentRead` reads it now —, asked
 * of each run that reads: the first line of its brief, and the closeout of each step whose work is that run's result (`resultSteps`), on
 * the engine's record of its current try, read as `nemia decide` reads one (`closeoutOf`). Read once, on the pass that files the roots.
 *
 * The result's steps, not the terminal ones: where a folder's last step is an ending that merges (`workspace: base`), that step's account
 * is of the merge — "merged wf/…/implement onto main, the check passed" — and it declares nothing, so a child handed it would be handed
 * nothing about the work. What the child wants is what the work said, which is the step the ending acts on. A folder with no ending step
 * is unchanged: its terminal steps are its result.
 *
 * A parent whose record or workflow does not read, a step never filed, a task the engine holds no closeout for — a failed step whose work
 * a person merged all the same — and a closeout that does not parse each say so in the section, and the roots are filed all the same.
 * Whether a run read has landed is read through `git` (`parentRead`), and fails with the refusal that read failed with.
 */
export const parentCloseouts = Effect.fn('parentCloseouts')(function* (
  e: Engine,
  ids: readonly string[],
  how: ParentCloseout['how'],
  git: BranchReader,
) {
  const out: ParentCloseout[] = [];
  for (const id of new Set(ids)) {
    let record: Run;
    let steps: Workflow[];
    try {
      record = runStore.runs.read(id);
      steps = stepsOf(record);
    } catch (err) {
      out.push({ run: id, unreadable: `its record cannot be read: ${(err as Error).message}`, how, landed: false });
      continue;
    }
    const said: ParentStep[] = [];
    for (const step of resultSteps(steps)) said.push(yield* stepSaid(e, record, step));
    const landed = how === 'waited' || (yield* parentRead(id, git).pipe(over(e))).landed;
    out.push({ run: id, asked: firstPiece(record.brief, '\n'), steps: said, how, landed });
  }
  return out;
});

/**
 * What a run's roots are handed of other runs, on the pass that files them: what each run it waited on concluded, landed, then what each
 * run it was handed as context concluded, landed or not (`parentCloseouts`). Undefined for a run with neither.
 */
export const handedOf = Effect.fn('handedOf')(function* (e: Engine, run: Run, git: BranchReader) {
  const waited = run.after?.length ? yield* parentCloseouts(e, run.after, 'waited', git) : [];
  const read = run.context?.length ? yield* parentCloseouts(e, run.context, 'read', git) : [];
  return waited.length || read.length ? [...waited, ...read] : undefined;
});
