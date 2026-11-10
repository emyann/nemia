/**
 * What is said of a run's steps without reading them: the workflow a record froze, in the order its steps run (`frozenStepsOf`), and the
 * refusal of a run that froze none whose folder does not load (`UnloadedFolder`), which stops that run alone, never the pass. The read
 * itself is a program over the Workflow door (`stepsOf`, `steps.verb.ts`).
 */
import { orderSteps, type StepSpec } from '../workflow.ts';
import { Invalid } from '../refusal/refusal.ts';
import type { Run } from '../record/record.ts';

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
 * The workflow `run` froze at `nemia start`, in the order its steps run (`orderSteps`): ordered on the way out, so a record frozen in the
 * folder's order, alphabetical, reads in the order its steps run. Undefined for a record that froze none, whose folder is read instead.
 */
export const frozenStepsOf = (run: Run): StepSpec[] | undefined => (run.workflow === undefined ? undefined : orderSteps(run.workflow));
