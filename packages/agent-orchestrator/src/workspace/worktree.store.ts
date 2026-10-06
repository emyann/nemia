/**
 * Git and a git run's worktrees: the `git` helpers, the starting workspace, a step's worktree cut and merged, what `.worktreeinclude`
 * copies into it and the `node_modules` it is given (`workspace.ts` decides, this applies), and the hand-off commit of what a step left
 * uncommitted.
 *
 * Beneath the controllers, beside `record.store.ts`: it imports neither the engine nor a controller, and `runner.ts` re-exports what the
 * package exports of it. What reads a branch once the run has one — its standing, its diff — is `branches.store.ts`'s, and a step's
 * artifacts `artifacts.store.ts`'s, both through the `git` helpers here, so this file imports `record.store.ts` alone of those beside it;
 * `nemia rm`'s removal is `forget.verb.ts`'s.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lastLines } from '../check/check.ts';
import {
  depsPlan,
  inside,
  isModuleKey,
  lockfilePackages,
  lockfileParting,
  refusalLines,
  workspaceModules,
  worktreeInclude,
  type DepEntry,
  type DepsListing,
  type Installed,
  type Provisioned,
  type WorktreeInclude,
} from './workspace.ts';
import { folderPlace } from '../record/places.store.ts';
import { isGitRun, type Run } from '../record/record.ts';
import { workspacePlan } from './workspace.ts';
import type { Workflow } from '../step/step.ts';
import { HOME, lstatOf, runsDir } from '../record/record.store.ts';
import { countSpawn, execCounted } from '../meter/tally.store.ts';

/**
 * The real path of a git run's repository, its symlinks resolved; undefined for a folder run, and for a repository no longer there to
 * resolve, so a filing that reads it goes on without it rather than stopping the pass.
 */
