/**
 * Git and a git run's worktrees: the `git` helpers, the starting workspace, a step's worktree cut and merged, what `.worktreeinclude` copies
 * into it and the `node_modules` it is given (`deps.ts` decides, this applies), and the hand-off commit of what a step left uncommitted.
 *
 * Beneath the controllers, beside `store.ts`: it imports neither the engine nor a controller, and `runner.ts` re-exports what it exported of
 * this before.
 * What reads a branch once the run has one — its standing, its diff — is `branches.ts`'s, and a step's artifacts `artifacts.ts`'s, both
 * through the `git` helpers here, so this file imports `store.ts` alone of those beside it; `wf rm`'s removal is `forget.ts`'s.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { lastLines } from './check.ts';
import { depsPlan, inside, isModuleKey, lockfilePackages, lockfileParting, refusalLines, worktreeInclude, type DepEntry, type DepsListing, type Installed, type Provisioned, type WorktreeInclude } from './deps.ts';
import { folderPlace } from './places.ts';
import { isGitRun, workspacePlan, type Run } from './run.ts';
import type { Workflow } from './workflow.ts';
import { HOME, lstatOf, runsDir } from './store.ts';

/** How long `npm ci` may take in a worktree before the run stops waiting and tells the step. */
const NPM_CI_TIMEOUT_MS = 10 * 60_000;

const execFileAsync = promisify(execFile);


/**
 * Where the worktree's `package-lock.json` asks for a tree the main checkout does not have on disk, or
 * null when links will do: `lockfileParting`, over a look at each package path the lockfile names.
 *
 * A main checkout with no `node_modules` has no tree to part from and none to link, so its lockfile is
 * compared byte for byte instead, as before: a different one is installed in the worktree, and the same
 * one leaves nothing to provision. A worktree without a lockfile parts only from a main checkout that
 * has one — a repository without one is not npm's, and links are all there is.
 */
export function lockfileParts(mainRoot: string, worktree: string): string | null {
  const read = (file: string): string | null => { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } };
  const wanted = read(path.join(worktree, 'package-lock.json'));
  const mains = read(path.join(mainRoot, 'package-lock.json'));
  if (wanted === null) return mains === null ? null : 'package-lock.json';
  if (!fs.statSync(path.join(mainRoot, 'node_modules'), { throwIfNoEntry: false })?.isDirectory()) {
    return wanted === mains ? null : 'package-lock.json';
  }

  let lock: unknown = null;
  try { lock = JSON.parse(wanted); } catch { /* parts at package-lock.json */ }
  const installed: Record<string, Installed | null> = {};
  for (const key of Object.keys(lockfilePackages(lock) ?? {}).filter(isModuleKey)) {
    const at = path.join(mainRoot, key);
    const st = lstatOf(at);
    if (!st) installed[key] = null;
    else if (st.isSymbolicLink()) {
      installed[key] = { link: true, resolved: path.relative(mainRoot, path.resolve(path.dirname(at), fs.readlinkSync(at))).split(path.sep).join('/') };
    } else {
      let version: string | undefined;
      try { version = JSON.parse(fs.readFileSync(path.join(at, 'package.json'), 'utf8')).version; } catch { /* a package without a manifest has no version */ }
      installed[key] = { link: false, version };
    }
  }
  return lockfileParting(lock, installed);
}

/** Whether git ignores a path in a checkout. `git check-ignore` says no for a tracked path, and for one git has not been told to ignore. */
function ignored(repo: string, rel: string): boolean {
  try {
    execFileSync('git', ['check-ignore', '-q', '--', rel], { cwd: repo, stdio: 'ignore' });
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
      return fs.readdirSync(dir, { withFileTypes: true }).map((d) =>
        d.isSymbolicLink() ? { name: d.name, link: fs.readlinkSync(path.join(dir, d.name)) } : { name: d.name });
    } catch { return []; }
  };
  const entries = entriesOf(modules);
  const scopes = Object.fromEntries(entries
    .filter((e) => e.name.startsWith('@') && e.link === undefined)
    .map((e) => [e.name, entriesOf(path.join(modules, e.name))]));
  return { entries, scopes, bins: entriesOf(path.join(modules, '.bin')) };
}

/**
 * What a hardlink to main's files meets where it cannot be made: another filesystem (`EXDEV`), or one that refuses them. On any of these,
 * provisioning links main's packages instead, as it did before 2026-09-23; any other failure is a failure.
 */
const HARDLINK_REFUSED = new Set(['EXDEV', 'EPERM', 'ENOTSUP']);

/**
 * Main's entry at `from`, made again at `to`: each directory made, each file hardlinked, each link copied as written and never followed —
 * so no loop, and nothing outside `from` is read. What it made, counted; a socket or a pipe is nobody's dependency, and left out.
 */
