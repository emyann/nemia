/**
 * `nemia memory`: what Nemia keeps of the store, read and never written, an entry of the command table. Bare, the facts she keeps, by
 * name; given one, its words. Her session alone writes them, in her folder's `memory/`; the api serves both reads as the nemia group's
 * `memory` and `fact` (`objects`' Api), calling the handler by type (`MemoryInput`).
 */
import { Effect, Schema } from 'effect';
import { StoreRoot } from '../config/root.store.ts';
import type { Command } from '../command/entry.verb.ts';
import { tried } from '../runtime-client.ts';
import { listFacts, memoryDir, readFact } from './level.store.ts';

/** What `nemia memory` answers: the folder she keeps her facts in, their names, and the words of the one asked (`fact`), if any. */
export type NemiaMemory = { dir: string; facts: string[]; fact: { name: string; text: string } | null };

/** What `nemia memory` takes: the fact whose words to read, none for the names alone. */
export const MemoryInput = Schema.Struct({ fact: Schema.optionalKey(Schema.String) });
export type MemoryInput = typeof MemoryInput.Type;

/** What `nemia memory` prints: one fact's words, or the facts she keeps and where. */
const memoryLines = (data: NemiaMemory): string[] => {
  if (data.fact !== null) return data.fact.text.replace(/\n$/, '').split('\n');
  if (!data.facts.length) return [`Nemia keeps no fact yet (${data.dir}).`];
  return [`Nemia keeps ${data.facts.length} fact${data.facts.length === 1 ? '' : 's'} in ${data.dir}:`, ...data.facts.map((f) => `  ${f}`)];
};

/**
 * `nemia memory [<fact>]`: the facts Nemia keeps, or one fact's words. Refused (`Missing`): a fact she does not keep, naming those she
 * does.
 */
export const MEMORY: Command<NemiaMemory, MemoryInput> = {
  name: 'memory',
  served: [{ endpoint: 'nemia.memory' }, { endpoint: 'nemia.fact', as: 'memory_fact' }],
  usage: '[<fact>]',
  help: ["what Nemia keeps of the store: bare, her facts' names; given one, its", 'words. Read only: her session alone writes them'],
  spec: {
    positionals: [{ key: 'fact', takes: 'optional', kind: 'name' }],
    flags: [],
    unknown: (arg) => `nemia memory takes one fact's name, not ${arg}: nemia memory [<fact>].`,
  },
  writes: false,
  class: 'read',
  only: { side: 'cli', why: "the api serves it as the nemia group's `memory` and `fact` of `objects`' Api, calling this handler" },
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
  print: memoryLines,
};