export const realRepoOf = (run: Run): string | undefined => {
  if (!isGitRun(run)) return undefined;
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

/** Whether git ignores a path in a checkout. `git check-ignore` says no for a tracked path, and for one git has not been told to ignore. */
function ignored(repo: string, rel: string): boolean {
  try {
    execCounted('git', ['check-ignore', '-q', '--', rel], { cwd: repo, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
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

/** `.worktreeinclude` at the root of the main checkout, parsed — or null, when the repository has none. */
export function readInclude(repo: string): WorktreeInclude | null {
  const file = path.join(repo, '.worktreeinclude');
  return fs.existsSync(file) ? worktreeInclude(fs.readFileSync(file, 'utf8')) : null;
}

/**
 * Copy what `.worktreeinclude` lists from the main checkout into a worktree the run just cut — the
 * gitignored files a repository says a worktree needs, as Claude Code's `--worktree` does. Never
 * `node_modules`: `provisionDeps` makes that, and a copy would cost minutes per step.
 *
 * Read from the main checkout, never from the worktree a step can edit. Only a path git ignores there is
 * copied, as Claude Code's file copies only ignored files: anything else lands in the worktree as an
 * untracked file, and the hand-off's `git add -A` commits it onto the run's branch — a token in a notes
 * file included. Nothing already in the worktree is overwritten, so a second pass copies nothing. What a
 * person should hear comes back as lines for the run's log, never as an error: a path the main checkout
 * does not have is skipped, and one that leads outside the repository — as written, or through a link —
 * or that git does not ignore is refused.
 */
function includeFiles(repo: string, worktree: string): string[] {
  const include = readInclude(repo);
  if (!include) return [];
  const notes = refusalLines(include.refused).map((line) => `.worktreeinclude: refused ${line}`);
  const root = fs.realpathSync(repo);
  const absent: string[] = [];
  for (const rel of include.copy) {
    const from = path.join(repo, rel);
    let real: string;
    try {
      real = fs.realpathSync(from);
    } catch {
      absent.push(rel);
      continue;
    }
    if (!inside(root, real)) {
      notes.push(`.worktreeinclude: refused "${rel}" leads outside the repository`);
      continue;
    }
    if (!ignored(repo, rel)) {
      notes.push(`.worktreeinclude: refused "${rel}" is not gitignored — the hand-off would commit it`);
      continue;
    }
    const to = path.join(worktree, rel);
    try {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.cpSync(from, to, { recursive: true, force: false, errorOnExist: false, verbatimSymlinks: true });
    } catch (err) {
      notes.push(`.worktreeinclude: could not copy ${rel} — ${(err as Error).message}`);
    }
  }
  if (absent.length) notes.unshift(`.worktreeinclude: skipped ${absent.join(', ')} — not in the main checkout`);
  return notes;
}

/**
 * A git command in `repo`, its stdout trimmed — or it throws, and git's words are on the error: its message carries the command and the
 * stderr git wrote, which is what a failure is said in (`failedWords`, `startQueued`).
 *
 * `stdio` is given so that stderr is read and no more. Handed none, `execFileSync` captures git's stderr *and* writes it to this process's
 * own, and every failed call a pass repeats would print git's `fatal:` on the daemon's terminal.
 */
export const git = (repo: string, ...args: string[]) =>
  execCounted('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/**
 * The workspace a step runs in, made real.
 *
 * A folder run's steps work in folders the run makes, and nothing here is git's (`places.store.ts`). Without
 * isolation every step works in the repository itself, which is safe only as `validate` refuses a
 * workflow that could run two steps at once in that mode. `workspace: main` is the repository's own
 * checkout, as a person left it, for a workflow's last step: it merges onto the base branch, which is
 * checked out there and so in no worktree. Nothing is cut, merged or provisioned, and `validate` keeps
 * any other step from running beside it.
 *
 * `inherit` costs nothing — the step continues where the last one left off. `fork` and `merge`
 * cut a worktree of their own, which is what stops two concurrent steps from editing the same directory.
 * A worktree already on disk is taken up where it stands, as a pass may have cut it and died before
 * filing the step, and `worktree add -b` would refuse its branch on every pass after. A merge that
 * conflicts is left conflicted, markers and all: the step waiting on several others is told in its brief,
 * and resolving it is the job. Failing here instead would throw away work that a person would simply
 * sort out. What `.worktreeinclude` lists and the dependencies are provisioned after the merges, on the
 * merged tree and its lockfile.
 */
export async function workspaceFor(
  run: Run,
  steps: readonly Workflow[],
  step: Workflow,
): Promise<{ workspace: string; branch?: string; conflicted: boolean; deps?: Provisioned; notes: string[] }> {
  const plan = workspacePlan(steps, step);
  if (!isGitRun(run)) return { ...folderPlace(runsDir()).make(run, plan, step.name), conflicted: false };
  const of = (name: string) => {
    const s = run.steps[name];
    if (!s?.workspace || !s.branch) throw new Error(`${step.name}: ${name} has no workspace yet`);
    return s as { workspace: string; branch: string };
  };

  if (!run.isolate) return { workspace: run.repo, branch: run.branch, conflicted: false, notes: [] };

  if (plan.kind === 'main') return { workspace: run.repo, branch: run.branch, conflicted: false, notes: [] };

  if (plan.kind === 'inherit') {
    const parent = of(plan.from);
    return { workspace: parent.workspace, branch: parent.branch, conflicted: false, notes: [] };
  }

  const branch = `wf/${run.id}/${step.name}`;
  const workspace = path.join(HOME, 'worktrees', run.id, step.name);
  const from = plan.kind === 'merge' ? of(plan.from).branch : plan.from ? of(plan.from).branch : run.baseRef;
  fs.mkdirSync(path.dirname(workspace), { recursive: true });
  if (!fs.existsSync(path.join(workspace, '.git'))) git(run.repo, 'worktree', 'add', '-b', branch, workspace, from);

  let conflicted = false;
  if (plan.kind === 'merge') {
    for (const other of plan.also) {
      try {
        git(workspace, '-c', 'user.email=wf@local', '-c', 'user.name=wf', 'merge', '--no-edit', of(other).branch);
      } catch {
        conflicted = true;
      }
    }
  }

  const notes = includeFiles(run.repo, workspace);
  const deps = await provisionDeps(run.repo, workspace);
  if (deps.tree === 'own' && deps.installed)
    notes.push('node_modules: installed with npm ci — package-lock.json asks for packages the main checkout has not installed');
  if (deps.tree === 'failed') notes.push(`node_modules: not provisioned — ${deps.error.split('\n').at(-1)}`);
  if (deps.tree === 'linked')
    notes.push(
      `node_modules: main's packages linked, not hardlinked — ${deps.why ?? 'unknown'}; a fenced step's reads under it leave its worktree and are denied`,
    );
  return { workspace, branch, conflicted, deps, notes };
}

/**
 * Commit whatever a step left behind, so the workspace it hands on is the workspace it made.
 *
 * Idempotent: a clean tree commits nothing, so this runs on every pass without accumulating
 * commits. Deliberately not a failure if it cannot — a step's real work is already committed by
 * the step itself in the normal case, and losing a run over a git edge case would be worse.
 * Answers with the commit it made, or with git's words when it could not make one — a hook that refused it, a signature that failed — and
 * undefined with nothing to commit: the tick reads neither, and `nemia rm` says both. `when` goes on the commit's message, saying why.
 * The repository's hooks and signing are honoured: a hook may be what keeps a secret off a branch.
 */
export function handOff(workspace: string, step: string, when = ''): { commit: string } | { error: string } | undefined {
  const quiet = { cwd: workspace, encoding: 'utf8' as const, stdio: ['ignore', 'pipe', 'pipe'] as Array<'ignore' | 'pipe'> };
  try {
    if (!execCounted('git', ['status', '--porcelain'], quiet).trim()) return undefined;
    execCounted('git', ['add', '-A'], quiet);
    execCounted(
      'git',
      ['-c', 'user.email=wf@local', '-c', 'user.name=wf', 'commit', '-m', `${step}: hand off what was left uncommitted${when}`],
      quiet,
    );
    return { commit: git(workspace, 'rev-parse', 'HEAD') };
  } catch (err) {
    return { error: failedWords(err) };
  }
}

/**
 * What a failed git command said, for a person: the last lines of its stderr — where git hands on a hook's output, stdout's too — or its
 * exit status.
 */
function failedWords(err: unknown, lines = 4): string {
  const { stderr, status } = err as { stderr?: unknown; status?: number | null };
  const said = (Buffer.isBuffer(stderr) ? stderr.toString('utf8') : typeof stderr === 'string' ? stderr : '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return said.length ? said.slice(-lines).join(' / ') : `it exited ${status ?? 'on a signal'}`;
}

/**
 * Git's output, or undefined when it cannot answer — quietly, as a person reads the screen this
 * feeds, and untrimmed, as a name may end in a space. A lockfile's diff is large, so is the buffer.
 */
export const gitSays = (repo: string, ...args: string[]): string | undefined => {
  try {
    return execCounted('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 * 1024 * 1024 });
  } catch {
    return undefined;
  }
};
