import type { QueryClient } from '@tanstack/react-query';
import { agentsQuery, keyFormQuery, workflowsQuery } from './api';

/**
 * What an agent's write changes on the board: the agents, each read from disk again; the workflows, whose version covers the agents their
 * nodes name; and the step form's agents, which a node's agent is picked from.
 */
export const invalidateAgents = (queryClient: QueryClient): Promise<unknown> =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: agentsQuery.queryKey }),
    queryClient.invalidateQueries({ queryKey: workflowsQuery.queryKey, exact: true }),
    queryClient.invalidateQueries({ queryKey: keyFormQuery.queryKey, exact: true }),
  ]);
