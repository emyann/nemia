/**
 * The handle a test holds on what its test place holds (`World` in `world.ts`): `worldOf(held)` makes a repository, commits a checkout's
 * work, puts a commit on a branch, stages a merge or takes one back, puts a branch back on an older commit, tags, and reads a commit, the
 * paths it changed, a branch's tip, the merge staged in a checkout and what a checkout holds uncommitted, each in memory and in the
 * directories the verbs read. It throws on what a test got wrong — a directory that is no checkout, a name that is no commit — in words
 * that say which.
 */
import { checkoutAt, commitMade, committed, headOf, mergedIn, putBackOn, resolved, takenBack, treeOf, type Found } from './acts.ts';
import { isDirectory, readTree, real, writeChanges } from './disk.ts';
import { changesOf, commitAt, commitOf, type Held, type Repository, type Tree, type World } from './world.ts';

/** The checkout at `dir`, which the place holds. */
function found(held: Held, dir: string): Found {
  const at = checkoutAt(held, dir);
  if (!at) throw new Error(`${dir} is no checkout of this test place: make its repository with world.repository first`);
  return at;
}

/** The id of the commit `rev` names in `repo`, which has it. */
function idOf(repo: Repository, rev: string): string {
  const commit = commitAt(repo, rev);
  if (!commit) throw new Error(`${repo.root} has no commit named ${rev}`);
  return commit.id;
}

/** `tree` with each of `files` set, or taken away where null. */
function changed(tree: Tree, files: Readonly<Record<string, string | null>>): Tree {
  const next: Record<string, string> = { ...tree };
  for (const [file, text] of Object.entries(files)) {
    if (text === null) delete next[file];
    else next[file] = text;
  }
  return next;
}

/** A repository made at `root` on `main`, with `files` written there and committed once. */
function repository(held: Held, root: string, files: Tree): string {
  if (!isDirectory(root)) throw new Error(`${root} is not a directory: make it before a repository in it`);
  const dir = real(root);
  if (held.repositories.has(dir)) throw new Error(`${root} is a repository of this test place already`);
  const repo: Repository = { root: dir, commits: new Map(), branches: new Map(), tags: new Map(), checkouts: new Map() };
  held.repositories.set(dir, repo);
  repo.checkouts.set(dir, { dir, branch: 'main' });
  writeChanges(dir, {}, files);
  return commitMade(held, repo, 'main', files, [], 'base');
}

/** A commit on `name` of `root`'s repository that changes `files`, the branch cut from `from` when new, a checkout on it kept in step. */
function branch(held: Held, root: string, name: string, files: Readonly<Record<string, string | null>>, from: string): string {
  const { repo } = found(held, root);
  const base = repo.branches.get(name) ?? idOf(repo, from);
  const before = commitOf(repo, base).tree;
  const after = changed(before, files);
  for (const checkout of repo.checkouts.values()) if (checkout.branch === name) writeChanges(checkout.dir, before, after);
  return commitMade(held, repo, name, after, [base], `on ${name}`);
}

/** The paths of the checkout at `dir` whose file is not as the commit it is at has it, in order. */
function changes(held: Held, dir: string): string[] {
  const { repo, checkout } = found(held, dir);
  const [at, has] = [treeOf(repo, checkout), readTree(checkout.dir)];
  return [...new Set([...Object.keys(at), ...Object.keys(has)])].filter((file) => at[file] !== has[file]).sort();
}

/** The handle on `held`. */
export function worldOf(held: Held): World {
  return {
    repository: (root, files) => repository(held, root, files),
    commit: (checkout, message) => committed(held, found(held, checkout), message),
    branch: (root, name, files, from = 'main') => branch(held, root, name, files, from),
    stage: (checkout, name) => {
      const at = found(held, checkout);
      if (at.checkout.staged) throw new Error(`${checkout} has a merge staged already: land it or take it back first`);
      mergedIn(held, at, idOf(at.repo, name), false, '');
    },
    resolve: (checkout, file) => resolved(found(held, checkout), file),
    tag: (root, tag, rev) => {
      const { repo } = found(held, root);
      repo.tags.set(tag, idOf(repo, rev));
    },
    head: (checkout) => {
      const at = found(held, checkout);
      return headOf(at.repo, at.checkout);
    },
    read: (root, rev) => {
      const { repo } = found(held, root);
      const { parents, message } = commitOf(repo, idOf(repo, rev));
      return { parents, message };
    },
    changed: (root, rev) => {
      const { repo } = found(held, root);
      const { tree, parents } = commitOf(repo, idOf(repo, rev));
      const [first] = parents;
      return changesOf(first === undefined ? {} : commitOf(repo, first).tree, tree).map((change) => change.path);
    },
    tip: (root, name) => found(held, root).repo.branches.get(name) ?? null,
    changes: (checkout) => changes(held, checkout),
    staged: (checkout) => found(held, checkout).checkout.staged?.heads[0] ?? null,
    takeBack: (checkout) => takenBack(found(held, checkout)),
    putBack: (checkout, rev) => {
      const at = found(held, checkout);
      putBackOn(at, idOf(at.repo, rev));
    },
  };
}
