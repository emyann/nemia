/**
 * `nemia agents sources` as an entry of the command table (`AGENTS_SOURCES`): every agent file the store knows of, read
 * (`agentSources`), to copy into a person's library with `nemia agents copy`.
 */
import { Effect, Schema } from 'effect';
import type { Command } from '../command/entry.verb.ts';
import { StoreRoot } from '../config/root.store.ts';
import { agentSources } from './sources.store.ts';
import { sourcesLines, type AgentSource } from './sources.ts';

/** What `nemia agents sources`' handler takes: the folder of agent files `--path` names, besides those the store knows of. */
export const SourcesInput = Schema.Struct({ path: Schema.optionalKey(Schema.String) });
export type SourcesInput = typeof SourcesInput.Type;

/** `nemia agents sources`: every agent file the store knows of, to copy into your library, and the folder named with `--path`. */
export const AGENTS_SOURCES: Command<{ sources: AgentSource[] }, SourcesInput> = {
  name: 'agents sources',
  served: [{ endpoint: 'agents.sources' }],
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
  only: {
    side: 'cli',
    why: "the api serves it as the Agent's `sources` verb of `objects`' Api (`GET /api/agents/sources`), which calls this entry's handler: no route of its own",
  },
  input: SourcesInput,
  handler: ({ path: at }) => Effect.flatMap(StoreRoot, (root) => agentSources({ ...(at !== undefined && { at }), home: root })),
  print: sourcesLines,
};
