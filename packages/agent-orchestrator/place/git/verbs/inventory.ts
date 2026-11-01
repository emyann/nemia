/**
 * `inventory`: what a run left in a repository, read and touched not at all. Takes `{ repo, under, run, base }`; answers `{ workspaces,
 * branches }`: each worktree git lists inside `under` — never `under` itself — as the contract's `Held`: its HEAD as `tip`, its branch,
 * whether it may be removed (`removable`: `held` when it is locked, the lock's reason in `heldBy`; `gone` when git could prune it, its
 * folder no longer there; else `yes`), whether it is clean and the paths it holds uncommitted, `clean` null where it is locked, prunable or
 * its status does not read; and whether its work is on a branch (`onBranch`): its HEAD is not detached, or it is clean and its HEAD's
 * commit is on a branch already. Then each branch of the run (under `refs/heads/`, `runBranches`) and no other run's, and whether it is
 * merged into `base` — false where `base` names nothing. A `repo` that is no directory left nothing there: it answers empty. A repository
 * git cannot list throws, which is no answer, never an empty one.
 */
import fs from 'node:fs';
import path from 'node:path';
import { git, gitSays, isDirectory, printed, runBranches, type Asking, type Reply } from '../git.ts';
import type { Held, PlaceRequests } from '../../../src/place/place.ts';

/** A worktree as `git worktree list --porcelain` lists it. */
type Listed = { path: string; head?: string; branch?: string; detached?: true; locked?: string; prunable?: true };

/**
 * `git worktree list --porcelain`, read: each record starts at `worktree <path>`, and its `HEAD`, `branch`, `detached`, `locked` and
 * `prunable` lines are kept, a lock's reason with its spaces.
 */
function parseWorktrees(porcelain: string): Listed[] {
  const listed: Listed[] = [];
  for (const line of porcelain.split('\n')) {
    const [word, ...more] = line.split(' ');
    const rest = more.join(' ');
    if (word === 'worktree') listed.push({ path: rest });
    const at = listed.at(-1);
    if (!at || word === 'worktree') continue;
    if (word === 'HEAD') at.head = rest;
    else if (word === 'detached') at.detached = true;
    else if (word === 'branch') at.branch = rest.replace(/^refs\/heads\//, '');
    else if (word === 'locked') at.locked = rest;
    else if (word === 'prunable') at.prunable = true;
  }
  return listed;
}

/** A path with every link on the way followed, as far as it exists, as git names a worktree. */
function resolved(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    const parent = path.dirname(p);
    return parent === p ? p : path.join(resolved(parent), path.basename(p));
  }
}

/** Whether `p` lies inside `dir`, and is not `dir` itself. */
function inside(dir: string, p: string): boolean {
  const rel = path.relative(dir, resolved(p));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** The paths `git status --porcelain` lists in `worktree`, untrimmed so a first line's leading space stays; undefined when git fails. */
function* changesIn(worktree: string): Asking<string[] | undefined> {
  try {
    const said = yield* printed({ cmd: 'git', cwd: worktree, args: ['status', '--porcelain'] });
    return said
      .split('\n')
      .filter(Boolean)
      .map((line) => line.slice(3));
  } catch {
    return undefined;
  }
}

/** One listed worktree, as the contract's `Held` has it. */
function* held(repo: string, w: Listed): Asking<Held> {
  const readable = w.locked === undefined && !w.prunable;
  const changes = readable ? yield* changesIn(w.path) : undefined;
  const contained =
    w.detached && w.head && readable
      ? yield* gitSays(repo, ['for-each-ref', '--contains', w.head, '--format=%(refname)', 'refs/heads/'])
      : '';
  const clean = changes === undefined ? null : !changes.length;
  return {
    path: w.path,
    ...(w.head ? { tip: w.head } : {}),
    ...(w.branch ? { branch: w.branch } : {}),
    removable: w.locked !== undefined ? 'held' : w.prunable ? 'gone' : 'yes',
    ...(w.locked !== undefined ? { heldBy: w.locked } : {}),
    clean,
    onBranch: !w.detached || (clean === true && Boolean(contained)),
    ...(changes?.length ? { changes } : {}),
  };
}

/** The verb's body. */
export function* inventory(request: PlaceRequests['inventory']): Asking<Reply<'inventory'>> {
  const { repo, run, base } = request;
  const under = resolved(request.under);
  if (!isDirectory(repo)) return { workspaces: [], branches: [] };
  const workspaces: Held[] = [];
  for (const w of parseWorktrees(yield* git(repo, ['worktree', 'list', '--porcelain'])))
    if (inside(under, w.path)) workspaces.push(yield* held(repo, w));
  const branches: { branch: string; merged: boolean }[] = [];
  const refs = yield* git(repo, ['for-each-ref', '--format=%(refname)', `refs/heads/${runBranches(run)}`]);
  for (const ref of refs.split('\n').filter(Boolean)) {
    const branch = ref.replace(/^refs\/heads\//, '');
    branches.push({ branch, merged: (yield* gitSays(repo, ['merge-base', '--is-ancestor', `refs/heads/${branch}`, base])) !== undefined });
  }
  return { workspaces, branches };
}
