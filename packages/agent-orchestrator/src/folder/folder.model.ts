/**
 * A definition's model: a workflow, the folder of markdown its steps are files in, and each step, as Schemas at the Workflow door
 * (`src/workflows/workflows.store.ts`). A workflow is addressed by its folder, `WorkflowDir`, minted where a folder is resolved
 * (`workflowFolder`, `workflowDirAt`) and read nominally from a run's record, which names the folder it started on. Each id's rule is
 * its writer's own (`folder.ts`, `factory.ts`), imported rather than copied.
 *
 * Definitions stay files in git (decision 1): these schemas say what a folder holds, and no store becomes its source.
 */
import { Schema } from 'effect';
import { brandedId, type Id } from '../model/brand.model.ts';
import type { ErModel } from '../model/er.model.ts';
import { stepNameRefusal, workflowDirRefusal } from './folder.ts';
import { workflowNameRefusal } from '../factory/factory.ts';
import { afterRefusal, cycleRefusal } from '../workflow/validate.ts';

/** A step's name: its file's name in its workflow's folder, without `.md` (`stepNameRefusal`). */
export const StepName = brandedId('StepName', stepNameRefusal);
export type StepName = Id<'StepName'>;

/** A workflow's name: its folder's (`workflowNameRefusal`). */
export const WorkflowName = brandedId('WorkflowName', workflowNameRefusal);
export type WorkflowName = Id<'WorkflowName'>;

/** A workflow's folder, absolute and resolved, neither the agents' nor the skills' (`workflowDirRefusal`): the Workflow door's id. */
export const WorkflowDir = brandedId('WorkflowDir', workflowDirRefusal);
export type WorkflowDir = Id<'WorkflowDir'>;

/**
 * One step of a workflow, its file `<name>.md` in the folder: its name, the steps it waits on, and the keys that shape the graph — the
 * step it loops back to, whether a person approves it, the command that checks it. Its other keys are its file's (`STEP_KEYS`).
 */
export const WorkflowStep = Schema.Struct({
  name: StepName.OnRead,
  after: Schema.Array(StepName.OnRead),
  loop: Schema.optional(Schema.NullOr(StepName.OnRead)),
  gate: Schema.optional(Schema.NullOr(Schema.Boolean)),
  check: Schema.optional(Schema.NullOr(Schema.String)),
}).annotate({ identifier: 'WorkflowStep' });
export type WorkflowStep = typeof WorkflowStep.Type;

/** The folder's own name: its path's last segment. */
const folderName = (dir: string): string => dir.slice(dir.lastIndexOf('/') + 1);

/**
 * A workflow, the aggregate: its folder, its name, its steps and its README. Its checks are its invariants, refused by the door before a
 * byte is written: one step at least, no name twice (a step is its file), the folder named as the workflow is, every `after:` naming a
 * step of it and none its own (`afterRefusal`), and no steps waiting on each other (`cycleRefusal`) — the rules `validate` reads too.
 */
export const Workflow = Schema.Struct({
  dir: WorkflowDir.OnRead,
  name: WorkflowName.OnRead,
  steps: Schema.Array(WorkflowStep),
  readme: Schema.optional(Schema.String),
})
  .check(
    Schema.makeFilter((w) => w.steps.length > 0 || 'a workflow has at least one step: to remove the workflow, remove its folder'),
    Schema.makeFilter((w) => {
      const twice = w.steps.find((step, i) => w.steps.findIndex((other) => other.name === step.name) !== i);
      return twice === undefined || `two steps are named ${twice.name}, and a step is its file, ${twice.name}.md: rename one of them`;
    }),
    Schema.makeFilter(
      (w) => folderName(w.dir) === w.name || `${w.dir} is not named ${w.name}: a workflow's name is its folder's, so name them alike`,
    ),
    Schema.makeFilter((w) => afterRefusal(w.steps) ?? true),
    Schema.makeFilter((w) => cycleRefusal(w.steps) ?? true),
  )
  .annotate({ identifier: 'Workflow' });
export type Workflow = typeof Workflow.Type;

/**
 * A step as a run's record froze it at start (`Run.workflow`), read loosely: what the stored records hold, a key the model does not name
 * kept, so no record written by an older or newer tick is refused. The same entity as `WorkflowStep`, drawn as it.
 */
export const FrozenWorkflowStep = Schema.StructWithRest(
  Schema.Struct({
    name: Schema.String,
    after: Schema.Array(Schema.String),
    loop: Schema.optional(Schema.String),
    gate: Schema.optional(Schema.Boolean),
    check: Schema.optional(Schema.String),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
).annotate({ identifier: 'WorkflowStep' });

/** A definition's part of the orchestrator's diagram (`model/diagram.model.ts`): its entities, and the ids it owns. */
export const folderModel = {
  entities: [Workflow, WorkflowStep],
  ids: { WorkflowDir: 'Workflow', WorkflowName: 'Workflow', StepName: 'WorkflowStep' },
} satisfies ErModel;
