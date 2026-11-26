/** The models each harness lists (`GET /api/models`), read through the objects' client as `objects` says it (`HarnessModels`). */
import { queryOptions } from '@tanstack/react-query';
import { HarnessModels } from 'objects';
import { call, read } from './objects.ts';

export type { HarnessModels };

/** The models each harness lists, as the daemon last recorded them. */
export const modelsQuery = queryOptions({
  queryKey: ['models'],
  queryFn: () => call((c) => c.server.models(), read(HarnessModels)),
});
