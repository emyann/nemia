/**
 * The precedence of the lookup roots (`lookupRoots`), pure: which of them — three at most — a name is read from, or the refusal of a
 * name one repository holds in both of its places. Agents and skills are found through it, on the files (`agentsFor`, `skillsFor`)
 * and in the doors' memory stand-ins, so the four cannot disagree. Its laws are `contracts/lookup.contract.ts`'s.
 */
import type { LookedUp, LookupRoot } from '../../contracts/lookup.contract.ts';

export type { Looked, LookupRoot } from '../../contracts/lookup.contract.ts';

/** The root a name is read from: the first that holds it, refused `both` where a later one is the other place of its repository. */
/** Whether the root `at` of `roots` holds the name, and is a place of `repo` where one is named. */
const holdsAt = (roots: readonly LookupRoot[], at: number, repo?: string): boolean =>
  roots.at(at)?.has === true && (repo === undefined || roots.at(at)?.repo === repo);

export const lookedUp: LookedUp = (roots) => {
  const at = holdsAt(roots, 0) ? 0 : holdsAt(roots, 1) ? 1 : holdsAt(roots, 2) ? 2 : -1;
  if (at < 0) return { kind: 'none' };
  const repo = roots.at(at)?.repo;
  if (repo === undefined) return { kind: 'found', at };
  const again = at < 1 && holdsAt(roots, 1, repo) ? 1 : at < 2 && holdsAt(roots, 2, repo) ? 2 : -1;
  return again < 0 ? { kind: 'found', at } : { kind: 'both', at, again };
};
