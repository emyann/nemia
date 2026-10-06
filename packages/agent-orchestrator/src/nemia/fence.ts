/**
 * Her fence, derived from the command table's classes (`CommandClass`): the calls she runs unasked, those asked of the person, and those
 * out of her reach (`nemiaFence`). Pure: her task is filed with it (`nemiaSpec`), beside the store's denies and her admission.
 */
import type { CommandClass } from '../admission/index.ts';

/** An entry of the table as her fence reads it: its name and its class. */
type Entry = { readonly name: string; readonly nemia: CommandClass };

/** Her fence: the rules that let a call through unasked (`allow`), ask the person first (`ask`), and refuse it (`deny`). */
export type Fence = { allow: string[]; ask: string[]; deny: string[] };

/** The rule on a command typed bare, and with any words after it. */
const bare = (name: string): string => `Bash(nemia ${name})`;
const any = (name: string): string => `Bash(nemia ${name}:*)`;

/**
 * Her fence off `table`, each command by its class, a command the api alone serves too, as its name is the one the command line would
 * serve it by (`decide`, a verb of the command line's own):
 *
 * - a read, her own write and an answer to what waits on the person run unasked, bare and with any words. Admission asks an answer of the
 *   person where it answers what waits (`admissionOf`): a rule cannot read the run's state;
 * - a write that prompts asks, whatever follows;
 * - a command that reads bare runs unasked, and asks with each word or flag that sets: a word right after its name, a flag anywhere;
 * - a command out of her reach is denied.
 *
 * An allow on a name covers the commands that extend it (`agents`, `agents write`), and their ask or deny stands over it: a harness asks
 * before it allows, and refuses before it asks.
 */
export function nemiaFence(table: readonly Entry[]): Fence {
  const unasked = (name: string) => [bare(name), any(name)];
  const fence: Fence = { allow: [], ask: [], deny: [] };
  for (const { name, nemia } of table) {
    if (nemia === 'out') fence.deny.push(any(name));
    else if (nemia === 'prompts') fence.ask.push(any(name));
    else if (typeof nemia === 'object') {
      fence.allow.push(...unasked(name));
      fence.ask.push(...nemia.setsBy.map((s) => (s.startsWith('-') ? `Bash(nemia ${name} *${s}*)` : `Bash(nemia ${name} ${s}:*)`)));
    } else fence.allow.push(...unasked(name));
  }
  return fence;
}
