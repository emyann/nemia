/**
 * `nemia agents sources` as an entry of the command table (`AGENTS_SOURCES`): every agent file the store knows of, read
 * (`agentSources`), to copy into a person's library with `nemia agents copy`.
 */
import { tried } from '../runtime-client.ts';
import type { Command } from '../command/entry.verb.ts';
import { agentSources } from './sources.store.ts';
import { sourcesLines, type AgentSource } from './sources.ts';

/** `nemia agents sources`: every agent file the store knows of, to copy into your library, and the folder named with `--path`. */
export const AGENTS_SOURCES: Command<{ sources: AgentSource[] }> = {
  name: 'agents sources',
  usage: '[--path <folder>]',
  help: ['the agent files the store knows of, to copy into your library:', "each repository's, yours, and those of a --path <folder>"],
  spec: {
    positionals: [],
    flags: [
      {
        flag: '--path',
        kind: 'text',
        key: 'path',
        takes: '--path takes a folder of agent files: nemia agents sources --path <folder>',
        twice: 'nemia agents sources takes --path once.',
      },
    ],
    unknown: (arg) => `nemia agents sources takes no ${arg}: nemia agents sources [--path <folder>]`,
  },
  writes: false,
  class: 'read',
  route: {
    method: 'GET',
    path: '/api/agents/sources',
    status: 200,
    hand: 'the board reads the listing at its own path, beside the agents',
  },
  handler: (args, _env, home) =>
    tried(() => {
      const at = typeof args.path === 'string' ? args.path : undefined;
      return agentSources({ ...(at !== undefined && { at }), ...(home !== undefined && { home }) });
    }),
  print: sourcesLines,
};
