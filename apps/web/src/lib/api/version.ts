/** The version of what serves the board (`GET /api/version`), read through the objects' client as `objects` says it (`VersionAnswer`). */
import { queryOptions } from '@tanstack/react-query';
import { VersionAnswer } from 'objects';
import { call, read } from './objects.ts';

/** The version the api serves, and the code it runs, as its lease records it, where it answers one. */
export type Version = VersionAnswer;

/** The api's version: read once, since it changes only when the api restarts. */
export const versionQuery = queryOptions({
  queryKey: ['version'],
  queryFn: () => call((c) => c.server.version(), read(VersionAnswer)),
  staleTime: Number.POSITIVE_INFINITY,
});
