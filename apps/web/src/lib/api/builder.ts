/**
 * The builder's form (apps/api/src/workflows/builder.ts). Its writes of a folder of yours answer the folder as the list reads it, and sit
 * beside that read's schema, in workflows.ts.
 */
import { queryOptions } from '@tanstack/react-query';
import { Schema } from 'effect';
import { get } from './read.ts';
import { StepKeySchema, StepSpecPartSchema, type StepKey, type WorkflowStepSpec } from './library.ts';

/** Mirrors `KeyKind` in apps/api/src/workflows/words.ts: how a key is set on a step's form. */
export type KeyKind = 'steps' | 'step' | 'choice' | 'harness-word' | 'text' | 'list' | 'count' | 'dollars' | 'tokens' | 'flag' | 'schema';

/** Decodes a `KeyKind`. */
const KeyKindSchema = Schema.Literals([
  'steps',
  'step',
  'choice',
  'harness-word',
  'text',
  'list',
  'count',
  'dollars',
  'tokens',
  'flag',
  'schema',
]) satisfies Schema.Schema<KeyKind>;

/** A list of strings, as a decoded answer holds it: mutable, as the plain types say. */
const Strings = Schema.mutable(Schema.Array(Schema.String));

/**
 * Mirrors `KeyField` in apps/api/src/workflows/builder.ts: one key of a step's form, its line of meaning, how it is set, and the words it
 * may take.
 */
export type KeyField = {
  key: StepKey;
  meaning: string;
  kind: KeyKind;
  choices: string[] | null;
  byHarness: Record<string, string[]> | null;
};

/** Decodes a `KeyField`. */
const KeyFieldSchema = Schema.Struct({
  key: StepKeySchema,
  meaning: Schema.String,
  kind: KeyKindSchema,
  choices: Schema.NullOr(Strings),
  byHarness: Schema.NullOr(Schema.Record(Schema.String, Strings)),
}) satisfies Schema.Schema<KeyField>;

/**
 * Mirrors `KeyForm` in apps/api/src/workflows/builder.ts: every key a step may set, in the package's order, the harness a step runs on when
 * it names none, the keys a step with an agent takes from it (`roleKeys`), those its file sets as its policy over the agent's
 * (`policyKeys`: the fence keys and the skills and servers it adds), what each agent of yours gives a step (`agents`), and how a step
 * names a remote A2A agent — `harness: <prefix><name>` — with the keys such a step may not set (`remote`), which the form leaves off it
 * (`takes`).
 */
export type KeyForm = {
  keys: KeyField[];
  defaultHarness: string;
  roleKeys: StepKey[];
  policyKeys: StepKey[];
  agents: Record<string, Partial<WorkflowStepSpec>>;
  remote: { prefix: string; refuses: StepKey[] };
};

/** Decodes a `KeyForm`: each key the board reads, of its type and words; a key it does not know is dropped. */
const KeyFormSchema = Schema.Struct({
  keys: Schema.mutable(Schema.Array(KeyFieldSchema)),
  defaultHarness: Schema.String,
  roleKeys: Schema.mutable(Schema.Array(StepKeySchema)),
  policyKeys: Schema.mutable(Schema.Array(StepKeySchema)),
  agents: Schema.Record(Schema.String, StepSpecPartSchema),
  remote: Schema.Struct({ prefix: Schema.String, refuses: Schema.mutable(Schema.Array(StepKeySchema)) }),
}) satisfies Schema.Schema<KeyForm>;

/** What a step's form is drawn from. It changes with the package, so once a visit. */
export const keyFormQuery = queryOptions({
  queryKey: ['step-keys'],
  queryFn: () => get('/api/workflows/keys', KeyFormSchema),
  staleTime: Infinity,
});