function hardlinkTree(from: string, to: string): number {
  const st = fs.lstatSync(from);
  if (st.isSymbolicLink()) { fs.symlinkSync(fs.readlinkSync(from), to); return 1; }
  if (st.isDirectory()) {
    fs.mkdirSync(to);
    let made = 1;
    for (const name of fs.readdirSync(from)) made += hardlinkTree(path.join(from, name), path.join(to, name));
    return made;
  }
  if (st.isFile()) { fs.linkSync(from, to); return 1; }
  return 0;
}

/**
 * Give a worktree a `node_modules` of its own: `depsPlan`'s links and hardlinked packages, or `npm ci` when its lockfile differs.
 *
 * A worktree holds tracked files only, so without this a step that runs the tests fails on its first
 * command through no fault of its own. It used to be one link to the main checkout's whole tree, which
 * tested a branch against main's workspace packages and hid a dependency the branch added. Hardlinks cost
 * no install, and keep every path inside the worktree, where a fenced step may read it; when the worktree's
 * `package-lock.json` asks for packages main has not installed they would be the wrong tree, so `npm ci`
 * installs one here — about a minute, which the step is told (`depsLines`). Where a hardlink cannot be made
 * — the store on another filesystem — main's packages are linked, and the answer is `linked` with why.
 *
 * Idempotent, so a pass that died halfway can run it again and a second call changes nothing: a tree npm
 * installed (it has `.package-lock.json`, which the plan never makes) is left alone, and so is a
 * `node_modules` that is one link, cut before this; a tree the plan made gains only what it lacks, and
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
      await execFileAsync('npm', ['ci', '--no-audit', '--no-fund'], { cwd: worktree, timeout: NPM_CI_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 });
      return { tree: 'own', installed: true };
    } catch (err) {
      const { stderr, message } = err as { stderr?: string; message?: string };
      return { tree: 'failed', error: lastLines(stderr?.trim() ? stderr : message ?? String(err), 10) };
    }
  }

  const listing = listDeps(path.join(mainRoot, 'node_modules'));
  if (!listing) return { tree: 'absent' };
  let made = 0;
  // Why main's packages are linked rather than hardlinked: met by this call, or read off a link an earlier pass left.
  let why: string | undefined;
  try {
    for (const action of depsPlan(mainRoot, worktree, listing)) {
      const there = lstatOf(action.path);
      if (there) {
        if (action.kind === 'tree' && there.isSymbolicLink() && fs.readlinkSync(action.path) === action.from) why ??= 'an earlier pass linked them';
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
    try { real = fs.realpathSync(from); } catch { absent.push(rel); continue; }
    if (!inside(root, real)) { notes.push(`.worktreeinclude: refused "${rel}" leads outside the repository`); continue; }
    if (!ignored(repo, rel)) { notes.push(`.worktreeinclude: refused "${rel}" is not gitignored — the hand-off would commit it`); continue; }
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
 * own: a queued card whose `repo:` is no git repository made the tick run `rev-parse` there on every pass, and each one printed git's `fatal:
 * not a git repository` on the daemon's terminal, beside the one line `wf up` says about the card.
 */
