/**
 * A step's tries, as a run's detail carries them (apps/api/src/detail/tries.ts), with the files a closeout named (agent-orchestrator's
 * artifacts/artifacts.store.ts) and its check's logs (logs.ts), each type with the schema `get` decodes it with.
 */
import { Schema } from 'effect';

/** A list of strings, mutable as the plain types say: this file's own, as it imports no value from a sibling (`test/api-files.test.ts`). */
const StringsSchema = Schema.mutable(Schema.Array(Schema.String));

/**
 * Mirrors `StepArtifact` in apps/api/src/steps/artifacts.ts: a file a closeout named. One the api serves from the step's files
 * directory has its name, the `url` to read it by, its kind and size; one that directory held until the CLI's `prune --artifacts`
 * removed it has the words that say so, `pruned`, and that moment, `prunedAt`; anything else is the path alone.
 */
export type StepArtifact =
  | { path: string }
  | { path: string; name: string; url: string; kind: 'image' | 'text' | 'other'; size: number }
  | { path: string; pruned: string; prunedAt: string };

/**
 * Decodes a `StepArtifact`. A union takes the first member that decodes and drops the keys it does not know, so the members that own more
 * keys come before the bare path they extend.
 */
export const StepArtifactSchema = Schema.Union([
  Schema.Struct({
    path: Schema.String,
    name: Schema.String,
    url: Schema.String,
    kind: Schema.Literals(['image', 'text', 'other']),
    size: Schema.Number,
  }),
  Schema.Struct({ path: Schema.String, pruned: Schema.String, prunedAt: Schema.String }),
  Schema.Struct({ path: Schema.String }),
]) satisfies Schema.Schema<StepArtifact>;

/** Mirrors `StepReply` in apps/api/src/detail/tries.ts: a loop's target's answer to one finding. */
export type StepReply = { finding: string; answer: string; why: string };

/** Decodes a `StepReply`. */
export const StepReplySchema = Schema.Struct({
  finding: Schema.String,
  answer: Schema.String,
  why: Schema.String,
}) satisfies Schema.Schema<StepReply>;

/**
 * Mirrors `QuestionOption` in agent-orchestrator's question/question.ts: one option of a question, its label and what choosing it means.
 */
export type QuestionOption = { label: string; meaning: string };

/** Decodes a `QuestionOption`. */
export const QuestionOptionSchema = Schema.Struct({ label: Schema.String, meaning: Schema.String }) satisfies Schema.Schema<QuestionOption>;

/**
 * Mirrors `Question` in agent-orchestrator's question/question.ts: its `title`, which an answer names; its `body`; its `options`; the label
 * it `recommended`, or null; and whether `multiple` options may be chosen together.
 */
export type Question = { title: string; body: string; options: QuestionOption[]; recommended: string | null; multiple: boolean };

/** Decodes a `Question`. */
export const QuestionSchema = Schema.Struct({
  title: Schema.String,
  body: Schema.String,
  options: Schema.mutable(Schema.Array(QuestionOptionSchema)),
  recommended: Schema.NullOr(Schema.String),
  multiple: Schema.Boolean,
}) satisfies Schema.Schema<Question>;

/** Mirrors `Asked` in agent-orchestrator's question/question.ts: a question field of a closeout that decoded, and its questions. */
export type AskedQuestions = { field: string; questions: Question[] };

/** Decodes an `AskedQuestions`. */
export const AskedQuestionsSchema = Schema.Struct({
  field: Schema.String,
  questions: Schema.mutable(Schema.Array(QuestionSchema)),
}) satisfies Schema.Schema<AskedQuestions>;

/**
 * Mirrors `StepCloseout` in apps/api/src/detail/tries.ts: with what it gave of its declared output, what it did not, and its `replies`;
 * each declared field's JSON Schema off the workflow the run froze; the `questions` of each question field that decoded, in the schema's
 * order; and the statement as the engine recorded it (`raw`). `summary` is one line, `body` the markdown beneath it, `values` what it
 * handed on beside its files, each with its `link` where the api found it an http(s) address, and `refused` what the run did not accept of
 * it; `apiVersion` is null for a closeout given before the envelope was versioned.
 */
export type StepCloseout = {
  apiVersion: string | null;
  outcome: 'done' | 'blocked';
  summary: string;
  body: string | null;
  needs: string | null;
  artifacts: StepArtifact[];
  values: StepValue[];
  refused: string[];
  output: Record<string, unknown>;
  missing: string[];
  replies: StepReply[] | null;
  schema: Record<string, unknown>;
  questions: AskedQuestions[];
  raw: unknown;
};

/** Mirrors `StepValue` in apps/api/src/steps/artifacts.ts: a value a closeout handed on, by its name, and its link or null. */
export type StepValue = { name: string; value: string; link: string | null };

/** Decodes a `StepValue`. */
export const StepValueSchema = Schema.Struct({
  name: Schema.String,
  value: Schema.String,
  link: Schema.NullOr(Schema.String),
}) satisfies Schema.Schema<StepValue>;

/** A JSON object whose values the board reads as they came: a closeout's output, or the JSON Schema of each of its fields. */
const ObjectSchema = Schema.Record(Schema.String, Schema.Unknown);

