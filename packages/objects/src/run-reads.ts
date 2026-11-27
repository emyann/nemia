/**
 * What the run object's reads answer beside the run itself (`RunsGroup`, run-api.ts): the lines a person types about it (`RunLines`), what
 * a run started with it as context would be handed (`Concluded`), its record as `nemia show --raw` prints it (`RunRecord`), and what
 * `nemia ls` lists (`RunsListed`). The last two are the orchestrator's own reads, said here as the JSON objects they are: a client of
 * them prints them as the orchestrator does, until each is a `Table` of its list (`table.ts`).
 */
import { Schema } from 'effect';

/** A step's lines beside its controls: its approval at its gate, a try in its session, and words said to it. */
export const StepCommands = Schema.Struct({
  approve: Schema.String.annotate({ description: 'The line that approves the step at its gate (nemia approve).' }),
  retry: Schema.String.annotate({ description: 'The line that tries the step again in its session (nemia retry).' }),
  say: Schema.String.annotate({ description: 'The line that says words to its session (nemia say).' }),
}).annotate({
  identifier: 'StepCommands',
});
export type StepCommands = typeof StepCommands.Type;

/**
 * Where the board pages a run's workflow: read from the repository's `workflows/` or the person's library, its name, the factory it is
 * attached to (null for none) and the repository (null for the library's outside a factory).
 */
export const WorkflowPageAddress = Schema.Struct({
  from: Schema.Literals(['repo', 'user']).annotate({
    description: "Where the workflow is read from: the repository's workflows folder, or the person's library (`user`).",
  }),
  workflow: Schema.String.annotate({ description: "The workflow's name." }),
  factory: Schema.NullOr(Schema.String).annotate({ description: 'The factory it is attached to; null for none.' }),
  repo: Schema.NullOr(Schema.String).annotate({ description: 'The repository it is read from; null for the library outside a factory.' }),
}).annotate({ identifier: 'WorkflowPageAddress' });
export type WorkflowPageAddress = typeof WorkflowPageAddress.Type;

/**
 * The lines read beside the run object: the run's `decide` and `refresh` lines, each step's by its name, where it came from (null for a run
 * started from no card), and the address of its workflow's page (null where the board pages none). Constant for a run, off its record.
 */
export const RunLines = Schema.Struct({
  decide: Schema.String.annotate({ description: 'The line that shows what to decide about the run (nemia decide).' }),
  refresh: Schema.String.annotate({
    description: 'The line that pins the run to the new revisions of its workflow, agents and skills (nemia refresh).',
  }),
  fromNote: Schema.NullOr(Schema.String).annotate({
    description: 'Where the run came from, in words; null for a run started from no card.',
  }),
  steps: Schema.Record(Schema.String, StepCommands).annotate({ description: "Each step's lines, by its name: approve, retry and say." }),
  workflowPage: Schema.NullOr(WorkflowPageAddress).annotate({
    description: "Where the board pages the run's workflow; null where it pages none.",
  }),
}).annotate({ identifier: 'RunLines' });
export type RunLines = typeof RunLines.Type;

/** What a run started now with it as context would be handed: the run, whether it has succeeded, and its `## From run` section. */
export const Concluded = Schema.Struct({
  run: Schema.String.annotate({ description: "The run's id." }),
  succeeded: Schema.Boolean.annotate({ description: 'Whether it has succeeded.' }),
  section: Schema.String.annotate({ description: 'Its ## From run section, as a run started now with it as context would be handed it.' }),
}).annotate({
  identifier: 'Concluded',
});
export type Concluded = typeof Concluded.Type;

/** A run's record as `nemia show --raw` prints it: its brief cut at 120 characters and each frozen step's body at 60. */
export const RunRecord = Schema.Record(Schema.String, Schema.Unknown).annotate({ identifier: 'RunRecord' });
export type RunRecord = typeof RunRecord.Type;
