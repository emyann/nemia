/**
 * What changes a repository the test place holds, in memory and in its directories together: a checkout found by its directory
 * (`checkoutAt`), a commit of what a checkout holds (`committed`), a branch merged into a checkout (`mergedIn`), a path of a staged
 * merge resolved (`resolved`), a staged merge taken back (`takenBack`), a branch put back on a commit (`putBackOn`), and a commit made of
 * files alone (`commitMade`). The verbs
 * (`reads.ts`, `writes.ts`) and the handle a test holds (`handle.ts`) act through these, so a workspace a verb cut and a commit a test
 * made are one repository.
 */
import { markStaged, readTree, real, writeChanges } from './disk.ts';
import { baseOf, commitOf, merged, nextId, within, type Checkout, type Held, type Repository, type Tree } from './world.ts';

/** A checkout the place holds, with its repository. */
export type Found = { readonly repo: Repository; readonly checkout: Checkout };

/** The checkout whose directory is `dir`, with its repository, or undefined where the place holds none there. */
export function checkoutAt(held: Held, dir: string): Found | undefined {
  const at = real(dir);
  for (const repo of held.repositories.values()) {
    const checkout = repo.checkouts.get(at);
    if (checkout) return { repo, checkout };
  }
  return undefined;
}

/** The repository `dir` is a checkout of, or undefined. */
export const repositoryAt = (held: Held, dir: string): Repository | undefined => checkoutAt(held, dir)?.repo;

/** The commit `checkout` is at. */
export function headOf(repo: Repository, checkout: Checkout): string {
  const head = repo.branches.get(checkout.branch);
  if (head === undefined) throw new Error(`${checkout.dir} is on ${checkout.branch}, a branch ${repo.root} no longer has`);
  return head;
}

/** A commit of `tree` after `parents` under `message`, made in `repo` and put on `branch`; answers its id. */
export function commitMade(held: Held, repo: Repository, branch: string, tree: Tree, parents: readonly string[], message: string): string {
  const id = nextId(held);
  repo.commits.set(id, { id, tree, parents, message });
  repo.branches.set(branch, id);
  return id;
}

/** Whether `checkout` holds anything its commit does not: a file that differs, or a merge staged. */
export const dirty = (repo: Repository, checkout: Checkout): boolean =>
  checkout.staged !== undefined || JSON.stringify(sorted(readTree(checkout.dir))) !== JSON.stringify(sorted(treeOf(repo, checkout)));

/** The files of the commit `checkout` is at. */
export const treeOf = (repo: Repository, checkout: Checkout): Tree => commitOf(repo, headOf(repo, checkout)).tree;

/** `tree` with its paths in order. */
const sorted = (tree: Tree): Tree => Object.fromEntries(Object.entries(tree).sort(([a], [b]) => (a < b ? -1 : 1)));

/**
 * `found`'s checkout committed on its branch under `message`, after the commit it is at and each commit of a merge staged there, which
 * this ends: `tree` where given, else its files as its directory has them. Answers the commit.
 */
export function committed(held: Held, { repo, checkout }: Found, message: string, tree: Tree = readTree(checkout.dir)): string {
  const parents = [headOf(repo, checkout), ...(checkout.staged?.heads ?? [])];
  const id = commitMade(held, repo, checkout.branch, tree, parents, message);
  if (checkout.staged) markStaged(checkout.dir, false);
  delete checkout.staged;
  return id;
}

/**
 * `file` of the merge staged in `found`'s checkout taken as its directory has it now, or as gone where it has none, and no longer in
 * conflict: what a person does to resolve a path, or to add an edit to the merge.
 */
export function resolved({ checkout }: Found, file: string): void {
  const { staged } = checkout;
  if (!staged) throw new Error(`${checkout.dir} has no merge staged, so ${file} is no path of one to resolve`);
  const { [file]: _was, ...rest } = staged.tree;
  const now = readTree(checkout.dir)[file];
  checkout.staged = {
    heads: staged.heads,
    conflicts: staged.conflicts.filter((p) => p !== file),
    tree: now === undefined ? rest : { ...rest, [file]: now },
  };
}

/**
 * The commit `tip` merged into `found`'s checkout, its directory brought to the merge's files with every other file left as it is.
 * Nothing where the checkout already holds `tip`. With `commit`, the checkout moves to `tip` where it only follows it, and a merge with no
 * conflict is committed under `message`; otherwise, and for every conflict, the merge is left staged.
 */
export function mergedIn(held: Held, { repo, checkout }: Found, tip: string, commit: boolean, message: string): void {
  const head = headOf(repo, checkout);
  if (within(repo, tip, head)) return;
  const [ours, theirs] = [commitOf(repo, head).tree, commitOf(repo, tip).tree];
  if (commit && within(repo, head, tip)) {
    writeChanges(checkout.dir, ours, theirs);
    repo.branches.set(checkout.branch, tip);
    return;
  }
  const { tree, conflicts } = merged(baseOf(repo, head, tip)?.tree ?? {}, ours, theirs);
  writeChanges(checkout.dir, ours, tree);
  if (commit && !conflicts.length) {
    commitMade(held, repo, checkout.branch, tree, [head, tip], message);
    return;
  }
  checkout.staged = { heads: [tip], conflicts, tree };
  markStaged(checkout.dir, true);
}

/** The merge staged in `found`'s checkout taken back: the files it changed as the checkout's commit has them, and nothing staged. */
export function takenBack({ repo, checkout }: Found): void {
  if (!checkout.staged) return;
  writeChanges(checkout.dir, checkout.staged.tree, treeOf(repo, checkout));
  markStaged(checkout.dir, false);
  delete checkout.staged;
}

/**
 * The branch of `found`'s checkout put back on the commit `id`, which the repository holds: each file its commit, a merge staged there or
 * `id` knows is as `id` has it, every other file left as it is, and nothing staged.
 */
export function putBackOn({ repo, checkout }: Found, id: string): void {
  const [to, has] = [commitOf(repo, id).tree, readTree(checkout.dir)];
  const known = new Set([...Object.keys(treeOf(repo, checkout)), ...Object.keys(checkout.staged?.tree ?? {}), ...Object.keys(to)]);
  writeChanges(checkout.dir, Object.fromEntries(Object.entries(has).filter(([file]) => known.has(file))), to);
  if (checkout.staged) markStaged(checkout.dir, false);
  delete checkout.staged;
  repo.branches.set(checkout.branch, id);
}
