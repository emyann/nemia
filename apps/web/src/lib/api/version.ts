/** The version of what serves the board (`GET /api/version`, apps/api/src/app.ts). */
import { queryOptions } from '@tanstack/react-query';
import { Schema } from 'effect';
import { decodes } from './decodes.ts';
import { get } from './read.ts';

/**
 * The code the api runs, as its lease records it: an install, with its tag and commit, or a checkout; `root` is its folder. Absent from an
 * api that answers no release.
 */
export type VersionRelease = { kind: 'checkout' | 'install'; root: string; tag?: string; commit?: string };

/** Mirrors the api's answer: `version`, the orchestrator's package version (`VERSION` in agent-orchestrator), and the code it runs. */
export type Version = { version: string; release?: VersionRelease };

/** Decodes a `VersionRelease`. */
const VersionReleaseSchema = decodes<VersionRelease>()(
  Schema.Struct({
    kind: Schema.Literals(['checkout', 'install']),
    root: Schema.String,
    tag: Schema.optional(Schema.String),
    commit: Schema.optional(Schema.String),
  }),
);

/** Decodes a `Version`. */
const VersionSchema = decodes<Version>()(
  Schema.Struct({
    version: Schema.String,
    release: Schema.optional(VersionReleaseSchema),
  }),
);

/** The version, read once a page: it changes only when the api restarts on another, and a page loaded since reads that one. */
export const versionQuery = queryOptions({
  queryKey: ['version'],
  queryFn: () => get('/api/version', VersionSchema),
  staleTime: Number.POSITIVE_INFINITY,
});
