/**
 * A repository run's step workspaces: the workspace a step runs in, cut by the run's place (`make`, asked off the event loop) and read
 * back only where it was asked for, and the `node_modules` it is given (`workspace.ts` decides, this applies).
 *
 * Beneath the controllers, beside `record.store.ts`: it imports neither the engine nor a controller, and `runner.ts` re-exports what the
 * package exports of it. What reads a branch once the run has one — its standing, its diff — is `branches.store.ts`'s, and a step's
 * hand-off the place's `handoff`; `nemia rm`'s removal is `forget.verb.ts`'s.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Effect } from 'effect';
import { lastLines } from '../check/check.ts';
import {
  cutName,
  depsPlan,
  isModuleKey,
  lockfilePackages,
  lockfileParting,
  workspaceModules,
  workspacePlan,
  type DepEntry,
  type DepsListing,
  type Installed,
  type Provisioned,
} from './workspace.ts';
import { folderPlace } from '../record/places.store.ts';
import { isRepositoryRun, type Run } from '../record/record.ts';
import type { Workflow } from '../step/step.ts';
import { HOME, lstatOf, runsDir } from '../record/record.store.ts';
import { countSpawn } from '../meter/tally.store.ts';
import type { Place } from '../place/place.store.ts';
import type { PlaceRequests } from '../place/place.ts';

/**
 * The real path of a repository run's repository, its symlinks resolved; undefined for a folder run, and for a repository no longer there
 * to resolve, so a filing that reads it goes on without it rather than stopping the pass.
 */
export const realRepoOf = (run: Run): string | undefined => {
  if (!isRepositoryRun(run)) return undefined;
  try {
    return fs.realpathSync(run.repo);
  } catch {
    return undefined;
  }
};

/** How long `npm ci` may take in a worktree before the run stops waiting and tells the step. */
const NPM_CI_TIMEOUT_MS = 10 * 60_000;

const execFileAsync = promisify(execFile);

/**
 * Where the worktree's `package-lock.json` asks for a tree the main checkout does not have on disk, or
 * null when links will do: `lockfileParting`, over a look at each package path the lockfile names.
 *
 * A main checkout with no `node_modules` has no tree to part from and none to link, so its lockfile is
 * compared byte for byte instead: a different one is installed in the worktree, and the same
 * one leaves nothing to provision. A worktree without a lockfile parts only from a main checkout that
 * has one — a repository without one is not npm's, and links are all there is.
 */
export function lockfileParts(mainRoot: string, worktree: string): string | null {
  const read = (file: string): string | null => {
    try {
      return fs.readFileSync(file, 'utf8');
    } catch {
      return null;
    }
  };
  const wanted = read(path.join(worktree, 'package-lock.json'));
  const mains = read(path.join(mainRoot, 'package-lock.json'));
  if (wanted === null) return mains === null ? null : 'package-lock.json';
  if (!fs.statSync(path.join(mainRoot, 'node_modules'), { throwIfNoEntry: false })?.isDirectory()) {
    return wanted === mains ? null : 'package-lock.json';
  }

  const lock = parsedLock(wanted);
  return lockfileParting(lock, installedAt(mainRoot, lock));
}

/**
 * Where the `package-lock.json` in a repository's checkout — during an ending, the merge staged there — asks for a package its own
 * `node_modules` does not have on disk: the first package path they disagree on, or null. `lockfileParting`, so a package nested in a
 * workspace's `node_modules` is compared as it is installed.
 *
 * Null for a checkout with no lockfile, and for one with no `node_modules`: nobody installed a tree there to bring up to date.
 */
export function checkoutParts(repo: string): string | null {
  if (!fs.statSync(path.join(repo, 'node_modules'), { throwIfNoEntry: false })?.isDirectory()) return null;
  let text: string;
  try {
    text = fs.readFileSync(path.join(repo, 'package-lock.json'), 'utf8');
  } catch {
    return null;
  }
  const lock = parsedLock(text);
  return lockfileParting(lock, installedAt(repo, lock));
}

