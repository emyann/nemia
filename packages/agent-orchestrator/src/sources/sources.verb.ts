/**
 * `nemia agents sources` as an entry of the command table (`AGENTS_SOURCES`): every agent file the store knows of, read
 * (`agentSources`), to copy into a person's library with `nemia agents copy`.
 */
import { Effect, Schema } from 'effect';
import { AGENTS_SOURCES_WORDS } from 'objects';
import type { Served } from '../command/entry.verb.ts';
import { StoreRoot } from '../config/root.store.ts';
import { agentSources } from './sources.store.ts';
import type { AgentSource } from './sources.ts';

/** What `nemia agents sources`' handler takes: the folder of agent files `--path` names, besides those the store knows of. */
export const SourcesInput = Schema.Struct({ path: Schema.optionalKey(Schema.String) });
export type SourcesInput = typeof SourcesInput.Type;

/** `nemia agents sources`: every agent file the store knows of, to copy into your library, and the folder named with `--path`. */
export const AGENTS_SOURCES: Served<{ sources: AgentSource[] }, SourcesInput> = {
  ...AGENTS_SOURCES_WORDS,
  input: SourcesInput,
  handler: ({ path: at }) => Effect.flatMap(StoreRoot, (root) => agentSources({ ...(at !== undefined && { at }), home: root })),
};
