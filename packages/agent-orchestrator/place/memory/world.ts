/**
 * What the test place holds in memory: repositories as commits (each a snapshot of its files), branches, tags and checkouts, with what
 * is read of them — a commit's ancestors, the base two commits share, a merge by file, the files and lines a change touched. Pure, and
 * no file is read here: `disk.ts` reads a checkout's directory, `acts.ts` changes a repository, and `World` is the handle a test holds
 * on all of it (`handle.ts`).
 *
 * A merge is by file: a path both sides changed differently is a conflict, wherever in the file each changed it.
 */

/** A commit's files, or a directory's: each path from the root, with `/` between its parts, and its text. */
export type Tree = Readonly<Record<string, string>>;

/** One commit: its id, its files, the commits it follows, and its message. */
export type Commit = { readonly id: string; readonly tree: Tree; readonly parents: readonly string[]; readonly message: string };

/** A merge staged in a checkout and not committed: the commits it merges, the paths left conflicted, and the files it gives. */
export type Staged = { readonly heads: readonly string[]; readonly conflicts: readonly string[]; readonly tree: Tree };

/** A directory that holds a branch's files: the repository's own, at its root, or a workspace cut from it. */
export type Checkout = { readonly dir: string; readonly branch: string; staged?: Staged };

/** One repository: its root, and its commits, branches and tags by name, and its checkouts by directory. */
export type Repository = {
  readonly root: string;
  readonly commits: Map<string, Commit>;
  readonly branches: Map<string, string>;
  readonly tags: Map<string, string>;
  readonly checkouts: Map<string, Checkout>;
};

/** Everything one test place holds: its repositories by root, and how many commits it has made, which names the next. */
export type Held = { readonly repositories: Map<string, Repository>; made: number };

/**
 * What a session and a person do to a repository, which no verb of a place does: make one, commit, stage a merge, tag, and read a commit.
 * One for the test place, over what it holds, and one over git for the place's contract.
 */
export type World = {
  /** A repository made at `root`, a directory, on `main`, with `files` committed once; answers that commit. */
  readonly repository: (root: string, files: Tree) => string;
  /** What `checkout` holds committed on its branch, under `message`, as a session commits its work; answers the commit. */
  readonly commit: (checkout: string, message: string) => string;
  /** A commit on `name` of `root` that sets each of `files` (null takes one away), the branch cut from `from` when new; the commit. */
  readonly branch: (root: string, name: string, files: Readonly<Record<string, string | null>>, from?: string) => string;
  /** The merge of `branch` staged in `checkout` and not committed, conflicts left in its files, as a landing session stages it. */
  readonly stage: (checkout: string, branch: string) => void;
  /** `tag` put on the commit `rev` names in `root`. */
  readonly tag: (root: string, tag: string, rev: string) => void;
  /** The commit `checkout` is at. */
  readonly head: (checkout: string) => string;
  /** The parents and the message of the commit `rev` names in `root`. */
  readonly read: (root: string, rev: string) => { readonly parents: readonly string[]; readonly message: string };
};

/** A new id for a commit of `held`: forty hexadecimal characters, counted. */
export function nextId(held: Held): string {
  held.made += 1;
  return held.made.toString(16).padStart(40, '0');
}

