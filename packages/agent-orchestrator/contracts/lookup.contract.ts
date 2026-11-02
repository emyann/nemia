/**
 * Which of the lookup roots a name is read from (agent-orchestrator, src/skills/skills.ts, `lookedUp`): the roots in the order a name
 * is looked for (`lookupRoots`), each with the repository whose two places — its `workflows/` and its `.claude/` — it is one of, if any,
 * and whether it holds the name. The first root that holds it wins, and a name one repository holds in both of its places is refused,
 * naming both, since nothing says which of the two is read. One decider for agents and skills, on the files and in memory.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * A lookup root as the decider reads it: the repository it is a place of (none for a root of no repository), and whether it holds the
 * name.
 */
export type LookupRoot = { readonly repo: string | undefined; readonly has: boolean };

/** Where a name is read from: the root it is found in, nowhere, or two places of one repository (`at` first, `again` after it). */
export type Looked = { kind: 'found'; at: number } | { kind: 'none' } | { kind: 'both'; at: number; again: number };

/** Whether no root before `at` holds the name. */
const noneBefore = (roots: readonly LookupRoot[], at: number): boolean => !roots.slice(0, at).some((root) => root.has);

/** Whether the root `at` is there and holds the name. */
const holds = (roots: readonly LookupRoot[], at: number): boolean => at >= 0 && at < roots.length && roots[at]?.has === true;

/** Whether a root after `at` holds the name and is the other place of the repository `at` is a place of. */
const heldAgain = (roots: readonly LookupRoot[], at: number): boolean => {
  const first = roots[at];
  return first !== undefined && first.repo !== undefined && roots.slice(at + 1).some((root) => root.has && root.repo === first.repo);
};

const lookedUpSpec = spec<(roots: readonly LookupRoot[]) => Looked>({
  /** `lookupRoots` gives three at most: the workflow's own root, its repository's `.claude/`, the store's `workflows/`. */
  requires: ({ input: [roots] }) => roots.length <= 3,
  ensures: {
    firstWins: {
      description: 'A name is read from the first root that holds it',
      condition: ({ input: [roots], output }) => output.kind === 'none' || (holds(roots, output.at) && noneBefore(roots, output.at)),
    },
    noneOnlyWhenAbsent: {
      description: 'Nothing is found exactly when no root holds the name',
      condition: ({ input: [roots], output }) => (output.kind === 'none') === !roots.some((root) => root.has),
    },
    oneRepositoryTwice: {
      description: 'A name one repository holds in both of its places is refused, naming both',
      condition: ({ input: [roots], output }) => output.kind === 'none' || (output.kind === 'both') === heldAgain(roots, output.at),
    },
    againIsTheOtherPlace: {
      description: 'The second place a refusal names holds the name and is the same repository’s',
      condition: ({ input: [roots], output }) =>
        output.kind !== 'both' ||
        (output.again > output.at && holds(roots, output.again) && roots[output.again]?.repo === roots[output.at]?.repo),
    },
  },
});
export type LookedUp = Implementation<typeof lookedUpSpec>;
