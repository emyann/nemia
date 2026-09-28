/**
 * What a fresh worktree needs that git did not give it — the pure half.
 *
 * A worktree holds tracked files only. Two things fill the rest in, both decided here from names and
 * applied by `worktree.ts`, which reads the disk this file never touches:
 *
 * - **`node_modules`, per worktree.** It used to be one link to the main checkout's whole tree, and
 *   npm workspaces are links whose real path is the main checkout — so a worktree's apps imported
 *   main's packages: a branch's api change was tested against main's agent-orchestrator, and once main
 *   moved under the branch its check failed on tests it never touched. `depsPlan` gives the worktree
 *   a `node_modules` of its own: a workspace package is a link to the worktree's own copy, and every
 *   other package is main's, hardlinked file by file into a directory of the worktree's. When the
 *   branch's lockfile asks for a tree main has not installed, main's would lie, and the runner runs
 *   `npm ci` instead (`lockfileParting`).
 *
 *   Hardlinked, not linked, because a link out of the worktree is a path out of the step's working
 *   directory: Claude Code allows a read through a symlink only when the link and its target both
 *   match, so a `dontAsk` job was denied `Read`, `Grep` and `ls` under `node_modules` with no prompt
 *   (recorded on the live runs of 2026-09-23). A hardlink is no path anywhere else: every file's path is
 *   inside the worktree. It copies no data either — measured 2026-09-23 on this repository's tree (WSL2,
 *   ext4, 729 MB, 3,134 directories, 37,154 files, 46 links): 0.5 to 0.8 s and 13 MB of directories per
 *   worktree, where `npm ci` takes a minute and 729 MB.
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

/**
 * One thing to make in the worktree: a directory of its own, a link — its target written as given — or a `tree`, main's entry at `from`
 * made again at `path` with every file hardlinked and every link inside it copied as written, never followed.
 */
export type DepsAction =
  | { kind: 'dir'; path: string }
  | { kind: 'link'; path: string; target: string }
  | { kind: 'tree'; path: string; from: string };

/** What a worktree's `node_modules` turned out to be. `worktree.ts`'s `provisionDeps` returns it. */
export type Provisioned =
  /** Made from `depsPlan`, main's packages hardlinked: `made` is how many entries this call added, so 0 on a second call. */
  | { tree: 'hardlinked'; made: number }
  /**
   * Made from `depsPlan` with main's packages linked, not hardlinked — every worktree before 2026-09-23, and one whose store is where
   * a hardlink to main's files cannot be made (another filesystem): `why` is what the hardlink met. A fenced step's reads through those
   * links leave its working directory, and are denied.
   */
  | { tree: 'linked'; made: number; why?: string }
  /** A tree npm installed here, because the lockfile asks for one main has not installed. `installed`: this call ran `npm ci`. */
  | { tree: 'own'; installed: boolean }
  /** It could not be made: `npm ci` exited non-zero or timed out, or a link could not be written. */
  | { tree: 'failed'; error: string }
  /** The main checkout has no `node_modules`, and the lockfiles agree: nothing to provision. */
  | { tree: 'absent' }
  /** `node_modules` is one link to a whole tree, as worktrees were cut before this: left as it is. */
  | { tree: 'shared' };

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
 * - **Every other package** is main's, as a `tree`: a directory of the worktree's whose files are main's,
 *   hardlinked — one inode each, no install, and every path inside the worktree. A package main has as a
 *   link that leads elsewhere (`npm link`) is linked where main's leads.
 * - **An `@scope` directory is the worktree's own**, holding a package each, and so is **`.bin`**, whose
 *   links are written as npm wrote them (`../vite/bin/vite.js`), so each resolves in the worktree: a bin
 *   of a workspace package through its link to the branch's file, every other bin to the worktree's
 *   hardlinks of main's. Linked whole, either would let `npm install` in the worktree write main's tree.
 * - **Every other dot entry is left out** — `.package-lock.json`, `.vite-temp`, `.cache` — because it
 *   belongs to the tree it is in, and a tool writing it through a link would write main's. That is also
 *   how the runner tells a tree npm installed (it has `.package-lock.json`) from one this plan made.
 */
export function depsPlan(mainRoot: string, worktree: string, main: DepsListing): DepsAction[] {
  const mainModules = path.join(mainRoot, 'node_modules');
  const modules = path.join(worktree, 'node_modules');
  const actions: DepsAction[] = [{ kind: 'dir', path: modules }];

  const place = (name: string, entry: DepEntry) => {
    const at = path.join(modules, name);
    const from = path.join(mainModules, name);
    if (entry.link === undefined) {
      actions.push({ kind: 'tree', path: at, from });
      return;
    }
    const resolved = path.resolve(path.dirname(from), entry.link);
    const inRepo = inside(mainRoot, resolved);
    actions.push(
      inRepo && resolved !== mainModules && !inside(mainModules, resolved)
        ? { kind: 'link', path: at, target: path.relative(path.dirname(at), path.join(worktree, inRepo)) }
        : { kind: 'link', path: at, target: from },
    );
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
      const at = path.join(bins, bin.name);
      actions.push(
        bin.link === undefined
          ? { kind: 'tree', path: at, from: path.join(mainModules, '.bin', bin.name) }
          : { kind: 'link', path: at, target: bin.link },
      );
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
  return packages && typeof packages === 'object' ? (packages as Record<string, LockEntry>) : null;
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
 *
 * `inPlace` is for a tree read where the lockfile is — the repository's checkout, against the merge staged in it
 * (`checkoutParts`): no link is made, so a nested package parts only as a top-level one does.
 */
export function lockfileParting(
  wanted: unknown,
  installed: Readonly<Record<string, Installed | null | undefined>>,
  inPlace = false,
): string | null {
  const want = lockfilePackages(wanted);
  if (!want) return 'package-lock.json';
  for (const [key, entry] of Object.entries(want)) {
    if (!isModuleKey(key)) continue;
    const there = installed[key];
    if (!there) {
      if (entry?.optional) continue;
      return key;
    }
    if (!inPlace && !key.startsWith('node_modules/')) return key;
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
      "Its `node_modules` is its own: this branch's `package-lock.json` asks for packages the main checkout has not",
      'installed, so the run installed them with `npm ci` when it cut this worktree — about a minute before you',
      "started. `npm install` here changes this tree and nobody else's.",
    ];
  }
  if (deps?.tree === 'failed') {
    return [
      "The run could not provision this worktree's `node_modules`:",
      '',
      '```',
      deps.error,
      '```',
      '',
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
    const why = /^[A-Za-z]:[\\/]/.test(line)
      ? 'is absolute'
      : rel === '..' || rel.startsWith('../')
        ? 'is outside the repository'
        : rel === '.' || rel === ''
          ? 'is the repository itself'
          : segments[0] === '.git'
            ? "is git's own"
            : null;
    if (why) out.refused.push({ line, why });
    else if (segments.includes('node_modules')) {
      if (!out.provisioned.includes(rel)) out.provisioned.push(rel);
    } else if (!out.copy.includes(rel)) out.copy.push(rel);
  }
  return out;
}

/** A refusal as a person reads it: `"../x" is outside the repository`. */
export const refusalLines = (refused: WorktreeInclude['refused']): string[] => refused.map((r) => `"${r.line}" ${r.why}`);
