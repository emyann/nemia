/**
 * What a fresh worktree needs that git did not give it — the pure half.
 *
 * A worktree holds tracked files only. Two things fill the rest in: what `.worktreeinclude` lists, which the run's place copies when it
 * cuts the worktree (`make`), and its `node_modules`, decided here from names and applied by `worktree.store.ts`, which reads the disk
 * this file never touches:
 *
 * - **`node_modules`, per worktree.** npm workspaces are links whose real path is the main checkout, so
 *   one link to main's whole tree would have a worktree's apps import main's packages, and a branch's
 *   change be tested against main's. `depsPlan` gives the worktree a `node_modules` of its own: a
 *   workspace package is a link to the worktree's own copy, and every other package is main's,
 *   hardlinked file by file into a directory of the worktree's — and so is each workspace's own
 *   `node_modules`, where npm nests a package one workspace needs a copy of (`workspaceModules`). When
 *   the branch's lockfile asks for a tree main has not installed, main's would lie, and the runner runs
 *   `npm ci` instead (`lockfileParting`).
 *
 *   Hardlinked, not linked, because a link out of the worktree is a path out of the step's working
 *   directory: Claude Code allows a read through a symlink only when the link and its target both
 *   match, so a `dontAsk` job is denied `Read`, `Grep` and `ls` under a linked `node_modules` with no
 *   prompt. A hardlink is no path anywhere else: every file's path is inside the worktree, and no data
 *   is copied.
 *
 * The same file says where a step works (`workspacePlan`, `givenPlan`), what the cut it works in is called (`cutName`, `LINE_NAME`) and
 * which finished steps hand their work off on a pass (`handOffDue`).
 */
import path from 'node:path';
import { endsOnBase, type Workflow } from '../step/step.ts';
import { placeOf, type Run, type TaskPhase } from '../record/record.ts';

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

/**
 * What a worktree's `node_modules` turned out to be. `worktree.store.ts`'s `provisionDeps` returns it.
 *
 * - `hardlinked`: made from `depsPlan`, main's packages hardlinked; `made` is how many entries this call added, so 0 on a second call.
 * - `linked`: made from `depsPlan` with main's packages linked, not hardlinked, where a hardlink to main's files cannot be made (another
 *   filesystem); `why` is what the hardlink met. A fenced step's reads through those links leave its working directory, and are denied.
 * - `own`: a tree npm installed here, because the lockfile asks for one main has not installed; `installed`: this call ran `npm ci`.
 * - `failed`: it could not be made: `npm ci` exited non-zero or timed out, or a link could not be written.
 * - `absent`: the main checkout has no `node_modules`, and the lockfiles agree: nothing to provision.
 * - `shared`: `node_modules` is one link to a whole tree: left as it is.
 */
export type Provisioned =
  | { tree: 'hardlinked'; made: number }
  | { tree: 'linked'; made: number; why?: string }
  | { tree: 'own'; installed: boolean }
  | { tree: 'failed'; error: string }
  | { tree: 'absent' }
  | { tree: 'shared' };

/** `p` relative to `root` when it lies strictly inside it, else null. */
export const inside = (root: string, p: string): string | null => {
  const rel = path.relative(root, p);
  return rel && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel) ? rel : null;
};

