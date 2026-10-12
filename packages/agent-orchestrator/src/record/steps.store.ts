/**
 * A run's steps as the tick reads them (`stepsOf`): the workflow it froze, or for a record that froze none, its folder read off disk —
 * and the refusal of such a run whose folder does not load (`UnloadedFolder`), which stops that run alone, never the pass. Beneath the
 * controllers, as `record.store.ts` is, which re-exports `stepsOf`.
 */
import { orderSteps, type Workflow } from '../workflow.ts';
import { wfRoot } from '../config/config.store.ts';
import { loadWorkflows } from '../folder/folder.store.ts';
import { Invalid } from '../refusal/refusal.ts';
import type { Run } from './record.ts';

/**
 * A run that froze no workflow at `nemia start`, whose workflow folder does not load: missing, unreadable, or refused by the parser. Its
 * message names the run, the folder, the load's own words (`why`), and the two ways on: mend the folder, which the next pass reads, or
 * remove the run.
 */
export class UnloadedFolder extends Invalid {
  readonly why: string;
  constructor(run: Pick<Run, 'id' | 'workflowDir'>, why: string) {
    super({
      message:
        `run ${run.id}: it froze no workflow at nemia start, and its workflow folder, ${run.workflowDir}, does not load: ` +
        `${/[.!?]$/.test(why) ? why : `${why}.`} Mend the folder, and the next pass reads it; or nemia rm ${run.id}.`,
    });
    this.why = why;
  }
}

/** The words of `err` when it is an unfrozen run's folder that does not load (`UnloadedFolder`); undefined for any other failure. */
export const unloadedFolder = (err: unknown): string | undefined => (err instanceof UnloadedFolder ? err.message : undefined);

/**
 * The run's steps: the workflow it froze at `nemia start`, in the order they run (`orderSteps`).
 *
 * The folder is read only for a record that froze no workflow, never for a run `nemia start` froze, so nothing written into the folder
 * after `nemia start` reaches it. Ordered on the way out, so a record frozen in the folder's order, alphabetical, reads in the order its
 * steps run. Refuses a record that froze none whose folder does not load (`UnloadedFolder`), read again on every call.
 */
export const stepsOf = (run: Run): Workflow[] => orderSteps(run.workflow ?? folderOf(run));

/**
 * The steps of `run`'s workflow folder, read now (`loadWorkflows`) with the run's places, its repository's and the store's (`wfRoot`), as
 * its page reads it; with no hires, since a record that froze no workflow names no factory. Refuses a folder that does not load
 * (`UnloadedFolder`).
 */
const folderOf = (run: Run): Workflow[] => {
  try {
    return loadWorkflows(run.workflowDir, { repo: run.repo, home: wfRoot() });
  } catch (err) {
    throw new UnloadedFolder(run, err instanceof Error ? err.message : String(err));
  }
};

/**
 * Why the tick leaves `run` out of its pass, read now: the words of its unfrozen folder that does not load (`unloadedFolder`); undefined
 * for a run whose steps read. Throws any other failure.
 */
export const unloadedOf = (run: Run): string | undefined => {
  try {
    stepsOf(run);
    return undefined;
  } catch (err) {
    const why = unloadedFolder(err);
    if (why === undefined) throw err;
    return why;
  }
};

/**
 * The run's steps (`stepsOf`), or none for a run whose folder does not load (`UnloadedFolder`): for a read that judges nothing of the
 * run, as a pause's finishing tasks and held checks are. Throws any other failure.
 */
export const stepsOrNone = (run: Run): Workflow[] => {
  try {
    return stepsOf(run);
  } catch (err) {
    if (unloadedFolder(err) === undefined) throw err;
    return [];
  }
};
