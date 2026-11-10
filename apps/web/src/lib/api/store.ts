/** Your store, as the api reads it (`GET /api/store`), read through the objects' client as `objects` says it (`YourStore`). */
import { queryOptions } from '@tanstack/react-query';
import { YourStore } from 'objects';
import { call, read } from './objects.ts';

export type { YourStore } from 'objects';

/** Your store's folders and lines: read once, since they change only when the api restarts. */
export const storeQuery = queryOptions({
  queryKey: ['store'],
  queryFn: () => call((c) => c.server.store(), read(YourStore)),
  staleTime: Number.POSITIVE_INFINITY,
});