export const git = (repo: string, ...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/**
 * Cut the run's starting workspace.
 *
 * The WORKFLOW owns this, not the engine and not the harness. Both harnesses can make a worktree
 * of their own, but each makes its *own* — and which worktree a step works in is a fact about the
 * workflow's shape, not about the harness. Owning it here also means neither harness needs a flag
 * the other one spells differently.
 */
export function makeWorkspace(repo: string, isolate: boolean): { workspace: string; baseRef: string; branch: string } {
  // No worktree is cut here. Every step gets its own from `workspaceFor`, including the first —
  // one code path, so the pure plan cannot be quietly overridden by a special case.
  return {
    workspace: repo,
    baseRef: git(repo, 'rev-parse', 'HEAD'),
    branch: git(repo, 'rev-parse', '--abbrev-ref', 'HEAD'),
  };
}

/**
 * The workspace a step runs in, made real.
 *
 * `inherit` costs nothing — the step continues where the last one left off. `fork` and `merge`
 * cut a worktree, which is what stops two concurrent steps from editing the same directory. A
 * merge that conflicts is left conflicted on purpose: the step is told, and resolving it is the
 * job. Failing here instead would throw away work that a person would simply sort out.
 */
export async function workspaceFor(
  run: Run,
  steps: readonly Workflow[],
  step: Workflow,
): Promise<{ workspace: string; branch?: string; conflicted: boolean; deps?: Provisioned; notes: string[] }> {
  const plan = workspacePlan(steps, step);
  // A folder run's steps work in folders the run makes, and nothing here is git's (`places.ts`).
  if (!isGitRun(run)) return { ...folderPlace(runsDir()).make(run, plan, step.name), conflicted: false };
  const of = (name: string) => {
    const s = run.steps[name];
    if (!s?.workspace || !s.branch) throw new Error(`${step.name}: ${name} has no workspace yet`);
    return s as { workspace: string; branch: string };
  };

  // Without isolation every step works in the repository itself, which is only safe because
  // `validate` refuses a workflow that could run two steps at once in that mode.
  if (!run.isolate) return { workspace: run.repo, branch: run.branch, conflicted: false, notes: [] };

  // And the last step of a workflow may ask for that checkout by name (`workspace: main`): merging a branch onto the base branch is
  // what a worktree cannot do, since the base branch is checked out here. Nothing is cut, nothing is merged in, and no dependency is
  // provisioned — it is the repository as a person left it, and `validate` keeps any other step from running beside it.
  if (plan.kind === 'main') return { workspace: run.repo, branch: run.branch, conflicted: false, notes: [] };

  if (plan.kind === 'inherit') {
    const parent = of(plan.from);
    return { workspace: parent.workspace, branch: parent.branch, conflicted: false, notes: [] };
  }

  // A worktree of its own, so nothing it does can collide with a sibling's.
  const branch = `wf/${run.id}/${step.name}`;
  const workspace = path.join(HOME, 'worktrees', run.id, step.name);
  const from = plan.kind === 'merge' ? of(plan.from).branch : plan.from ? of(plan.from).branch : run.baseRef;
  fs.mkdirSync(path.dirname(workspace), { recursive: true });
  // Taken up where it stands when a pass cut it and died before filing the step — in the minute `npm ci`
  // can take, say. `worktree add -b` would refuse the branch that pass made, on every pass after.
  if (!fs.existsSync(path.join(workspace, '.git'))) git(run.repo, 'worktree', 'add', '-b', branch, workspace, from);

  let conflicted = false;
  if (plan.kind === 'merge') {
    for (const other of plan.also) {
      try {
        git(workspace, '-c', 'user.email=wf@local', '-c', 'user.name=wf',
            'merge', '--no-edit', of(other).branch);
      } catch {
        // Left in place, markers and all. The step waiting on several others is the one whose
        // job this is, and it is told so in its brief.
        conflicted = true;
      }
    }
  }

  // After the merges, because the step works on the merged tree — its lockfile included.
  const notes = includeFiles(run.repo, workspace);
  const deps = await provisionDeps(run.repo, workspace);
  if (deps.tree === 'own' && deps.installed) notes.push('node_modules: installed with npm ci — package-lock.json asks for packages the main checkout has not installed');
  if (deps.tree === 'failed') notes.push(`node_modules: not provisioned — ${deps.error.split('\n').at(-1)}`);
  if (deps.tree === 'linked') notes.push(`node_modules: main's packages linked, not hardlinked — ${deps.why ?? 'unknown'}; a fenced step's reads under it leave its worktree and are denied`);
  return { workspace, branch, conflicted, deps, notes };
}

/**
 * Commit whatever a step left behind, so the workspace it hands on is the workspace it made.
 *
 * Idempotent: a clean tree commits nothing, so this runs on every pass without accumulating
 * commits. Deliberately not a failure if it cannot — a step's real work is already committed by
 * the step itself in the normal case, and losing a run over a git edge case would be worse.
 * Answers with the commit it made, or with git's words when it could not make one — a hook that refused it, a signature that failed — and
 * undefined with nothing to commit: the tick reads neither, and `wf rm` says both. `when` goes on the commit's message, saying why.
 * The repository's hooks and signing are honoured: a hook may be what keeps a secret off a branch.
 */
export function handOff(workspace: string, step: string, when = ''): { commit: string } | { error: string } | undefined {
  const quiet = { cwd: workspace, encoding: 'utf8' as const, stdio: ['ignore', 'pipe', 'pipe'] as Array<'ignore' | 'pipe'> };
  try {
    if (!execFileSync('git', ['status', '--porcelain'], quiet).trim()) return undefined;
    execFileSync('git', ['add', '-A'], quiet);
    execFileSync('git', [
      '-c', 'user.email=wf@local', '-c', 'user.name=wf',
      'commit', '-m', `${step}: hand off what was left uncommitted${when}`,
    ], quiet);
    return { commit: git(workspace, 'rev-parse', 'HEAD') };
  } catch (err) { return { error: failedWords(err) }; }
}

/** What a failed git command said, for a person: the last lines of its stderr — where git hands on a hook's output, stdout's too — or its exit status. */
function failedWords(err: unknown, lines = 4): string {
  const { stderr, status } = err as { stderr?: unknown; status?: number | null };
  const said = String(stderr ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  return said.length ? said.slice(-lines).join(' / ') : `it exited ${status ?? 'on a signal'}`;
}

/**
 * Git's output, or undefined when it cannot answer — quietly, since a person reads the screen this
 * feeds, and untrimmed, since a name may end in a space. A lockfile's diff is large, so is the buffer.
 */
export const gitSays = (repo: string, ...args: string[]): string | undefined => {
  try { return execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 * 1024 * 1024 }); } catch { return undefined; }
};
