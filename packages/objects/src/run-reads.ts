/**
 * What the run object's reads answer beside the run itself (`RunsGroup`, run-api.ts): the lines a person types about it (`RunLines`), what
 * a run started with it as context would be handed (`Concluded`), its record as `nemia show --raw` prints it (`RunRecord`), and what
 * `nemia ls` lists (`RunsListed`). The last two are the orchestrator's own reads, said here as the JSON objects they are: a client of
 * them prints them as the orchestrator does, until each is a `Table` of its list (`table.ts`).
 */
import { Schema } from 'effect';

/** A step's lines beside its controls: its approval at its gate, a try in its session, and words said to it. */
export const StepCommands = Schema.Struct({ approve: Schema.String, retry: Schema.String, say: Schema.String }).annotate({
  identifier: 'StepCommands',
});
export type StepCommands = typeof StepCommands.Type;

/**
 * Where the board pages a run's workflow: read from the repository's `workflows/` or yours, its name, the factory it is attached to (null
 * for none) and the repository (null for yours outside a factory).
 */
export const WorkflowPageAddress = Schema.Struct({
  from: Schema.Literals(['repo', 'yours']),
  workflow: Schema.String,
  factory: Schema.NullOr(Schema.String),
  repo: Schema.NullOr(Schema.String),
}).annotate({ identifier: 'WorkflowPageAddress' });
export type WorkflowPageAddress = typeof WorkflowPageAddress.Type;

/**
 * The lines read beside the run object: the run's `decide` and `refresh` lines, each step's by its name, where it came from (null for a run
 * started from no card), and the address of its workflow's page (null where the board pages none). Constant for a run, off its record.
 */
export const RunLines = Schema.Struct({
  decide: Schema.String,
  refresh: Schema.String,
  fromNote: Schema.NullOr(Schema.String),
  steps: Schema.Record(Schema.String, StepCommands),
  workflowPage: Schema.NullOr(WorkflowPageAddress),
}).annotate({ identifier: 'RunLines' });
export type RunLines = typeof RunLines.Type;

/** What a run started now with it as context would be handed: the run, whether it has landed, and its `## From run` section. */
export const Concluded = Schema.Struct({ run: Schema.String, landed: Schema.Boolean, section: Schema.String }).annotate({
  identifier: 'Concluded',
});
export type Concluded = typeof Concluded.Type;

/** A run's record as `nemia show --raw` prints it: its brief cut at 120 characters and each frozen step's body at 60. */
export const RunRecord = Schema.Record(Schema.String, Schema.Unknown).annotate({ identifier: 'RunRecord' });
export type RunRecord = typeof RunRecord.Type;

/**
 * What `nemia ls` lists, every run or the one named: each run with its record, judged or left unjudged, and its result branches; the
 * daemon's standing; where the branches stand; the pause; and the factories' schedules — the orchestrator's `RunsListed`, which `nemia`
 * prints with its lines.
 */
export const RunsListed = Schema.Record(Schema.String, Schema.Unknown).annotate({ identifier: 'RunsListed' });
export type RunsListed = typeof RunsListed.Type;