/**
 * The worktree's `node_modules`, as actions, from a listing of main's — and of each workspace's own, `nested`, keyed by the workspace's
 * folder (`workspaceModules`), planned after the root's under the same rules at `<worktree>/<folder>/node_modules`.
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
export function depsPlan(
  mainRoot: string,
  worktree: string,
  main: DepsListing,
  nested: Readonly<Record<string, DepsListing>> = {},
): DepsAction[] {
  return [
    ...modulesPlan(mainRoot, worktree, '', main),
    ...Object.keys(nested)
      .sort()
      .flatMap((folder) => {
        const listing = nested[folder];
        return listing ? modulesPlan(mainRoot, worktree, folder, listing) : [];
      }),
  ];
}

/** One `node_modules` of `depsPlan`'s, the one in `folder` (`''` for the root's), from main's listing of it. */
function modulesPlan(mainRoot: string, worktree: string, folder: string, main: DepsListing): DepsAction[] {
  const rootModules = path.join(mainRoot, 'node_modules');
  const mainModules = path.join(mainRoot, folder, 'node_modules');
  const modules = path.join(worktree, folder, 'node_modules');
  const actions: DepsAction[] = [{ kind: 'dir', path: modules }];
  const inModules = (p: string) => [rootModules, mainModules].some((m) => p === m || inside(m, p));

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
      inRepo && !inModules(resolved)
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

/**
 * The folder whose `node_modules` a lockfile's package path installs into: `''` for the root's, a workspace's folder (`apps/web` of
 * `apps/web/node_modules/a`), or null for a folder the plan never makes — absolute, climbing out with `..`, or inside a `node_modules`.
 */
const moduleFolder = (key: string): string | null => {
  if (key.startsWith('node_modules/')) return '';
  const folder = key.slice(0, key.indexOf('/node_modules/'));
  return folder.split('/').every((s) => s && s !== '.' && s !== '..' && s !== 'node_modules') ? folder : null;
};

/** The workspace folders whose own `node_modules` a lockfile installs into, sorted: `['apps/web']`. None for what is not a lockfile. */
export function workspaceModules(lock: unknown): string[] {
  const folders = Object.keys(lockfilePackages(lock) ?? {})
    .filter(isModuleKey)
    .map(moduleFolder)
    .filter((folder): folder is string => !!folder);
  return [...new Set(folders)].sort();
}

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
 * not install.
 *
 * A package parts when main does not have it, when one side is a link and the other is not, when a link
 * leads elsewhere, or when the versions differ, whether it is at the root or nested in a workspace's own
 * `node_modules`, which `depsPlan` gives the worktree as it gives the root's. So does one in a folder the plan never makes
 * (`workspaceModules`): outside the repository, though main has it. An optional package main does not have is not a
 * difference: it is a platform build this machine did not take. A package main has and the lockfile does not name is not looked for. A
 * lockfile that did not parse parts at `package-lock.json`.
 */
export function lockfileParting(wanted: unknown, installed: Readonly<Record<string, Installed | null | undefined>>): string | null {
  const want = lockfilePackages(wanted);
  if (!want) return 'package-lock.json';
  for (const [key, entry] of Object.entries(want)) {
    if (!isModuleKey(key)) continue;
    if (moduleFolder(key) === null) return key;
    const there = installed[key];
    if (!there) {
      if (entry?.optional) continue;
      return key;
    }
    if (entry?.link ? !there.link || there.resolved !== entry.resolved : there.link || there.version !== entry?.version) return key;
  }
  return null;
}

/**
 * What a step is told of its `node_modules`, under `## Where to look` — only when the run did more than
 * link it: a tree of its own that `npm ci` installed, or one it could not make.
 */
export function depsLines(deps: Provisioned | undefined): string[] {
  if (deps?.tree === 'own') {
    return [
      "Its `node_modules` is its own: this branch's `package-lock.json` asks for packages the main checkout has not",
      'installed, so the run installed them with `npm ci` when it cut this worktree, before you started. `npm install`',
      "here changes this tree and nobody else's.",
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

/**
 * The steps whose leftovers the run commits on this pass. Pure.
 *
 * Every FINISHED step — succeeded, failed or stopped. A failed step still blocks what follows; handing
 * it off keeps its work on its branch, where `nemia decide` can show it, instead of only in a worktree
 * that gets removed (engine open issue 2).
 *
 * And only until its check is filed. The check judges the tree the step handed on; whatever the suite
 * leaves behind — coverage, a cache, a temp file — is the suite's, and committing it on a later pass
 * would put it on the branch under the step's name.
 *
 * Nor once a step that waits on it has been filed in the same workspace — a follower that inherits it,
 * or every later step of a `--no-worktree` run. The directory is that step's now: its work in progress,
 * and later its own check's litter, are in it. Handing the step off before its follower is filed is
 * enough, and `advance` does that in the same pass that files the follower.
 *
 * Never a step that works in the repository's own checkout (`workspace: base`): what lies in a person's
 * checkout is not the run's to commit under a step's name, and such a step commits its own work there.
 * And once for each try (`handedOff`): what is in the workspace after the hand-off is a person's, or
 * the next step's, and not this step's to sign.
 */
export function handOffDue(steps: readonly Workflow[], run: Run, phaseOf: (taskId: string) => TaskPhase): string[] {
  const finished = ['succeeded', 'failed', 'stopped'];
  return Object.entries(run.steps)
    .filter(([name]) => !endsOnBase(steps.find((s) => s.name === name) ?? {}))
    .filter(
      ([name, s]) =>
        s.taskId &&
        s.workspace &&
        !s.check &&
        s.handedOff !== s.taskId &&
        finished.includes(phaseOf(s.taskId)) &&
        ![...downstreamOf(steps, name)].some((later) => run.steps[later]?.taskId && run.steps[later]?.workspace === s.workspace),
    )
    .map(([name]) => name);
}

/** Every step that waits on `name`, directly or through another. */
function downstreamOf(steps: readonly Workflow[], name: string): Set<string> {
  const found = new Set<string>();
  const queue = [name];
  for (let current = queue.pop(); current !== undefined; current = queue.pop()) {
    for (const s of steps) {
      if (s.after.includes(current) && !found.has(s.name)) {
        found.add(s.name);
        queue.push(s.name);
      }
    }
  }
  return found;
}

/**
 * Which workspace a step needs. Pure — it reads the shape of the workflow, nothing else.
 *
 * The rule is git's, not ours:
 *
 *   - **inherit** — a step that is the only thing following its only predecessor is the same line
 *     of work continuing. Same directory, same branch, no git operation. This is the sequential
 *     case, and it is why `resume:` still makes sense: the author comes back to their own desk.
 *   - **fork** — a step that runs beside a sibling gets its own worktree, branched from wherever
 *     it starts. Two agents editing one directory at once is the arrangement we are avoiding, and
 *     for an agent a worktree costs nothing, so there is no reason to share one.
 *   - **merge** — a step that waits on SEVERAL steps is a fan-in, so it gets a worktree with all
 *     of their work combined. `after: a, b` means "wait for both" and "give me both". Nobody has
 *     to learn a new key for the thing they already asked for.
 *   - **main** — the one a step says rather than the shape: `workspace: base`, the repository's own
 *     checkout, for the last step of a workflow, which acts on the base branch. No worktree is cut,
 *     nothing is merged into it, and the run commits nothing there: what a person's checkout holds is
 *     theirs, and the step commits its own work as they would.
 *
 * Conflicts are not an error here. A merge that conflicts leaves the markers in place and the
 * step is told about it, because resolving them is exactly the work a fan-in step exists to do.
 */
export type WorkspacePlan =
  | { kind: 'inherit'; from: string }
  | { kind: 'fork'; from: string | null }
  | { kind: 'merge'; from: string; also: string[] }
  | { kind: 'base' };

/** The directory inside a folder step's own folder that holds what the run copied in for it: `given/inputs`, `given/from/<step>`. */
export const GIVEN = 'given';

/**
 * One thing the run copied into a folder step's folder: the step whose folder it was, where it now sits (from the folder), and where it
 * came from.
 */
export type GivenFrom = { step: string; dir: string; source: string };

/** What a folder step is given: the run's inputs, and a copy of each folder it waits on. Both by their path from the step's own folder. */
export type Given = { inputs: string | null; from: readonly GivenFrom[] };

/**
 * What the run copies into a folder step's folder as it makes it, and the names its brief calls those copies by — one function, read by
 * both, so the brief never names a path the fence denies.
 *
 * A folder team's steps run as jobs, which ask nobody in any mode: a call outside the step's own directory is denied
 * with no prompt, the session reads the refusal and carries on, and nothing says so to anyone. So the run's `inputs/`, and the folders of
 * the steps this one waits on but did not continue, are copied in: a read inside the session's own directory needs no permission of any
 * harness. `artifactsContract`'s folder branch goes the same way round.
 *
 * Keyed on the workspace plan, so what is copied is what the step DECLARED it waits on — a fork's parent, a fan-in's parents — and never
 * `composeBrief`'s "every step filed so far" fallback, which no `make` copies. Every folder of a folder run holds the run's inputs, so a
 * step that continues another's folder (`inherit`) is given nothing more: it is standing in the folder that was given it, and an
 * `inherit` chain ends at a step that made one. Pure.
 */
export function givenPlan(run: Pick<Run, 'place' | 'inputs' | 'steps'>, plan: WorkspacePlan): Given {
  if (placeOf(run) !== 'folder' || plan.kind === 'base') return { inputs: null, from: [] };
  const inputs = run.inputs?.length ? `${GIVEN}/inputs` : null;
  if (plan.kind === 'inherit') return { inputs, from: [] };
  const parents = plan.kind === 'merge' ? [plan.from, ...plan.also] : plan.from ? [plan.from] : [];
  return {
    inputs,
    from: parents.flatMap((name) => {
      const source = run.steps[name]?.workspace;
      return source ? [{ step: name, dir: `${GIVEN}/from/${name}`, source }] : [];
    }),
  };
}

/**
 * Which workspace a step needs (`WorkspacePlan`). Pure. `main` is said by the step (`workspace: base`), never read off the shape; a fan-in
 * merges onto the first of its parents by name.
 */
export function workspacePlan(steps: readonly Workflow[], step: Workflow): WorkspacePlan {
  if (endsOnBase(step)) return { kind: 'base' };
  const [first, ...also] = [...step.after].sort();
  if (first === undefined) return { kind: 'fork', from: null };
  if (also.length) return { kind: 'merge', from: first, also };

  const parent = first;
  const siblings = steps.filter((s) => s.after.includes(parent));
  return siblings.length === 1 ? { kind: 'inherit', from: parent } : { kind: 'fork', from: parent };
}

/** The leaf a run's own line of work is cut under: `worktrees/<run>/run`, on the branch its place names for that leaf. */
export const LINE_NAME = 'run';

/**
 * What a cut of `step` is called — the leaf under `worktrees/<run>/`, which the core names; the branch is the place's to name, handed the
 * run and the leaf (`make`), as the git place's `runBranch` does. Pure, a function of the frozen step set alone, so a pass that died
 * halfway and a restart name the same cut the same way.
 *
 * A run's line of work is one workspace and one branch per card, named for the run and not for whichever step happened to cut it:
 * `LINE_NAME`. The line is the first step in the workflow's order that forks off the run's base ref (`{ kind: 'fork', from: null }`), and
 * every step that inherits from it stands in the same cut. So a person in the store, and a reader of a pull request, see the leaf `run`:
 * the card, and no step.
 *
 * Every other cut keeps its step's name — a fork with a parent, a fan-in merge, and a second root of a run that starts wide — because
 * those are lines of work beside the run's own, and each needs a worktree and a branch of its own.
 */
export function cutName(steps: readonly Workflow[], step: Workflow): string {
  const line = steps.find((s) => {
    const plan = workspacePlan(steps, s);
    return plan.kind === 'fork' && plan.from === null;
  });
  return line && line.name === step.name ? LINE_NAME : step.name;
}
