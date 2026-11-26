/**
 * `nemia agents` and `nemia agents card`, entries of the command table: the agents of both places, and one agent's card. The client
 * (`apps/cli`) holds their words (`objects`' `COMMAND_WORDS`) and prints what the api answers; the api calls each handler by type, on the
 * repository the request names.
 */
import { Effect } from 'effect';
import { AGENTS_CARD_WORDS, AGENTS_WORDS } from 'objects';
import { StoreRoot } from '../config/root.store.ts';
import { agentCardRead, agentsRead } from './roster.store.ts';
import type { AgentsRead, CardRead } from './roster.ts';
import type { Served } from '../command/entry.verb.ts';
import { AgentCardInput, AgentsInput } from '../agents/library.verb.ts';

/** `nemia agents`: every agent of both places, the repository's then yours, each read now through the Agent door. */
export const AGENTS: Served<AgentsRead, AgentsInput> = {
  ...AGENTS_WORDS,
  input: AgentsInput,
  /** None given, no repository's read: the api gives the repository the request is served on. */
  handler: ({ repo }) => Effect.flatMap(StoreRoot, (root) => agentsRead({ repo, home: root })),
};

/** `nemia agents card`: one agent in the shape of an A2A Agent Card, from the place it is in. */
export const AGENT_CARD: Served<CardRead, AgentCardInput> = {
  ...AGENTS_CARD_WORDS,
  input: AgentCardInput,
  /** None given, no repository's read: the api gives the repository the request is served on. */
  handler: ({ name, repo, from }) =>
    Effect.flatMap(StoreRoot, (root) => agentCardRead(name, { repo, home: root, ...(from !== undefined && { from }) })),
};
