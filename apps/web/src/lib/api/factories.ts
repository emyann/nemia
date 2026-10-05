/** The factories (`GET /api/factories`, apps/api/src/factories/factories.ts). */
import { queryOptions } from '@tanstack/react-query';
import { Schema } from 'effect';
import { get } from './read.ts';

/**
 * Mirrors `FactoryAnswer` in apps/api/src/factories/factories.ts: a factory's name, whether it is the default factory, the repositories it
 * works on, the workflows it offers — null for the default factory, which offers every workflow found — and its hires, `<workflow>/<step>`
 * to an agent's name. A factory whose file does not read has none of them, and `error` says why, naming the file; null for every other.
 */
export type Factory = {
  name: string;
  default: boolean;
  repos: string[];
  workflows: string[] | null;
  hires: Record<string, string>;
  error: string | null;
  /** The lines a person types for it: a workflow attached to it, its file removed, and filed again. */
  commands: { attach: string; rm: string; add: string };
};

/** Decodes a `Factory`. */
const FactorySchema = Schema.Struct({
  name: Schema.String,
  default: Schema.Boolean,
  repos: Schema.mutable(Schema.Array(Schema.String)),
  workflows: Schema.NullOr(Schema.mutable(Schema.Array(Schema.String))),
  hires: Schema.Record(Schema.String, Schema.String),
  error: Schema.NullOr(Schema.String),
  commands: Schema.Struct({ attach: Schema.String, rm: Schema.String, add: Schema.String }),
}) satisfies Schema.Schema<Factory>;

/**
 * The factories: the default factory first, then each in the store. Not polled: a factory changes when a person runs the CLI's `factory`.
 * Read again on each visit.
 */
export const factoriesQuery = queryOptions({
  queryKey: ['factories'],
  queryFn: () => get('/api/factories', Schema.mutable(Schema.Array(FactorySchema))),
});
