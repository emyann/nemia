/**
 * A factory: a named grouping in the one store, naming the repositories its work is on — its name, the lines `wf factory` prints, and the
 * words of its refusals. What is on disk is `factory.store.ts`'s; this is pure.
 *
 * The default factory holds everything that names no factory. It is no file: it is listed first, and never added or removed.
 */

/** The one default factory's name: listed by `wf factory ls`, refused to `wf factory add` and `wf factory rm`. */
export const DEFAULT_FACTORY = 'default';

/** A factory's name: a lowercase slug of 1 to 40 characters, since it names a file in the store and, later, a record's field. */
export const FACTORY_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** A factory as its file says it: its name, the file's minus `.json`, and its repositories, each an absolute path to a directory. */
export type Factory = { name: string; repos: readonly string[] };

/** A factory as `wf factory ls` lists it, with its file; or an entry that does not read as one, with why (`error`). */
export type FactoryListing = (Factory & { file: string }) | { name: string; file: string; error: string };

/** Why `name` cannot name a factory, or undefined: empty, or not a lowercase slug — the slug suggested when lowering its case makes one. */
export function factoryNameRefusal(name: string): string | undefined {
  if (!name) return 'A factory is named by a lowercase slug, and this name is empty. Give the name: wf factory ls lists them.';
  if (FACTORY_NAME.test(name)) return undefined;
  const lower = name.toLowerCase();
  const suggested = FACTORY_NAME.test(lower) ? ` — ${lower}, say` : ' — pipao or nemia-2, say';
  return `\`${name}\` is not a factory's name: a name is lowercase letters, digits and dashes, starts with a letter or a digit, and is at most 40 characters long${suggested}.`;
}

/** The refusal of `wf factory <verb>` on the default factory, which is read, never written. */
export const defaultFactoryRefusal = (verb: 'add' | 'rm'): string =>
  `\`${DEFAULT_FACTORY}\` is the default factory: it holds every run and card that names no factory, and is read, never written, so wf factory ${verb} does not take it. ${verb === 'add' ? 'Give the factory another name.' : 'Remove a factory wf factory ls lists under it.'}`;

/** What `wf factory ls` prints: the default factory first, then each factory by name with its repositories, or why it does not read. */
export function factoryLines(listing: readonly FactoryListing[]): string[] {
  const sorted = [...listing].sort((a, b) => a.name.localeCompare(b.name));
  const width = Math.max(DEFAULT_FACTORY.length, ...sorted.map((l) => l.name.length));
  return [
    `${DEFAULT_FACTORY.padEnd(width)}  every run and card that names no factory — read, never written`,
    ...sorted.map((l) => `${l.name.padEnd(width)}  ${'error' in l ? `${l.file} ${l.error}` : l.repos.join(', ')}`),
  ];
}

/** That the store has no factory `name`, and which it has, by name; the default factory is never one to remove. */
export const noFactoryLine = (name: string, names: readonly string[]): string =>
  `no factory ${name} in the store. ${names.length ? `Its factories are: ${[...names].sort().join(', ')}.` : 'It has none but the default: file one with wf factory add <name> --repo <path>.'}`;
