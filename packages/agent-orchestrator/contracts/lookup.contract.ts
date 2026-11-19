/**
 * Which of the lookup roots a name is read from (agent-orchestrator, src/skills/skills.ts, `lookedUp`): the roots in the order a name
 * is looked for (`lookupRoots`), each with the repository whose two places — its `workflows/` and its `.claude/` — it is one of, if any,
 * whether it holds the name, and whether it is the store's library (the person's `workflows/`, where it is not the workflow's own root);
 * and whether the factory the run is in has added the name from the library. A library root is read from only for a name the factory has
 * added: a factory resolves a library item once it has added it, and never before. The first root that may be read and holds the name
 * wins, and a name one repository holds in both of its places is refused, naming both, since nothing says which of the two is read. One
 * decider for agents and skills, on the files and in memory. The builtins hold no root: the reader past every root asks the same `added`
 * before it gives one.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * A lookup root as the decider reads it: the repository it is a place of (none for a root of no repository), whether it holds the name,
 * and whether it is the store's library, which a factory reads only for a name it has added.
 */
export type LookupRoot = { readonly repo: string | undefined; readonly has: boolean; readonly library: boolean };

/** Where a name is read from: the root it is found in, nowhere, or two places of one repository (`at` first, `again` after it). */
export type Looked = { kind: 'found'; at: number } | { kind: 'none' } | { kind: 'both'; at: number; again: number };

/** Whether the root `root` holds the name and may be read for it: no library root, or the name added. */
const reads = (root: LookupRoot | undefined, added: boolean) => root !== undefined && root.has && (!root.library || added);

/** Whether no root before `at` holds the name where it may be read. */
const noneBefore = (roots: readonly LookupRoot[], at: number, added: boolean) => !roots.slice(0, at).some((root) => reads(root, added));

/** Whether the root `at` is there, holds the name and may be read for it. */
const holds = (roots: readonly LookupRoot[], at: number, added: boolean) => at >= 0 && at < roots.length && reads(roots[at], added);

/** Whether a root after `at` holds the name where it may be read and is the other place of the repository `at` is a place of. */
const heldAgain = (roots: readonly LookupRoot[], at: number, added: boolean) => {
  const first = roots[at];
  return (
    first !== undefined && first.repo !== undefined && roots.slice(at + 1).some((root) => reads(root, added) && root.repo === first.repo)
  );
};

const lookedUpSpec = spec<(roots: readonly LookupRoot[], added: boolean) => Looked>({
  /** `lookupRoots` gives three at most: the workflow's own root, its repository's `.claude/`, the store's `workflows/`. */
  requires: ({ input: [roots] }) => roots.length <= 3,
  ensures: {
    firstWins: {
      description: 'A name is read from the first root that holds it where it may be read',
      condition: ({ input: [roots, added], output }) =>
        output.kind === 'none' || (holds(roots, output.at, added) && noneBefore(roots, output.at, added)),
    },
    noneOnlyWhenAbsent: {
      description: 'Nothing is found exactly when no root that may be read holds the name',
      condition: ({ input: [roots, added], output }) => (output.kind === 'none') === !roots.some((root) => reads(root, added)),
    },
    libraryOnlyWhenAdded: {
      description: 'A name not added is never read from the library',
      condition: ({ input: [roots, added], output }) => added || output.kind === 'none' || roots[output.at]?.library !== true,
    },
    oneRepositoryTwice: {
      description: 'A name one repository holds in both of its places is refused, naming both',
      condition: ({ input: [roots, added], output }) =>
        output.kind === 'none' || (output.kind === 'both') === heldAgain(roots, output.at, added),
    },
    againIsTheOtherPlace: {
      description: 'The second place a refusal names holds the name and is the same repository’s',
      condition: ({ input: [roots, added], output }) =>
        output.kind !== 'both' ||
        (output.again > output.at && holds(roots, output.again, added) && roots[output.again]?.repo === roots[output.at]?.repo),
    },
  },
});
export type LookedUp = Implementation<typeof lookedUpSpec>;
