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
import { failedWords, git, gitSays, isDirectory, readInclude, refusalLines, refused, type Asking, type Refusal, type Reply } from '../git.ts';
import type { PlaceRequests } from '../../../src/place/place.ts';

/** The identity a merge commit of the run's is made under. */
const AS_RUN = ['-c', 'user.email=wf@local', '-c', 'user.name=wf'];

/**
 * Whether a worktree is at `at` to take up: false when none is, true when one is on `name`, and a refusal naming both when one is on
 * another branch.
 */
function* takenUp(at: string, name: string): Asking<boolean | Refusal> {
  if (!fs.lstatSync(path.join(at, '.git'), { throwIfNoEntry: false })) return false;
  const head = yield* gitSays(at, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (head === name) return true;
  return refused(
    `${at} holds a worktree on ${head ?? 'no branch git can name'}, not on ${name}: remove it with git worktree remove, then let the run cut it again`,
  );
}

/**
 * Merge each branch of `also` into `at`: the paths left unmerged, and a note for each merge that failed with nothing unmerged to show for
 * it — a branch git does not have, say.
 */
function* mergeAll(at: string, also: readonly string[]): Asking<{ conflicts: string[]; notes: string[] }> {
  const failed: string[] = [];
  for (const branch of also) {
    try {
      yield* git(at, [...AS_RUN, 'merge', '--no-edit', branch]);
    } catch (err) {
      failed.push(`merge: ${branch} was not merged — ${failedWords(err)}`);
    }
  }
  const conflicts = ((yield* gitSays(at, ['diff', '--name-only', '--diff-filter=U'])) ?? '').split('\n').filter(Boolean);
  return { conflicts, notes: conflicts.length ? [] : failed };
}

/** Whether `real` is `root` or inside it, both real paths. */
const inside = (root: string, real: string): boolean => {
  const rel = path.relative(root, real);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

/** `rel` of `repo` copied to `at`, never over a file already there: a note when it could not be. */
function copied(repo: string, at: string, rel: string): string[] {
  const to = path.join(at, rel);
  try {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.cpSync(path.join(repo, rel), to, { recursive: true, force: false, errorOnExist: false, verbatimSymlinks: true });
    return [];
  } catch (err) {
    return [`.worktreeinclude: could not copy ${rel} — ${(err as Error).message}`];
  }
}

/**
 * Copy what `.worktreeinclude` lists from `repo` into `at`, as Claude Code's `--worktree` does: what a person should hear, as notes. Read
 * from the main checkout, never from the worktree a step can edit; only a path git ignores there is copied, since anything else lands as
 * an untracked file the hand-off would commit onto the run's branch. A path the checkout does not have is skipped; one that leads outside
 * the repository, as written or through a link, or that git does not ignore, is refused.
 */
function* includeFiles(repo: string, at: string): Asking<string[]> {
  const include = readInclude(repo);
  if (include === null) return [];
  if (typeof include === 'string') return [`.worktreeinclude: not read — ${include}`];
  const notes = refusalLines(include.refused).map((line) => `.worktreeinclude: refused ${line}`);
  const root = fs.realpathSync(repo);
  const absent: string[] = [];
  for (const rel of include.copy) {
    let real: string;
    try {
      real = fs.realpathSync(path.join(repo, rel));
    } catch {
      absent.push(rel);
      continue;
    }
    if (!inside(root, real)) notes.push(`.worktreeinclude: refused "${rel}" leads outside the repository`);
    else if ((yield* gitSays(repo, ['check-ignore', '-q', '--', rel])) === undefined)
      notes.push(`.worktreeinclude: refused "${rel}" is not gitignored — the hand-off would commit it`);
    else notes.push(...copied(repo, at, rel));
  }
  if (absent.length) notes.unshift(`.worktreeinclude: skipped ${absent.join(', ')} — not in the main checkout`);
  return notes;
}

/** The verb's body. */
export function* make({ repo, at, name, from, also }: PlaceRequests['make']): Asking<Reply<'make'>> {
  if (!isDirectory(repo)) return refused(`${repo} is not a directory, so no workspace can be cut from it`);
  const there = yield* takenUp(at, name);
  if (typeof there === 'object') return there;
  if (!there) {
    try {
      fs.mkdirSync(path.dirname(at), { recursive: true });
      yield* git(repo, ['worktree', 'add', '-b', name, at, from]);
    } catch (err) {
      return refused(`${at} could not be cut on ${name} from ${from}: ${failedWords(err)}`);
    }
  }
  const merged = yield* mergeAll(at, also);
  return { workspace: at, branch: name, conflicts: merged.conflicts, notes: [...merged.notes, ...(yield* includeFiles(repo, at))] };
}
