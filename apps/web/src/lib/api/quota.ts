/** The subscription's quota (`GET /api/quota`), read through the objects' client as `objects` says it (`Quota`, `QuotaWindow`). */
import { queryOptions } from '@tanstack/react-query';
import { Quota } from 'objects';
import { call, read } from './objects.ts';

export type { Quota, QuotaWindow } from 'objects';

/**
 * The subscription's quota, read again every minute — the api asks Claude Code at most once a keep, however often it is read — and every
 * 2 s while the api is still asking.
 */
export const quotaQuery = queryOptions({
  queryKey: ['quota'],
  queryFn: () => call((c) => c.server.quota(), read(Quota)),
  refetchInterval: (query) => (query.state.data?.state === 'asking' ? 2_000 : 60_000),
});
