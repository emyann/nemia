/**
 * Whether the run installs the dependencies of a repository's own checkout before it hardlinks a worktree's `node_modules` from it
 * (agent-orchestrator, `checkoutInstall` in src/workspace/workspace.ts; applied by `keepCheckoutInstalled` in
 * src/workspace/worktree.store.ts, which reads the disk this never touches).
 *
 * A checkout Nemia cloned (`cloned`: it lies under the store's `clones/`, where `cloneFolder` keeps a factory's repository named by its
 * URL) is Nemia's, and nobody else installs it: its install is kept current, read afresh at each cut, never remembered. A person's
 * checkout is theirs, and is never written here. A checkout with no `package-lock.json` is not npm's, and nothing is installed. Where the
 * clone has no `node_modules`, nobody installed it; where it has one, it is current exactly when every package its own lockfile names is
 * on its disk as named (`parting`, `lockfileParting` of the clone's lockfile against its own tree, null when they agree).
 *
 * `because` is what the run's log says made the install due: `node_modules` where there is none, or the first package path the tree
 * parts at.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** What the run read of a repository's checkout, at a cut. */
export type CheckoutSeen = {
  /** The checkout is a clone Nemia keeps under the store's `clones/`. */
  readonly cloned: boolean;
  /** It has a `package-lock.json`. */
  readonly lockfile: boolean;
  /** It has a `node_modules` directory. */
  readonly tree: boolean;
  /** Where its lockfile parts from its own `node_modules` on disk (`lockfileParting`), null where they agree or where it has no tree. */
  readonly parting: string | null;
};

/** Whether the checkout's own install is due before its worktrees are given theirs, and why. */
export type CheckoutInstall = { readonly due: false } | { readonly due: true; readonly because: string };

/** The `because` of a checkout with no `node_modules`. */
const NO_TREE = 'node_modules';

const checkoutInstallSpec = spec<(seen: CheckoutSeen) => CheckoutInstall>({
  requires: ({ input: [seen] }) => (seen.tree || seen.parting === null) && (seen.parting === null || seen.parting.length > 0),
  ensures: {
    personsCheckoutUntouched: {
      description: "A checkout Nemia did not clone is a person's, and the run never installs into it",
      condition: ({ input: [seen], output }) => seen.cloned || !output.due,
    },
    notNpmsNotInstalled: {
      description: "A checkout with no package-lock.json is not npm's, and nothing is installed there",
      condition: ({ input: [seen], output }) => seen.lockfile || !output.due,
    },
    uninstalledCloneInstalled: {
      description: 'A clone with a lockfile and no node_modules is installed: nobody else will, and its worktrees would start with none',
      condition: ({ input: [seen], output }) =>
        !(seen.cloned && seen.lockfile && !seen.tree) || (output.due && output.because === NO_TREE),
    },
    partedCloneInstalled: {
      description: 'A clone whose lockfile asks for a package its own tree does not have as named is installed, saying where they part',
      condition: ({ input: [seen], output }) =>
        !(seen.cloned && seen.lockfile && seen.tree && seen.parting !== null) || (output.due && output.because === seen.parting),
    },
    currentCloneLeftAlone: {
      description: 'A clone whose tree has every package its lockfile names, as named, is left as it is: no install on that cut',
      condition: ({ input: [seen], output }) => !(seen.tree && seen.parting === null) || !output.due,
    },
  },
});

/** `checkoutInstall`'s type, which `src/workspace/workspace.ts` takes. */
export type CheckoutInstallOf = Implementation<typeof checkoutInstallSpec>;
