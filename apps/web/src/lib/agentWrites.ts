import type { QueryClient } from '@tanstack/react-query';
import { agentsQuery, factoriesQuery, keyFormQuery, skillsQuery, workflowsQuery } from './api';

/**
 * What an agent's write changes on the board: the agents, each read from disk again; the workflows, whose version covers the agents their
 * nodes name; the step form's agents, which a node's agent is picked from; and the skills, each listed — and each on its page — with the
 * agents that give it.
 */
export const invalidateAgents = (queryClient: QueryClient): Promise<unknown> =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: agentsQuery.queryKey }),
    queryClient.invalidateQueries({ queryKey: workflowsQuery.queryKey, exact: true }),
    queryClient.invalidateQueries({ queryKey: keyFormQuery.queryKey, exact: true }),
    queryClient.invalidateQueries({ queryKey: skillsQuery.queryKey }),
  ]);

/**
 * What a skill written into your library changes — copied, made, or changed: the skills, and the agents — an agent that gives the name is
 * now given what was written, its card, cost and version read again — and the workflows, whose version covers what their agents are given.
 */
export const invalidateSkills = (queryClient: QueryClient): Promise<unknown> => invalidateAgents(queryClient);

/**
 * What a hire or a fire changes on the board: every workflow and step read, which say the agent hired into each step; a factory's
 * workflows, read with its hires; the agents, each listed with the steps it fills; and the factories, each with its hires.
 */
export const invalidateHires = (queryClient: QueryClient): Promise<unknown> =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: workflowsQuery.queryKey }),
    queryClient.invalidateQueries({ queryKey: ['factory-workflows'] }),
    queryClient.invalidateQueries({ queryKey: agentsQuery.queryKey }),
    queryClient.invalidateQueries({ queryKey: factoriesQuery.queryKey }),
  ]);
