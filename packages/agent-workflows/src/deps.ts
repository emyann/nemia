/**
 * What a fresh worktree needs that git did not give it — the pure half.
 *
 * A worktree holds tracked files only. Two things fill the rest in, both decided here from names and
 * applied by `runner.ts`, which reads the disk this file never touches:
 *
 * - **`node_modules`, per worktree.** It used to be one link to the main checkout's whole tree, and
 *   npm workspaces are links whose real path is the main checkout — so a worktree's apps imported
 *   main's packages: a branch's api change was tested against main's agent-workflows, and once main
 *   moved under the branch its check failed on tests it never touched. `depsPlan` gives the worktree
 *   a `node_modules` of its own made of links: a workspace package to the worktree's own copy, every
 *   other package to main's. When the branch's lockfile asks for a tree main has not installed, links
 *   would lie, and the runner runs `npm ci` instead (`lockfileParting`).
 * - **`.worktreeinclude`**, the gitignored paths a repository says a new worktree needs, the file
 *   Claude Code's `--worktree` reads. `worktreeInclude` parses it.
 */
import path from 'node:path';

/** One entry of a `node_modules` directory as the runner read it: its name, and a link's target as written. */
export type DepEntry = { name: string; link?: string };

/**
 * The main checkout's `node_modules`, listed: its top-level entries, the entries of each `@scope`
 * directory, and those of `.bin`. A listing, not a tree: nothing below a package is read.
 */
export type DepsListing = {
  entries: readonly DepEntry[];
  scopes: Readonly<Record<string, readonly DepEntry[]>>;
  bins: readonly DepEntry[];
};

/** One thing to make in the worktree: a directory of its own, or a link. A link's target is written as given. */
export type DepsAction = { kind: 'dir'; path: string } | { kind: 'link'; path: string; target: string };

/** What a worktree's `node_modules` turned out to be. `runner.ts`'s `provisionDeps` returns it. */
export type Provisioned =
  /** Made from `depsPlan`: `made` is how many entries this call added, so 0 on a second call. */
  | { tree: 'linked'; made: number }
  /** A tree npm installed here, because the lockfile asks for one main has not installed. `installed`: this call ran `npm ci`. */
  | { tree: 'own'; installed: boolean }
  /** It could not be made: `npm ci` exited non-zero or timed out, or a link could not be written. */
  | { tree: 'failed'; error: string }
  /** The main checkout has no `node_modules`, and the lockfiles agree: nothing to provision. */
  | { tree: 'absent' }
  /** `node_modules` is one link to a whole tree, as worktrees were cut before this: left as it is. */
  | { tree: 'shared' };

/** The part of a path under `node_modules` that names a package: `third`, or `@scope/name`. */
const packageOf = (rel: string): string => {
  const [first, second] = rel.split(path.sep);
  return first?.startsWith('@') && second ? path.join(first, second) : first ?? '';
};

/** `p` relative to `root` when it lies strictly inside it, else null. */
export const inside = (root: string, p: string): string | null => {
  const rel = path.relative(root, p);
  return rel && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel) ? rel : null;
};

/**
 * The worktree's `node_modules`, as actions, from a listing of main's.
 *
 * - **A workspace package** — an entry of main's that is a link into the main checkout itself, outside
 *   its `node_modules` (`packages/*`, `apps/*` here) — is linked to the same path in the worktree, the
 *   relative link npm writes. That is the whole point: the worktree resolves its own copy. A package the
 *   branch does not have becomes a link to nothing, which is true of the branch.
 * - **Every other package** is linked to main's entry: one inode, no install.
 * - **An `@scope` directory is the worktree's own**, holding a link per package, and so is **`.bin`**: a
 *   bin of a workspace package points through the worktree's link to its own file, every other bin at
 *   main's. Linked whole, either would let `npm install` in the worktree write main's tree.
 * - **Every other dot entry is left out** — `.package-lock.json`, `.vite-temp`, `.cache` — because it
 *   belongs to the tree it is in, and a tool writing it through a link would write main's. That is also
 *   how the runner tells a tree npm installed (it has `.package-lock.json`) from one this plan made.
 */
