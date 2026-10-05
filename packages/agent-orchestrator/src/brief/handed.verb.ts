/**
 * What a run's roots are handed of the runs it waited on and was handed as context, read off their records and the engine: what each
 * concluded (`parentCloseouts`) and, on the pass that files the roots, all of it in order (`handedOf`). A controller, reaching the runtime
 * through the client (`runtime-client.ts`); `handed.ts` words what it reads.
 */
import type { Engine, TaskView } from '../runtime-client.ts';
import type { Workflow } from '../workflow.ts';
import type { Run } from '../record/record.ts';
import { resultSteps } from '../branches/branches.ts';
import { stepsOf } from '../record/record.store.ts';
import { runStore } from '../record/files.store.ts';
import { closeoutOf, parentOf } from '../views/views.verb.ts';
import { phaseOfView } from '../views/views-words.ts';
import type { ParentCloseout, ParentStep } from './handed.ts';

/**
 * What the step `step` of the run `record` said, on the engine's record of its current try (`closeoutOf`) — or why it cannot be given: it
 * was never filed, the engine could not be asked, it holds no closeout, or the closeout does not parse. Never throws.
 */
async function stepSaid(e: Engine, record: Run, step: Workflow): Promise<ParentStep> {
  const taskId = record.steps[step.name]?.taskId;
  if (!taskId) return { name: step.name, unreadable: 'it was never filed' };
  let view: TaskView;
  try {
    view = await e.view(taskId);
  } catch (err) {
    return { name: step.name, unreadable: `the engine could not be asked for its task ${taskId}: ${(err as Error).message}` };
  }
  const c = closeoutOf(new Map([[taskId, view]]), record, step.name);
  if (!c) return { name: step.name, unreadable: `the engine holds no closeout for its task ${taskId}, which is ${phaseOfView(view)}` };
  if ('error' in c) return { name: step.name, unreadable: `its closeout cannot be read: ${c.error}` };
  return { step, said: c };
}

/**
 * What each run this one waited on or was handed as context concluded, for its roots' briefs (`## From run <id>` in `composeBrief`), each
 * marked `how` it was given and whether it had `shipped`, asked of each run that reads: the first line of its brief,
 * and the closeout of each step whose work is that run's result (`resultSteps`), on the engine's record of its current try, read as
 * `nemia decide` reads one (`closeoutOf`). Read once, on the pass that files the roots.
 *
 * The result's steps, not the terminal ones: where a folder's last step is an ending that merges (`workspace: main`), that step's account
 * is of the merge — "merged wf/…/implement onto main, the check passed" — and it declares nothing, so a child handed it would be handed
 * nothing about the work. What the child wants is what the work said, which is the step the ending acts on. A folder with no ending step
 * is unchanged: its terminal steps are its result.
 *
 * It never throws: a parent whose record or workflow does not read, a step never filed, a task the engine holds
 * no closeout for — a failed step whose work a person merged all the same — and a closeout that does not parse each say so in the section,
 * and the roots are filed all the same.
 */
export async function parentCloseouts(
  e: Engine,
  ids: readonly string[],
  how: ParentCloseout['how'],
  shippedOf: (runId: string) => Promise<boolean>,
): Promise<ParentCloseout[]> {
  const out: ParentCloseout[] = [];
  for (const id of new Set(ids)) {
    let record: Run;
    let steps: Workflow[];
    try {
      record = runStore.runs.read(id);
      steps = stepsOf(record);
    } catch (err) {
      out.push({ run: id, unreadable: `its record cannot be read: ${(err as Error).message}`, how, shipped: false });
      continue;
    }
    const said: ParentStep[] = [];
    for (const step of resultSteps(steps)) said.push(await stepSaid(e, record, step));
    out.push({ run: id, asked: record.brief.split('\n')[0], steps: said, how, shipped: await shippedOf(id) });
  }
  return out;
}

/**
 * What a run's roots are handed of other runs, on the pass that files them: what each run it waited on concluded, shipped, then what each
 * run it was handed as context concluded, shipped or not as `parentOf` reads it now (`parentCloseouts`). Undefined for a run with neither.
 */
export async function handedOf(e: Engine, run: Run): Promise<ParentCloseout[] | undefined> {
  const waited = run.after?.length ? await parentCloseouts(e, run.after, 'waited', async () => true) : [];
  const read = run.context?.length ? await parentCloseouts(e, run.context, 'read', async (id) => (await parentOf(e, id)).shipped) : [];
  return waited.length || read.length ? [...waited, ...read] : undefined;
}
