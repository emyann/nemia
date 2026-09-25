import type { QueryClient } from '@tanstack/react-query';
import { agentsQuery, keyFormQuery, skillsQuery, workflowsQuery } from './api';

/**
 * What an agent's write changes on the board: the agents, each read from disk again; the workflows, whose version covers the agents their
 * nodes name; the step form's agents, which a node's agent is picked from; and the skills, each listed with the agents that give it.
 */
export const invalidateAgents = (queryClient: QueryClient): Promise<unknown> =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: agentsQuery.queryKey }),
    queryClient.invalidateQueries({ queryKey: workflowsQuery.queryKey, exact: true }),
    queryClient.invalidateQueries({ queryKey: keyFormQuery.queryKey, exact: true }),
    queryClient.invalidateQueries({ queryKey: skillsQuery.queryKey, exact: true }),
  ]);

/**
 * What a skill copied into your library changes: the skills, and the agents — an agent of yours that gives the name is now given this copy,
 * its card and cost read again — and the workflows, whose version covers what their agents are given.
 */
export const invalidateSkills = (queryClient: QueryClient): Promise<unknown> => invalidateAgents(queryClient);
