/**
 * `nemia memory`: what Nemia keeps of the store, read and never written, an entry of the command table. Bare, the facts she keeps, by
 * name; given one, its words. Her session alone writes them, in her folder's `memory/`; the api serves both reads by a route of its own.
 */
import type { Command } from '../command/entry.verb.ts';
import { tried } from '../runtime-client.ts';
import { listFacts, memoryDir, readFact } from './level.store.ts';

/** What `nemia memory` answers: the folder she keeps her facts in, their names, and the words of the one asked (`fact`), if any. */
export type NemiaMemory = { dir: string; facts: string[]; fact: { name: string; text: string } | null };

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
export const MEMORY: Command<NemiaMemory> = {
  name: 'memory',
  usage: '[<fact>]',
  help: ["what Nemia keeps of the store: bare, her facts' names; given one, its", 'words. Read only: her session alone writes them'],
  spec: {
    positionals: [{ key: 'fact', takes: 'optional', kind: 'name' }],
    flags: [],
    unknown: (arg) => `nemia memory takes one fact's name, not ${arg}: nemia memory [<fact>].`,
  },
  writes: false,
  class: 'read',
  route: [
    { method: 'GET', path: '/api/nemia/memory', status: 200 },
    { method: 'GET', path: '/api/nemia/memory/:fact', status: 200 },
  ],
  handler: (args) =>
    tried(() => {
      const name = typeof args.fact === 'string' ? args.fact : undefined;
      return {
        dir: memoryDir(),
        facts: listFacts(),
        fact: name === undefined ? null : { name, text: readFact(name) },
      } satisfies NemiaMemory;
    }),
  print: memoryLines,
};