/** Decodes a `StepCloseout`: its output, its fields' schemas and the statement itself (`raw`) are read as they came. */
export const StepCloseoutSchema = Schema.Struct({
  apiVersion: Schema.NullOr(Schema.String),
  outcome: Schema.Literals(['done', 'blocked']),
  summary: Schema.String,
  body: Schema.NullOr(Schema.String),
  needs: Schema.NullOr(Schema.String),
  artifacts: Schema.mutable(Schema.Array(StepArtifactSchema)),
  values: Schema.mutable(Schema.Array(StepValueSchema)),
  refused: StringsSchema,
  output: ObjectSchema,
  missing: StringsSchema,
  replies: Schema.NullOr(Schema.mutable(Schema.Array(StepReplySchema))),
  schema: ObjectSchema,
  questions: Schema.mutable(Schema.Array(AskedQuestionsSchema)),
  raw: Schema.Unknown,
}) satisfies Schema.Schema<StepCloseout>;

/** Mirrors `StepLog` in apps/api/src/steps/logs.ts. */
export type StepLog = { lines: string[]; truncated: boolean };

/** Decodes a `StepLog`. */
export const StepLogSchema = Schema.Struct({ lines: StringsSchema, truncated: Schema.Boolean }) satisfies Schema.Schema<StepLog>;

/**
 * Mirrors `StepCheck` in apps/api/src/steps/logs.ts: the command a step is judged by, from the workflow the run
 * froze, its task and verdict — `passed`, `exit 1`, `unfinished`, `checking` — and once its check refused, the
 * exit in the CLI `ls`'s words and the end of each stream. `stdout` is null on an earlier try's check, whose output the api does not read.
 */
export type StepCheck = {
  command: string;
  taskId: string | null;
  verdict: string | null;
  refused: { exit: string; stdout: StepLog | null; stderr: StepLog; unreadable: string | null } | null;
};

/** Decodes a `StepCheck`. */
export const StepCheckSchema = Schema.Struct({
  command: Schema.String,
  taskId: Schema.NullOr(Schema.String),
  verdict: Schema.NullOr(Schema.String),
  refused: Schema.NullOr(
    Schema.Struct({
      exit: Schema.String,
      stdout: Schema.NullOr(StepLogSchema),
      stderr: StepLogSchema,
      unreadable: Schema.NullOr(Schema.String),
    }),
  ),
}) satisfies Schema.Schema<StepCheck>;

/**
 * Mirrors `StepUnreadable` in apps/api/src/detail/tries.ts: a closing statement the api could not read, its words for why, and the
 * statement as it came.
 */
export type StepUnreadable = { error: string; raw: unknown };

/** Decodes a `StepUnreadable`: the statement (`raw`) is read as it came. */
export const StepUnreadableSchema = Schema.Struct({ error: Schema.String, raw: Schema.Unknown }) satisfies Schema.Schema<StepUnreadable>;

/**
 * Mirrors `StepAttempts` in apps/api/src/detail/tries.ts. `endedAt` is when the latest attempt ended — the
 * engine's `Attempt.endedAt` — and null while it runs, or where the engine's record has none.
 */
export type StepAttempts = {
  count: number;
  latest: { startedAt: string; ended: string | null; endedAt: string | null; reason: string | null } | null;
};

/** Decodes a `StepAttempts`. */
export const StepAttemptsSchema = Schema.Struct({
  count: Schema.Number,
  latest: Schema.NullOr(
    Schema.Struct({
      startedAt: Schema.String,
      ended: Schema.NullOr(Schema.String),
      endedAt: Schema.NullOr(Schema.String),
      reason: Schema.NullOr(Schema.String),
    }),
  ),
}) satisfies Schema.Schema<StepAttempts>;

/**
 * Mirrors `StepTry` in apps/api/src/detail/tries.ts: one try of a step, earliest first. `then` is what replaced it, null on the current
 * try, which `current` marks; `note` how it was reached, in the CLI `ls`'s words. `status` is the step's word on the current try, and
 * the engine's word for the task on an earlier one.
 */
export type StepTry = {
  try: number;
  round: number;
  then: 'retries' | 'nudge' | 'fresh' | 'recheck' | 'round' | 'merge' | 'signoff' | 'back' | null;
  current: boolean;
  taskId: string | null;
  note: string | null;
  status: string;
  attempts: StepAttempts;
  check: StepCheck | null;
  closeout: StepCloseout | null;
  /** A statement it gave that could not be read: why, and the statement as it came. `closeout` is null then. */
  unreadable: StepUnreadable | null;
  /** What a person said to this try when they asked for it — the CLI `decide`'s `your answer` — or null. */
  answer: string | null;
};

/** Decodes a `StepTry`. */
export const StepTrySchema = Schema.Struct({
  try: Schema.Number,
  round: Schema.Number,
  then: Schema.NullOr(Schema.Literals(['retries', 'nudge', 'fresh', 'recheck', 'round', 'merge', 'signoff', 'back'])),
  current: Schema.Boolean,
  taskId: Schema.NullOr(Schema.String),
  note: Schema.NullOr(Schema.String),
  status: Schema.String,
  attempts: StepAttemptsSchema,
  check: Schema.NullOr(StepCheckSchema),
  closeout: Schema.NullOr(StepCloseoutSchema),
  unreadable: Schema.NullOr(StepUnreadableSchema),
  answer: Schema.NullOr(Schema.String),
}) satisfies Schema.Schema<StepTry>;
