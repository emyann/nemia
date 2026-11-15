/**
 * What a step was told, a sub-resource of a run (`GET /api/runs/:runId/steps/:step/told`): its brief by layer and its task by part.
 */
import { Schema } from 'effect';
import { HANDED_HOW, TASK_SOURCES, TOLD_VIA } from './words.ts';

const List = <S extends Schema.Top>(item: S) => Schema.mutable(Schema.Array(item));
const Strings = List(Schema.String);
const NullString = Schema.NullOr(Schema.String);

/** What a step was told by layer (`ToldLayers`, brief.ts). */
const ToldLayers = Schema.Struct({
  agent: NullString.annotate({ description: "The agent's own words it was told; null where the step has none." }),
  instructions: NullString.annotate({ description: "The agent's instructions; null where it has none." }),
  custom: NullString.annotate({ description: "The person's custom instructions for it; null where there are none." }),
  factory: NullString.annotate({
    description: 'The rules of the factory its run was started in, as the run froze them; null where there are none.',
  }),
  agentSkills: Strings.annotate({ description: "The agent's own skills." }),
  policy: Schema.String.annotate({ description: "The step's policy: its own note." }),
  addedSkills: Strings.annotate({ description: 'The skills its line adds.' }),
  fence: List(
    Schema.Struct({
      key: Schema.String.annotate({ description: 'The fence key it tightens.' }),
      value: Schema.String.annotate({ description: 'Its value as resolved, a list joined with a comma.' }),
    }),
  ).annotate({ description: "The fence lines its own file sets over its agent's." }),
  folderFiles: Schema.Boolean.annotate({
    description: 'Whether the session reads the files of the folder it works in; false for a step on a remote agent.',
  }),
  task: NullString.annotate({ description: 'The task, what its brief told it after the layers above; null where there is none.' }),
  via: Schema.Literals(TOLD_VIA).annotate({
    description: "Where the agent's words, the person's and the factory's went: the session's prompt, or the head of its brief.",
  }),
});

/**
 * A part of a step's task (`TaskPart`, told.verb.ts): its own text, with where it came from (`source`) and, for a step's or a check's,
 * the step that gave it (`step`), each absent where the read did not cut it; or a run's section, with how the run was handed.
 */
const TaskPart = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal('text').annotate({ description: "A section's own text." }),
    text: Schema.String.annotate({ description: "The section's text." }),
    source: Schema.optionalKey(
      Schema.Literals(TASK_SOURCES).annotate({
        description: 'Whose words the section carries: a person, a step, a check or a run; absent where the read did not cut it.',
      }),
    ),
    step: Schema.optionalKey(
      Schema.String.annotate({ description: "The step that gave a step's or a check's section; absent otherwise." }),
    ),
  }),
  Schema.Struct({
    kind: Schema.Literal('from').annotate({ description: "A run's section, under a ## From run heading." }),
    run: Schema.String.annotate({ description: "The run's id." }),
    asked: Schema.String.annotate({
      description: 'The first line the run was asked, as the section quotes it; empty where the section says it cannot be read.',
    }),
    body: Schema.String.annotate({ description: "The section's body under its heading." }),
    how: Schema.optionalKey(
      Schema.Literals(HANDED_HOW).annotate({
        description:
          'How the run was handed to the step: waited for a run it waited on, read for one handed as context; absent where the record names it in neither.',
      }),
    ),
  }),
]);

/**
 * What a step was told (`toldOf`, told.verb.ts): its own body in the workflow (null where none shows it), its brief, by layer, and its
 * task by part: `GET /api/runs/:runId/steps/:step/told`.
 */
export const StepTold = Schema.Struct({
  body: NullString.annotate({ description: "The step's own body in the workflow; null where none shows it." }),
  told: NullString.annotate({ description: 'What the step was told, whole; null where nothing was told.' }),
  layers: Schema.NullOr(ToldLayers).annotate({
    description:
      "What it was told by layer: its agent's, the person's, the factory's, the step's policy and its task; null on a record that froze none.",
  }),
  taskParts: Schema.NullOr(List(TaskPart)).annotate({
    description:
      "Its task by part: its own text with where each came from, and each run's section it was handed; null where nothing was told.",
  }),
}).annotate({ identifier: 'StepTold' });
export type StepTold = typeof StepTold.Type;
