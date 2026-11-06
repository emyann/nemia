/**
 * What a step was told, a sub-resource of a run (`GET /api/runs/:runId/steps/:step/told`): its brief by layer and its task by part.
 */
import { Schema } from 'effect';
import { HANDED_HOW, TOLD_VIA } from './words.ts';

const List = <S extends Schema.Top>(item: S) => Schema.mutable(Schema.Array(item));
const Strings = List(Schema.String);
const NullString = Schema.NullOr(Schema.String);

/** What a step was told by layer (`ToldLayers`, brief.ts). */
const ToldLayers = Schema.Struct({
  agent: NullString,
  instructions: NullString,
  custom: NullString,
  factory: NullString,
  agentSkills: Strings,
  policy: Schema.String,
  addedSkills: Strings,
  fence: List(Schema.Struct({ key: Schema.String, value: Schema.String })),
  folderFiles: Schema.Boolean,
  task: NullString,
  via: Schema.Literals(TOLD_VIA),
});

/** A part of a step's task (`TaskPart`, told.verb.ts): its own text, or a run's section, with how the run was handed. */
const TaskPart = Schema.Union([
  Schema.Struct({ kind: Schema.Literal('text'), text: Schema.String }),
  Schema.Struct({
    kind: Schema.Literal('from'),
    run: Schema.String,
    asked: Schema.String,
    body: Schema.String,
    how: Schema.optionalKey(Schema.Literals(HANDED_HOW)),
  }),
]);

/**
 * What a step was told (`toldOf`, told.verb.ts): its own body in the workflow (null where none shows it), its brief, by layer, and its
 * task by part: `GET /api/runs/:runId/steps/:step/told`.
 */
export const StepTold = Schema.Struct({
  body: NullString,
  told: NullString,
  layers: Schema.NullOr(ToldLayers),
  taskParts: Schema.NullOr(List(TaskPart)),
}).annotate({ identifier: 'StepTold' });
export type StepTold = typeof StepTold.Type;
