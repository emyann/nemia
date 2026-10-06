/**
 * `make`: the workspace a step works in, cut for it — a worktree at `at` on a new branch `name` from `from`, or the one already there on
 * `name`, taken up where it stands, as a pass that died before filing the step left it. Each branch of `also` is merged into it, in order;
 * a merge that conflicts is left conflicted, markers and all, since resolving it is the step's work. Then what `.worktreeinclude` lists in
 * `repo` and git ignores there is copied in, never over a file already there, never from outside the repository, and never a
 * `node_modules`, which the orchestrator makes. Takes `{ repo, at, name, from, also }`; answers `{ workspace, branch, conflicts, notes }`:
 * `at`, `name`, the paths left unmerged, and what a person should hear of the copy and of a merge that failed. Refuses a `repo` that is
 * no directory, an `at` that holds a worktree on another branch, and a cut git will not make, in git's words.
 */
import fs from 'node:fs';
import path from 'node:path';
import { failedWords, git, gitSays, isDirectory, readInclude, refusalLines, refused, serve, text, texts, type Reply } from './contract.ts';

/** The identity a merge commit of the run's is made under. */
const AS_RUN = ['-c', 'user.email=wf@local', '-c', 'user.name=wf'];

/**
 * Whether a worktree is at `at` to take up: false when none is, true when one is on `name`, and a refusal naming both when one is on
 * another branch.
 */
function takenUp(at: string, name: string): boolean | Reply {
  if (!fs.lstatSync(path.join(at, '.git'), { throwIfNoEntry: false })) return false;
  const head = gitSays(at, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (head === name) return true;
  return refused(
    `${at} holds a worktree on ${head ?? 'no branch git can name'}, not on ${name}: remove it with git worktree remove, then let the run cut it again`,
  );
}

/** The paths git left unmerged in `at`. */
const unmerged = (at: string): string[] => (gitSays(at, ['diff', '--name-only', '--diff-filter=U']) ?? '').split('\n').filter(Boolean);

/**
 * Merge each branch of `also` into `at`: the paths left unmerged, and a note for each merge that failed with nothing unmerged to show for
 * it — a branch git does not have, say.
 */
function mergeAll(at: string, also: readonly string[]): { conflicts: string[]; notes: string[] } {
  const failed: string[] = [];
  for (const branch of also) {
    try {
      git(at, [...AS_RUN, 'merge', '--no-edit', branch]);
    } catch (err) {
      failed.push(`merge: ${branch} was not merged — ${failedWords(err)}`);
    }
  }
  const conflicts = unmerged(at);
  return { conflicts, notes: conflicts.length ? [] : failed };
}

/** Whether `real` is `root` or inside it, both real paths. */
const inside = (root: string, real: string): boolean => {
  const rel = path.relative(root, real);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

/** Whether git ignores `rel` in `repo`: `check-ignore` says no for a tracked path, and for one git was not told to ignore. */
const ignored = (repo: string, rel: string): boolean => gitSays(repo, ['check-ignore', '-q', '--', rel]) !== undefined;

/**
 * Copy what `.worktreeinclude` lists from `repo` into `at`, as Claude Code's `--worktree` does: what a person should hear, as notes. Read
 * from the main checkout, never from the worktree a step can edit; only a path git ignores there is copied, since anything else lands as
 * an untracked file the hand-off would commit onto the run's branch. A path the checkout does not have is skipped; one that leads outside
 * the repository, as written or through a link, or that git does not ignore, is refused.
 */
function includeFiles(repo: string, at: string): string[] {
  const include = readInclude(repo);
  if (include === null) return [];
  if (typeof include === 'string') return [`.worktreeinclude: not read — ${include}`];
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
    if (!inside(root, real)) notes.push(`.worktreeinclude: refused "${rel}" leads outside the repository`);
    else if (!ignored(repo, rel)) notes.push(`.worktreeinclude: refused "${rel}" is not gitignored — the hand-off would commit it`);
    else {
      const to = path.join(at, rel);
      try {
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.cpSync(from, to, { recursive: true, force: false, errorOnExist: false, verbatimSymlinks: true });
      } catch (err) {
        notes.push(`.worktreeinclude: could not copy ${rel} — ${(err as Error).message}`);
      }
    }
  }
  if (absent.length) notes.unshift(`.worktreeinclude: skipped ${absent.join(', ')} — not in the main checkout`);
  return notes;
}

serve((request) => {
  const repo = text(request, 'repo');
  const at = text(request, 'at');
  const name = text(request, 'name');
  const from = text(request, 'from');
  const also = texts(request, 'also');
  if (!isDirectory(repo)) return refused(`${repo} is not a directory, so no workspace can be cut from it`);
  const there = takenUp(at, name);
  if (typeof there === 'object') return there;
  if (!there) {
    try {
      fs.mkdirSync(path.dirname(at), { recursive: true });
      git(repo, ['worktree', 'add', '-b', name, at, from]);
    } catch (err) {
      return refused(`${at} could not be cut on ${name} from ${from}: ${failedWords(err)}`);
    }
  }
  const merged = mergeAll(at, also);
  return { workspace: at, branch: name, conflicts: merged.conflicts, notes: [...merged.notes, ...includeFiles(repo, at)] };
});
