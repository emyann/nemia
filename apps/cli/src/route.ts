/**
 * Which way a command goes, pure: the api for a moved read, the orchestrator's own CLI for the rest (`contracts/route.contract.ts`).
 */
import type { RouteOf } from '../contracts/route.contract.ts';

export { READ_VERBS, type ReadVerb, type Route, type Routed } from '../contracts/route.contract.ts';

export const routeOf: RouteOf = ({ name, local, help }) =>
  !local && !help && (name === 'show' || name === 'closeout' || name === 'ls' || name === 'inbox' || name === 'watch') ? 'api' : 'process';

/**
 * The name `argv` opens with as the route reads it: its first word, or its first two where the first heads commands of two words and a
 * second word follows (`inbox add`, which is not the moved `inbox`).
 */
export const nameOf = (argv: readonly string[]): string => {
  const [first = '', second] = argv;
  return second !== undefined && !second.startsWith('-') && TWO_WORDS.has(first) ? `${first} ${second}` : first;
};

/** The moved reads that head commands of two words in the orchestrator's table. */
const TWO_WORDS: ReadonlySet<string> = new Set(['inbox']);