/** A lockfile's text, parsed; null where it does not parse, which `lockfileParting` reads as parting at `package-lock.json`. */
function parsedLock(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * What `root` has on disk at each package path a lockfile names: a link and where it leads from `root`, a package and its version (none
 * for a package without a manifest that reads), or null.
 */
function installedAt(root: string, lock: unknown): Record<string, Installed | null> {
  const installed: Record<string, Installed | null> = {};
  for (const key of Object.keys(lockfilePackages(lock) ?? {}).filter(isModuleKey)) {
    const at = path.join(root, key);
    const st = lstatOf(at);
    if (!st) installed[key] = null;
    else if (st.isSymbolicLink()) {
      installed[key] = {
        link: true,
        resolved: path
          .relative(root, path.resolve(path.dirname(at), fs.readlinkSync(at)))
          .split(path.sep)
          .join('/'),
      };
    } else {
      let version: string | undefined;
      try {
        version = JSON.parse(fs.readFileSync(path.join(at, 'package.json'), 'utf8')).version;
      } catch {}
      installed[key] = { link: false, version };
    }
  }
  return installed;
}

/** Main's `node_modules`, listed for `depsPlan`: names and link targets, nothing below a package. */
function listDeps(modules: string): DepsListing | null {
  if (!fs.statSync(modules, { throwIfNoEntry: false })?.isDirectory()) return null;
  const entriesOf = (dir: string): DepEntry[] => {
    try {
      return fs
        .readdirSync(dir, { withFileTypes: true })
        .map((d) => (d.isSymbolicLink() ? { name: d.name, link: fs.readlinkSync(path.join(dir, d.name)) } : { name: d.name }));
    } catch {
      return [];
    }
  };
  const entries = entriesOf(modules);
  const scopes = Object.fromEntries(
    entries.filter((e) => e.name.startsWith('@') && e.link === undefined).map((e) => [e.name, entriesOf(path.join(modules, e.name))]),
  );
  return { entries, scopes, bins: entriesOf(path.join(modules, '.bin')) };
}

/**
 * Main's own `node_modules` of each workspace folder the worktree's lockfile installs into (`workspaceModules`), listed for `depsPlan`
 * and keyed by the folder. A folder is left out where the worktree's is not a directory of its own — absent, or reached through a link,
 * which would have the plan write where it leads — where the worktree's `node_modules` there is a link, and where main has none.
 */
function nestedListings(mainRoot: string, worktree: string): Record<string, DepsListing> {
  let text: string;
  try {
    text = fs.readFileSync(path.join(worktree, 'package-lock.json'), 'utf8');
  } catch {
    return {};
  }
  const root = fs.realpathSync(worktree);
  const listings: Record<string, DepsListing> = {};
  for (const folder of workspaceModules(parsedLock(text))) {
    const here = path.join(worktree, folder);
    if (!isOwnDirectory(here, path.join(root, folder)) || lstatOf(path.join(here, 'node_modules'))?.isSymbolicLink()) continue;
    const listing = listDeps(path.join(mainRoot, folder, 'node_modules'));
    if (listing) listings[folder] = listing;
  }
  return listings;
}

/** Whether `p` is a directory whose real path is `real`: there, and reached through no link. */
function isOwnDirectory(p: string, real: string): boolean {
  try {
    return fs.realpathSync(p) === real && fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * What a hardlink to main's files meets where it cannot be made: another filesystem (`EXDEV`), or one that refuses them. On any of these,
 * provisioning links main's packages instead; any other failure is a failure.
 */
const HARDLINK_REFUSED = new Set(['EXDEV', 'EPERM', 'ENOTSUP']);

/**
 * Main's entry at `from`, made again at `to`: each directory made, each file hardlinked, each link copied as written and never followed —
 * so no loop, and nothing outside `from` is read. What it made, counted; a socket or a pipe is nobody's dependency, and left out.
 */
function hardlinkTree(from: string, to: string): number {
  const st = fs.lstatSync(from);
  if (st.isSymbolicLink()) {
    fs.symlinkSync(fs.readlinkSync(from), to);
    return 1;
  }
  if (st.isDirectory()) {
    fs.mkdirSync(to);
    let made = 1;
    for (const name of fs.readdirSync(from)) made += hardlinkTree(path.join(from, name), path.join(to, name));
    return made;
  }
  if (st.isFile()) {
    fs.linkSync(from, to);
    return 1;
  }
  return 0;
}

/**
 * Give a worktree a `node_modules` of its own: `depsPlan`'s links and hardlinked packages, or `npm ci` when its lockfile differs.
 *
 * A worktree holds tracked files only, so without this a step that runs the tests fails on its first
 * command through no fault of its own. It is never one link to the main checkout's whole tree, which would
 * test a branch against main's workspace packages and hide a dependency the branch added. Hardlinks cost
 * no install, and keep every path inside the worktree, where a fenced step may read it; when the worktree's
 * `package-lock.json` asks for packages main has not installed they would be the wrong tree, so `npm ci`
 * installs one here, which the step is told (`depsLines`). Where a hardlink cannot be made — the store on
 * another filesystem — main's packages are linked, and the answer is `linked` with why: met by this call,
 * or read off a link an earlier pass left, after which every package left to make is linked too.
 *
 * Idempotent, so a pass that died halfway can run it again and a second call changes nothing: a tree npm
 * installed (it has `.package-lock.json`, which the plan never makes) is left alone, and so is a
 * `node_modules` that is one link; a tree the plan made gains only what it lacks, and
 * nothing already there is replaced or added to. A package is made under a dot name beside its place and
 * renamed into it whole, so one a pass died making is never taken for a package, and is made again. It
 * writes nothing under the main checkout. It does not throw: a tick that threw here would throw on every
 * pass after, and a step can run `npm ci` itself.
 */
export async function provisionDeps(mainRoot: string, worktree: string): Promise<Provisioned> {
  const modules = path.join(worktree, 'node_modules');
  if (lstatOf(modules)?.isSymbolicLink()) return { tree: 'shared' };
  if (lstatOf(path.join(modules, '.package-lock.json'))) return { tree: 'own', installed: false };

  if (lockfileParts(mainRoot, worktree)) {
    try {
      countSpawn();
      await execFileAsync('npm', ['ci', '--no-audit', '--no-fund'], {
        cwd: worktree,
        timeout: NPM_CI_TIMEOUT_MS,
        maxBuffer: 64 * 1024 * 1024,
      });
      return { tree: 'own', installed: true };
    } catch (err) {
      const { stderr, message } = err as { stderr?: string; message?: string };
      return { tree: 'failed', error: lastLines(stderr?.trim() ? stderr : (message ?? String(err)), 10) };
    }
  }

  const listing = listDeps(path.join(mainRoot, 'node_modules'));
  if (!listing) return { tree: 'absent' };
  let made = 0;
  let why: string | undefined;
  try {
    for (const action of depsPlan(mainRoot, worktree, listing, nestedListings(mainRoot, worktree))) {
      const there = lstatOf(action.path);
      if (there) {
        if (action.kind === 'tree' && there.isSymbolicLink() && fs.readlinkSync(action.path) === action.from)
          why ??= 'an earlier pass linked them';
        continue;
      }
      if (action.kind === 'dir') fs.mkdirSync(action.path);
      else if (action.kind === 'link') fs.symlinkSync(action.target, action.path);
      else if (why) fs.symlinkSync(action.from, action.path);
      else {
        const making = path.join(path.dirname(action.path), `.wf-making-${path.basename(action.path)}`);
        fs.rmSync(making, { recursive: true, force: true });
        try {
          hardlinkTree(action.from, making);
          fs.renameSync(making, action.path);
        } catch (err) {
          fs.rmSync(making, { recursive: true, force: true });
          const { code, syscall } = err as NodeJS.ErrnoException;
          if (syscall !== 'link' || !code || !HARDLINK_REFUSED.has(code)) throw err;
          why = (err as Error).message;
          fs.symlinkSync(action.from, action.path);
        }
      }
      made++;
    }
  } catch (err) {
    return { tree: 'failed', error: (err as Error).message };
  }
  return why ? { tree: 'linked', made, why } : { tree: 'hardlinked', made };
}

/** The notes a step's `node_modules` gives the run's log: installed with `npm ci`, not provisioned, or linked, not hardlinked. */
function depsNotes(deps: Provisioned): string[] {
  if (deps.tree === 'own' && deps.installed)
    return ['node_modules: installed with npm ci — package-lock.json asks for packages the main checkout has not installed'];
  if (deps.tree === 'failed') return [`node_modules: not provisioned — ${deps.error.split('\n').at(-1)}`];
  if (deps.tree === 'linked')
    return [
      `node_modules: main's packages linked, not hardlinked — ${deps.why ?? 'unknown'}; a fenced step's reads under it leave its worktree and are denied`,
    ];
  return [];
}

/**
 * A step's workspace as it was made: where, on what line of work, the paths its merge left conflicted with the place's words for seeing
 * them (`say.conflicts`), only where there are some, its dependencies, and notes.
 */
export type Cut = {
  readonly workspace: string;
  readonly branch?: string;
  readonly merge?: { readonly conflicts: readonly string[]; readonly say: string };
  readonly deps?: Provisioned;
  readonly notes: readonly string[];
};

/** A step's workspace made, or why it was not, in words for the run's log. */
export type CutOutcome = { readonly cut: Cut } | { readonly uncut: string };

/** What the run's log says of step `name`'s workspace: the notes of its cut, or why it was not cut. */
export const cutNotes = (name: string, made: CutOutcome): string[] =>
  ('cut' in made ? made.cut.notes : [made.uncut]).map((note) => `${name}: ${note}`);

/** Why a step's workspace was not made. */
const uncut = (words: string): CutOutcome => ({ uncut: `not cut — ${words}` });

/** Whether `made` is `at` itself, by real path; false where either is not there to resolve. */
function madeAt(made: string, at: string): boolean {
  try {
    return fs.realpathSync(made) === fs.realpathSync(at);
  } catch {
    return false;
  }
}

/**
 * What `place` answers when asked to cut `request` (`make`, off the event loop): the workspace it made, or why there is none, in words
 * for the run's log — its refusal, why it was not heard, or an answer that names a workspace other than `at`, which is read as unread: a
 * step is never filed where nobody cut it.
 */
const madeBy = Effect.fn('madeBy')(function* (place: Place, request: PlaceRequests['make']) {
  const outcome = yield* place.ask('make', request);
  if ('refused' in outcome) return uncut(`the place refused: ${outcome.refused}`);
  if ('unread' in outcome) return uncut(`the place's make was not heard: ${outcome.unread.said}; asked again on the next pass`);
  if (!madeAt(outcome.answer.workspace, request.at))
    return uncut(
      `the place's make answered ${outcome.answer.workspace}, where it was asked for ${request.at}: read as not heard, and asked again on the next pass`,
    );
  return { made: outcome.answer } as const;
});

/**
 * The workspace a step runs in, made real: `{ cut }`, or `{ uncut }` with why, for the run's log, when the place made none.
 *
 * A folder run's steps work in folders the run makes, and nothing here is git's (`places.store.ts`). Without
 * isolation every step works in the repository itself, which is safe only as `validate` refuses a
 * workflow that could run two steps at once in that mode. `workspace: main` is the repository's own
 * checkout, as a person left it, for a workflow's last step: it merges onto the base branch, which is
 * checked out there and so in no worktree. Nothing is cut, merged or provisioned, and `validate` keeps
 * any other step from running beside it.
 *
 * `inherit` costs nothing — the step continues where the last one left off. `fork` and `merge` are cut by the run's place, its `make` asked
 * off the event loop of `place`, for a workspace of their own at
 * `<HOME>/worktrees/<run>/<leaf>` on `wf/<run>/<leaf>`, the leaf `cutName` gives it — `run` for the run's own line of work, one workspace
 * and one branch per card, and the step's own name for a fork beside it or a fan-in's merge — merged with the line of work of each other
 * step a merge waits on: what stops two
 * concurrent steps from editing the same directory. A workspace already cut is taken up where it stands, by the place. A merge that
 * conflicts is left conflicted, its paths answered (`conflicts`) for the step's brief: resolving it is the job. The dependencies are
 * provisioned after, in the workspace the place made, on the merged tree and its lockfile.
 */
export const workspaceFor = Effect.fn('workspaceFor')(function* (run: Run, steps: readonly Workflow[], step: Workflow, place: Place) {
  const plan = workspacePlan(steps, step);
  const cut = (made: Cut): CutOutcome => ({ cut: made });
  if (!isRepositoryRun(run)) return cut(folderPlace(runsDir()).make(run, plan, step.name));
  const of = (name: string) => {
    const s = run.steps[name];
    if (!s?.workspace || !s.branch) throw new Error(`${step.name}: ${name} has no workspace yet`);
    return s as { workspace: string; branch: string };
  };
  if (!run.isolate || plan.kind === 'base') return cut({ workspace: run.repo, branch: run.branch, notes: [] });
  if (plan.kind === 'inherit') {
    const parent = of(plan.from);
    return cut({ workspace: parent.workspace, branch: parent.branch, notes: [] });
  }
  const asked = yield* madeBy(place, {
    repo: run.repo,
    at: path.join(HOME, 'worktrees', run.id, cutName(steps, step)),
    name: `wf/${run.id}/${cutName(steps, step)}`,
    from: plan.kind === 'merge' ? of(plan.from).branch : plan.from ? of(plan.from).branch : run.baseRef,
    also: plan.kind === 'merge' ? plan.also.map((other) => of(other).branch) : [],
  });
  if (!('made' in asked)) return asked;
  const { made } = asked;
  const deps = yield* Effect.promise(() => provisionDeps(run.repo, made.workspace));
  return cut({
    workspace: made.workspace,
    branch: made.branch,
    ...(made.conflicts.length ? { merge: { conflicts: made.conflicts, say: place.declared.say.conflicts } } : {}),
    deps,
    notes: [...made.notes, ...depsNotes(deps)],
  });
});
