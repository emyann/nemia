/** The version of what serves the board (`GET /api/version`, apps/api/src/app.ts). */
import { queryOptions } from '@tanstack/react-query';
import { Schema } from 'effect';
import { get } from './read.ts';

/** Mirrors the api's answer: `version`, the orchestrator's package version (`VERSION` in agent-orchestrator). */
export type Version = { version: string };

/** Decodes a `Version`. */
const VersionSchema = Schema.Struct({ version: Schema.String }) satisfies Schema.Schema<Version>;

/** The version, read once a page: it changes only when the api restarts on another, and a page loaded since reads that one. */
export const versionQuery = queryOptions({
  queryKey: ['version'],
  queryFn: () => get('/api/version', VersionSchema),
  staleTime: Number.POSITIVE_INFINITY,
});