/** The commit `rev` names in `repo` — a branch, a tag or a commit's id — or undefined where it names none. */
export function commitAt(repo: Repository, rev: string): Commit | undefined {
  const id = repo.branches.get(rev.replace(/^refs\/heads\//, '')) ?? repo.tags.get(rev.replace(/^refs\/tags\//, '')) ?? rev;
  return repo.commits.get(id);
}

/** The commit `id` names in `repo`, which holds it. */
export function commitOf(repo: Repository, id: string): Commit {
  const commit = repo.commits.get(id);
  if (!commit) throw new Error(`${repo.root} holds no commit ${id}`);
  return commit;
}

/** Every commit `id` follows in `repo`, itself among them. */
export function ancestors(repo: Repository, id: string): Set<string> {
  const seen = new Set<string>();
  const next = [id];
  while (next.length) {
    const at = next.pop()!;
    if (seen.has(at)) continue;
    seen.add(at);
    next.push(...(repo.commits.get(at)?.parents ?? []));
  }
  return seen;
}

/** Whether `id` is `of` or a commit it follows. */
export const within = (repo: Repository, id: string, of: string): boolean => ancestors(repo, of).has(id);

/** How many commits `tip` holds that `base` does not. */
export function ahead(repo: Repository, base: string, tip: string): number {
  const below = ancestors(repo, base);
  return [...ancestors(repo, tip)].filter((id) => !below.has(id)).length;
}

/** The latest commit `a` and `b` both follow: the shared one that follows the most, or undefined where they share none. */
export function baseOf(repo: Repository, a: string, b: string): Commit | undefined {
  const ofB = ancestors(repo, b);
  const shared = [...ancestors(repo, a)].filter((id) => ofB.has(id));
  const depth = (id: string) => ancestors(repo, id).size;
  const best = shared.reduce<string | undefined>((at, id) => (at === undefined || depth(id) > depth(at) ? id : at), undefined);
  return best === undefined ? undefined : repo.commits.get(best);
}

/** `text` with both sides of a conflict in it, between the marks a person resolves. */
const conflictText = (ours: string | undefined, theirs: string | undefined): string =>
  `<<<<<<< ours\n${ours ?? ''}=======\n${theirs ?? ''}>>>>>>> theirs\n`;

/**
 * `theirs` merged into `ours`, both changed from `base`, by file: a path one side alone changed is that side's, one both changed alike is
 * theirs, and one both changed differently is a conflict, listed in order and left in `tree` with both texts between marks.
 */
export function merged(base: Tree, ours: Tree, theirs: Tree): { readonly tree: Tree; readonly conflicts: readonly string[] } {
  const tree: Record<string, string> = {};
  const conflicts: string[] = [];
  for (const path of [...new Set([...Object.keys(ours), ...Object.keys(theirs), ...Object.keys(base)])].sort()) {
    const [was, mine, other] = [base[path], ours[path], theirs[path]];
    const kept = other === was || mine === other ? mine : mine === was ? other : null;
    if (kept === null) {
      conflicts.push(path);
      tree[path] = conflictText(mine, other);
    } else if (kept !== undefined) tree[path] = kept;
  }
  return { tree, conflicts };
}

/** A text's lines, its last one counted whether or not it ends in a line break. */
export const linesOf = (text: string): string[] => (text === '' ? [] : text.replace(/\n$/, '').split('\n'));

/**
 * What turns the lines `from` into `to`, in order: each line kept (` `), taken away (`-`) or added (`+`), the lines taken away at one
 * spot before those added there, found on the longest run of lines both keep.
 */
export function lineChanges(from: readonly string[], to: readonly string[]): string[] {
  const kept = Array.from({ length: from.length + 1 }, () => Array.from({ length: to.length + 1 }, () => 0));
  for (let i = from.length - 1; i >= 0; i--)
    for (let j = to.length - 1; j >= 0; j--)
      kept[i][j] = from[i] === to[j] ? kept[i + 1][j + 1] + 1 : Math.max(kept[i + 1][j], kept[i][j + 1]);
  const changes: string[] = [];
  let [i, j] = [0, 0];
  while (i < from.length || j < to.length) {
    if (i < from.length && j < to.length && from[i] === to[j]) {
      changes.push(` ${from[i]}`);
      i += 1;
      j += 1;
    } else if (i < from.length && (j === to.length || kept[i + 1][j] >= kept[i][j + 1])) changes.push(`-${from[i++]}`);
    else changes.push(`+${to[j++]}`);
  }
  return changes;
}

/** One file a change touched: its path, how (`A` added, `M` modified, `D` deleted), its lines added and removed, and its diff. */
export type Change = {
  readonly path: string;
  readonly status: 'A' | 'M' | 'D';
  readonly added: number;
  readonly removed: number;
  readonly diff: string;
};

/** The files that differ between `from` and `to`, by path in order, each with its line counts and a diff of the whole file. */
export function changesOf(from: Tree, to: Tree): Change[] {
  return [...new Set([...Object.keys(from), ...Object.keys(to)])]
    .sort()
    .filter((path) => from[path] !== to[path])
    .map((path) => {
      const lines = lineChanges(linesOf(from[path] ?? ''), linesOf(to[path] ?? ''));
      const status = from[path] === undefined ? 'A' : to[path] === undefined ? 'D' : 'M';
      const heads = [`diff a/${path} b/${path}`, `--- ${status === 'A' ? '/dev/null' : `a/${path}`}`];
      heads.push(`+++ ${status === 'D' ? '/dev/null' : `b/${path}`}`);
      return {
        path,
        status,
        added: lines.filter((l) => l.startsWith('+')).length,
        removed: lines.filter((l) => l.startsWith('-')).length,
        diff: `${[...heads, ...lines].join('\n')}\n`,
      };
    });
}

/** Whether `path` is a file, a directory or absent in `tree`. */
export const kindIn = (tree: Tree, path: string): 'file' | 'directory' | 'absent' =>
  tree[path] !== undefined ? 'file' : Object.keys(tree).some((p) => p.startsWith(`${path}/`)) ? 'directory' : 'absent';
