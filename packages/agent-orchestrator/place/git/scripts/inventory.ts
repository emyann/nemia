/**
 * `inventory`: what a run left in a repository, read and touched not at all. Takes `{ repo, under, prefix, base }`; answers
 * `{ workspaces, branches }`: each worktree git lists inside `under` — never `under` itself — with its HEAD, its branch or that it is
 * detached, its lock and whether git could prune it; whether it is clean and the paths it holds uncommitted, `clean` null where it is locked,
 * prunable or its status does not read; and whether its HEAD's commit is on a branch. Then each branch under `refs/heads/<prefix>`, and
 * whether it is merged into `base` — false where `base` names nothing. A `repo` that is no directory left nothing there: it answers empty.
 * A repository git cannot list exits 1, which is no answer, never an empty one.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { git, gitSays, isDirectory, serve, text } from './contract.ts';

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
function changesIn(worktree: string): string[] | undefined {
  try {
    const said = execFileSync('git', ['status', '--porcelain'], { cwd: worktree, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return said
      .split('\n')
      .filter(Boolean)
      .map((line) => line.slice(3));
  } catch {
    return undefined;
  }
}

/** One listed worktree, as the contract's `Held` has it. */
function held(repo: string, w: Listed): object {
  const readable = w.locked === undefined && !w.prunable;
  const changes = readable ? changesIn(w.path) : undefined;
  const contained =
    w.detached && w.head && readable ? gitSays(repo, ['for-each-ref', '--contains', w.head, '--format=%(refname)', 'refs/heads/']) : '';
  return {
    path: w.path,
    ...(w.head ? { head: w.head } : {}),
    ...(w.branch ? { branch: w.branch } : {}),
    detached: Boolean(w.detached),
    ...(w.locked !== undefined ? { locked: w.locked } : {}),
    prunable: Boolean(w.prunable),
    clean: changes === undefined ? null : !changes.length,
    onBranch: !w.detached || Boolean(contained),
    ...(changes?.length ? { changes } : {}),
  };
}

serve((request) => {
  const repo = text(request, 'repo');
  const under = resolved(text(request, 'under'));
  const prefix = text(request, 'prefix');
  const base = text(request, 'base');
  if (!isDirectory(repo)) return { workspaces: [], branches: [] };
  const workspaces = parseWorktrees(git(repo, ['worktree', 'list', '--porcelain']))
    .filter((w) => inside(under, w.path))
    .map((w) => held(repo, w));
  const branches = git(repo, ['for-each-ref', '--format=%(refname)', `refs/heads/${prefix}`])
    .split('\n')
    .filter(Boolean)
    .map((ref) => ref.replace(/^refs\/heads\//, ''))
    .map((branch) => ({ branch, merged: gitSays(repo, ['merge-base', '--is-ancestor', `refs/heads/${branch}`, base]) !== undefined }));
  return { workspaces, branches };
});
