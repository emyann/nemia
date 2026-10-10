/**
 * What a step is told, by layer, as the api answers it on a run's detail (what its run froze) and on a workflow's listing (what a run of it
 * would be told): one schema, which `detail.ts` and `workflows.ts` both decode with.
 */
import { Schema } from 'effect';

/**
 * Mirrors `ToldLayers` (agent-orchestrator/run), the api's `layers`: what a step was told, by layer — its agent, the agent's
 * instructions and own skills, the person's custom instructions for it, the rules of the factory its run was started in (`factory`, null
 * where the factory keeps none or the step is told none), the step's own note, the skills its line adds and the fence lines it tightens
 * the agent's with, and the task, its brief after them. `via` says where the agent's words, the person's and the factory's went: the
 * session's system prompt (`prompt`), or the head of its brief (`brief`).
 */
export type StepLayers = {
  agent: string | null;
  instructions: string | null;
  custom: string | null;
  factory: string | null;
  agentSkills: string[];
  policy: string;
  addedSkills: string[];
  fence: Array<{ key: string; value: string }>;
  task: string | null;
  via: 'prompt' | 'brief';
};

/** Decodes a `StepLayers`. */
export const StepLayersSchema = Schema.Struct({
  agent: Schema.NullOr(Schema.String),
  instructions: Schema.NullOr(Schema.String),
  custom: Schema.NullOr(Schema.String),
  factory: Schema.NullOr(Schema.String),
  agentSkills: Schema.mutable(Schema.Array(Schema.String)),
  policy: Schema.String,
  addedSkills: Schema.mutable(Schema.Array(Schema.String)),
  fence: Schema.mutable(Schema.Array(Schema.Struct({ key: Schema.String, value: Schema.String }))),
  task: Schema.NullOr(Schema.String),
  via: Schema.Literals(['prompt', 'brief']),
}) satisfies Schema.Schema<StepLayers>;

/**
 * Mirrors `TaskPart` in apps/api/src/detail/told.ts: a part of a step's task — its own text, or a run it was handed, by its id, the first
 * line that run was asked (empty where its section could not read it), the section's body, and how it was handed: waited on until it
 * shipped (`--after`), or read as context (`--from`); absent where the record names it as neither.
 */
export type TaskPart = { kind: 'from'; run: string; asked: string; body: string; how?: 'waited' | 'read' } | { kind: 'text'; text: string };

/** Decodes a `TaskPart`: the `from` member first, the wider one, so a part is never read as the narrower. */
export const TaskPartSchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal('from'),
    run: Schema.String,
    asked: Schema.String,
    body: Schema.String,
    how: Schema.optionalKey(Schema.Literals(['waited', 'read'])),
  }),
  Schema.Struct({ kind: Schema.Literal('text'), text: Schema.String }),
]) satisfies Schema.Schema<TaskPart>;
