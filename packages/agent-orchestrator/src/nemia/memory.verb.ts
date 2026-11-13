/**
 * `nemia memory`: what Nemia keeps of the store, read and never written, an entry of the command table. Bare, the facts she keeps, by
 * name; given one, its words. Her session alone writes them, in her folder's `memory/`; the api serves both reads as the nemia group's
 * `memory` and `fact` (`objects`' Api), calling the handler by type (`MemoryInput`).
 */
import { MEMORY_WORDS } from 'objects';
import { Effect, Schema } from 'effect';
import { StoreRoot } from '../config/root.store.ts';
import type { Served } from '../command/entry.verb.ts';
import { tried } from '../runtime-client.ts';
import { listFacts, memoryDir, readFact } from './level.store.ts';

/** What `nemia memory` answers: the folder she keeps her facts in, their names, and the words of the one asked (`fact`), if any. */
export type NemiaMemory = { dir: string; facts: string[]; fact: { name: string; text: string } | null };

/** What `nemia memory` takes: the fact whose words to read, none for the names alone. */
export const MemoryInput = Schema.Struct({ fact: Schema.optionalKey(Schema.String) });
export type MemoryInput = typeof MemoryInput.Type;

/**
 * `nemia memory [<fact>]`: the facts Nemia keeps, or one fact's words. Refused (`Missing`): a fact she does not keep, naming those she
 * does.
 */
export const MEMORY: Served<NemiaMemory, MemoryInput> = {
  ...MEMORY_WORDS,
  input: MemoryInput,
  handler: ({ fact }) =>
    Effect.flatMap(StoreRoot, (home) =>
      tried(
        () =>
          ({
            dir: memoryDir(home),
            facts: listFacts(home),
            fact: fact === undefined ? null : { name: fact, text: readFact(home, fact) },
          }) satisfies NemiaMemory,
      ),
    ),
};
