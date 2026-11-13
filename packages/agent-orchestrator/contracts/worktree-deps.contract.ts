/**
 * What the run does with a worktree's `node_modules` before it files a step, a try, a round or a check in it (agent-orchestrator,
 * `worktreeDeps` in src/workspace/workspace.ts; applied by `keepWorktreeInstalled` in src/workspace/worktree.store.ts, which reads the
 * disk this never touches).
 *
 * A step merges its base, a person or a landing moves the base, and the branch's `package-lock.json` moves with it while the worktree's
 * `node_modules` stays the tree the run gave it when it cut the worktree. A check or a session filed on that tree judges the workspace,
 * not the work. So the run reads, at each filing and never from what it remembers of the cut, whether the worktree's own tree has every
 * package its lockfile names, as named (`parting`, `lockfileParting` of the worktree's lockfile against its own tree, null when they
 * agree), and provisions it again where it does not: the tree it has is cleared first (`reprovision`), and provisioned as a cut provisions
 * one — hardlinked from the checkout where the checkout's disk gives what the lockfile asks for, `npm ci` where it does not.
 *
 * Only one of this run's own worktrees is ever written (`ours`): never the repository's checkout, a person's or a clone Nemia keeps, nor
 * a folder inside either. A worktree whose `node_modules` is one link to a whole tree (`shared`, cut before the run gave each worktree its
 * own) is left as it is: clearing or installing through the link would write the tree it leads to. A worktree with no
 * `package-lock.json` is not npm's, and nothing is installed there. One with no `node_modules` at all is provisioned as a cut provisions
 * it, which is a cheap read where the checkout has none either.
 *
 * `because` is what the run's log says made it due: `node_modules` where there is none, or the first package path the tree parts at.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** What the run read of a worktree, before a filing in it. */
export type WorktreeSeen = {
  /** It is one of this run's worktrees, under the store's `worktrees/<run>/`: neither the repository's checkout nor inside it. */
  readonly ours: boolean;
  /** It has a `package-lock.json`. */
  readonly lockfile: boolean;
  /** Its `node_modules`: absent, one link to a whole tree, or a directory of its own. */
  readonly tree: 'none' | 'shared' | 'own';
  /** Where its lockfile parts from its own `node_modules` on disk (`lockfileParting`), null where they agree or where it has no tree of its own. */
  readonly parting: string | null;
};

/** What the run does with the worktree's `node_modules` before the filing, and why. */
export type WorktreeDeps =
  | { readonly act: 'keep' }
  | { readonly act: 'provision'; readonly because: string }
  | { readonly act: 'reprovision'; readonly because: string };

/** The `because` of a worktree with no `node_modules`. */
const NO_TREE = 'node_modules';

/** Whether the run writes the worktree's `node_modules` at all. */
const writes = (out: WorktreeDeps): boolean => out.act !== 'keep';

const worktreeDepsSpec = spec<(seen: WorktreeSeen) => WorktreeDeps>({
  requires: ({ input: [seen] }) =>
    (seen.tree === 'own' || seen.parting === null) && (seen.parting === null || seen.parting.length > 0),
  ensures: {
    othersUntouched: {
      description: "A workspace that is not one of this run's worktrees — the repository's checkout, a person's or a clone — is never written",
      condition: ({ input: [seen], output }) => seen.ours || !writes(output),
    },
    sharedTreeUntouched: {
      description: 'A worktree whose node_modules is one link to a whole tree is left as it is: writing it would write the tree it leads to',
      condition: ({ input: [seen], output }) => seen.tree !== 'shared' || !writes(output),
    },
    notNpmsUntouched: {
      description: "A worktree with no package-lock.json is not npm's, and nothing is installed there",
      condition: ({ input: [seen], output }) => seen.lockfile || !writes(output),
    },
    missingTreeProvisioned: {
      description: "One of this run's worktrees with a lockfile and no node_modules is provisioned as a cut provisions it",
      condition: ({ input: [seen], output }) =>
        !(seen.ours && seen.lockfile && seen.tree === 'none') || (output.act === 'provision' && output.because === NO_TREE),
    },
    partedTreeProvisionedAgain: {
      description:
        "One of this run's worktrees whose lockfile asks for a package its own tree does not have as named is cleared and provisioned again, saying where they part",
      condition: ({ input: [seen], output }) =>
        !(seen.ours && seen.lockfile && seen.tree === 'own' && seen.parting !== null) ||
        (output.act === 'reprovision' && output.because === seen.parting),
    },
    currentTreeLeftAlone: {
      description: 'A tree that has every package its lockfile names, as named, is left as it is: no install before this filing',
      condition: ({ input: [seen], output }) => !(seen.tree === 'own' && seen.parting === null) || !writes(output),
    },
  },
});

/** `worktreeDeps`'s type, which `src/workspace/workspace.ts` takes. */
export type WorktreeDepsOf = Implementation<typeof worktreeDepsSpec>;