export function depsPlan(mainRoot: string, worktree: string, main: DepsListing): DepsAction[] {
  const mainModules = path.join(mainRoot, 'node_modules');
  const modules = path.join(worktree, 'node_modules');
  const actions: DepsAction[] = [{ kind: 'dir', path: modules }];
  const workspaces = new Set<string>();

  const place = (name: string, entry: DepEntry) => {
    const at = path.join(modules, name);
    const resolved = entry.link === undefined ? null : path.resolve(path.dirname(path.join(mainModules, name)), entry.link);
    const inRepo = resolved === null ? null : inside(mainRoot, resolved);
    if (inRepo && resolved !== mainModules && !inside(mainModules, resolved!)) {
      workspaces.add(name);
      actions.push({ kind: 'link', path: at, target: path.relative(path.dirname(at), path.join(worktree, inRepo)) });
    } else {
      actions.push({ kind: 'link', path: at, target: path.join(mainModules, name) });
    }
  };

  for (const entry of main.entries) {
    if (entry.name.startsWith('.')) continue;
    if (entry.name.startsWith('@') && entry.link === undefined) {
      actions.push({ kind: 'dir', path: path.join(modules, entry.name) });
      for (const child of main.scopes[entry.name] ?? []) place(path.join(entry.name, child.name), child);
      continue;
    }
    place(entry.name, entry);
  }

  if (main.entries.some((e) => e.name === '.bin')) {
    const bins = path.join(modules, '.bin');
    actions.push({ kind: 'dir', path: bins });
    for (const bin of main.bins) {
      const owner = bin.link === undefined ? null : inside(mainModules, path.resolve(mainModules, '.bin', bin.link));
      actions.push(owner && workspaces.has(packageOf(owner))
        ? { kind: 'link', path: path.join(bins, bin.name), target: bin.link! }
        : { kind: 'link', path: path.join(bins, bin.name), target: path.join(mainModules, '.bin', bin.name) });
    }
  }
  return actions;
}

/** A `packages` entry of a lockfile, as far as telling two trees apart needs. */
type LockEntry = { version?: string; resolved?: string; link?: boolean; optional?: boolean };

/** What the main checkout has on disk at a lockfile's package path: a link and where it leads, or a package and its version. */
export type Installed = { link: true; resolved: string } | { link: false; version?: string };

/** Whether a lockfile key names an installed package — `node_modules/a`, `node_modules/a/node_modules/b`, `apps/web/node_modules/c`. */
export const isModuleKey = (key: string): boolean => key.startsWith('node_modules/') || key.includes('/node_modules/');

/** A lockfile's `packages`, or null when it has none — which is to say, it is not a lockfile. */
export const lockfilePackages = (lock: unknown): Record<string, LockEntry> | null => {
  const packages = (lock as { packages?: unknown } | null)?.packages;
  return packages && typeof packages === 'object' ? packages as Record<string, LockEntry> : null;
};

/**
 * Where the tree a worktree's lockfile asks for parts from the tree the main checkout has installed: the
 * first package path they disagree on, or null when links to main's tree give the worktree what its
 * lockfile names.
 *
 * `installed` is what is on disk in the main checkout at each of the lockfile's package paths, read by
 * the runner — not main's `package-lock.json`, and not npm's record of the tree either. The links point at
 * what is on disk, a lockfile can be ahead of it (merged in, with no install since), and
 * `npm install --package-lock-only` rewrites `node_modules/.package-lock.json` to name packages it did
 * not install (npm 11.19, measured).
 *
 * A package parts when main does not have it, when one side is a link and the other is not, when a link
 * leads elsewhere, or when the versions differ. So does one nested in a workspace's own `node_modules`,
 * which links to main's root tree cannot give. An optional package main does not have is not a
 * difference: it is a platform build this machine did not take, as all 84 of this repository's were at
 * 2026-09-13. A package main has and the lockfile does not name is not looked for. A lockfile that did
 * not parse parts at `package-lock.json`.
 */
