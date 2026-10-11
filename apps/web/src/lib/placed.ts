/**
 * The lists of workflows as the pages keep them, by place: what a page that lists workflows in the address's place loads before it draws
 * (`listPlace`) — with no factory, the list read with none; in a named factory, the factories, which say where it reads, then the api's
 * list in it; a factory that reads nowhere loads no list — and what a write of a folder of yours reads again.
 */
import type { QueryClient } from '@tanstack/react-query';
import { factoriesQuery, workflowsInQuery, workflowsQuery, type PagePlace } from './api';
import { listPlace } from './factories';

/**
 * Loads into `queryClient` what the page at `address` lists its workflows from. Rejects where a read it draws from fails — the factories'
 * for a named factory, the list's in its place — and never for the factories' with no factory, which only tag that list.
 */
export async function loadWorkflowsIn(queryClient: QueryClient, address: PagePlace): Promise<void> {
  if (listPlace(address, []).kind === 'every') {
    await Promise.all([queryClient.ensureQueryData(workflowsQuery), queryClient.prefetchQuery(factoriesQuery)]);
    return;
  }
  const where = listPlace(address, await queryClient.ensureQueryData(factoriesQuery));
  if (where.kind === 'in') await queryClient.ensureQueryData(workflowsInQuery(where.place));
}

/**
 * Reads again every list of workflows `queryClient` keeps, after a write of a folder of yours: the list read with no factory, alone under
 * its key, and each factory's, which lists the folder where it attaches it. Resolves once they are marked.
 */
export const rereadWorkflows = (queryClient: QueryClient): Promise<unknown> =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: workflowsQuery.queryKey, exact: true }),
    queryClient.invalidateQueries({ queryKey: ['factory-workflows'] }),
  ]);