export function lockfileParting(wanted: unknown, installed: Readonly<Record<string, Installed | null | undefined>>): string | null {
  const want = lockfilePackages(wanted);
  if (!want) return 'package-lock.json';
  for (const [key, entry] of Object.entries(want)) {
    if (!isModuleKey(key)) continue;
    const there = installed[key];
    if (!there) {
      if (entry?.optional) continue;
      return key;
    }
    if (!key.startsWith('node_modules/')) return key;
    if (entry?.link ? !there.link || there.resolved !== entry.resolved : there.link || there.version !== entry?.version) return key;
  }
  return null;
}

/**
 * What a step is told of its `node_modules`, under `## Where to look` — only when the run did more than
 * link it: a tree of its own that `npm ci` took a minute to install, or one it could not make.
 */
export function depsLines(deps: Provisioned | undefined): string[] {
  if (deps?.tree === 'own') {
    return [
      'Its `node_modules` is its own: this branch\'s `package-lock.json` asks for packages the main checkout has not',
      'installed, so the run installed them with `npm ci` when it cut this worktree — about a minute before you',
      'started. `npm install` here changes this tree and nobody else\'s.',
    ];
  }
  if (deps?.tree === 'failed') {
    return [
      'The run could not provision this worktree\'s `node_modules`:',
      '', '```', deps.error, '```', '',
      'Run `npm ci` here before anything that needs a dependency.',
    ];
  }
  return [];
}

/** `.worktreeinclude`, read: what to copy, what is provisioned instead, and what is refused and why. */
export type WorktreeInclude = {
  copy: string[];
  /** Listed, but a `node_modules`: `provisionDeps` makes it, because copying one costs minutes per step. */
  provisioned: string[];
  refused: Array<{ line: string; why: string }>;
};

/**
 * Parse `.worktreeinclude`: one gitignored path per line, file or directory, relative to the repository
 * root. Blank lines and `#` comments are skipped. Paths, not patterns — a glob is a name nothing has.
 * A leading `/` anchors a line at the root, as it does in the gitignore syntax of Claude Code's file:
 * `/.env.local` is the repository's `.env.local`, never the machine's root.
 *
 * Refused by name: a path on a drive (`C:\`), one that climbs out of the repository, the repository
 * itself, and `.git`, which in a worktree is a file git owns. Never copied: anything that is or is
 * inside a `node_modules`. Whether git ignores a path is a fact about the checkout, not the text, so the
 * runner asks git at the cut.
 */
export function worktreeInclude(text: string): WorktreeInclude {
  const out: WorktreeInclude = { copy: [], provisioned: [], refused: [] };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const rel = path.posix.normalize(line.replaceAll('\\', '/').replace(/^\/+/, '') || '.').replace(/\/+$/, '');
    const segments = rel.split('/');
    const why =
      /^[A-Za-z]:[\\/]/.test(line) ? 'is absolute'
      : rel === '..' || rel.startsWith('../') ? 'is outside the repository'
      : rel === '.' || rel === '' ? 'is the repository itself'
      : segments[0] === '.git' ? 'is git\'s own'
      : null;
    if (why) out.refused.push({ line, why });
    else if (segments.includes('node_modules')) { if (!out.provisioned.includes(rel)) out.provisioned.push(rel); }
    else if (!out.copy.includes(rel)) out.copy.push(rel);
  }
  return out;
}

/** A refusal as a person reads it: `"../x" is outside the repository`. */
export const refusalLines = (refused: WorktreeInclude['refused']): string[] => refused.map((r) => `"${r.line}" ${r.why}`);
