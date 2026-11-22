/**
 * `make`: the workspace a step works in, cut for it — a worktree at `at` on a new branch `name`, the run's branch for the leaf
 * (`runBranch`), from `from`, or the one already there on `name`, taken up where it stands, as a pass that died before filing the step left
 * it. Each branch of `also` is merged into it, in order; a merge that conflicts is left conflicted, markers and all, since resolving it is
 * the step's work. Then what `.worktreeinclude` lists in `repo` and git ignores there is copied in, never over a file already there, never
 * from outside the repository, and never a `node_modules`, which the orchestrator makes. Asked with `given`, the folder `given.from` is
 * then written whole at `given.to` of the worktree, kept out of git by a `.gitignore` of `*` (`givenCopy`). Takes
 * `{ repo, at, run, leaf, from, also, given? }`; answers `{ workspace, branch, conflicts, notes, given? }`: `at`, `name`, the paths left
 * unmerged, what a person should hear of the copies and of a merge that failed, and `given.to` once copied. Refuses a `repo` that is no
 * directory, an `at` that holds a worktree on another branch, a cut git will not make, in git's words, and a copy `givenCopy` refuses.
 */
import fs from 'node:fs';
import path from 'node:path';
import { failedWords, git, gitSays, isDirectory, readInclude, refusalLines, refused, runBranch } from '../git.ts';
import type { PlaceRequests } from '../../../src/place/place.ts';

/** The identity a merge commit of the run's is made under. */
const AS_RUN = ['-c', 'user.email=wf@local', '-c', 'user.name=wf'];

/**
 * Whether a worktree is at `at` to take up: false when none is, true when one is on `name`, and a refusal naming both when one is on
 * another branch.
 */
function* takenUp(at: string, name: string) {
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
function* mergeAll(at: string, also: readonly string[]) {
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
const inside = (root: string, real: string) => {
  const rel = path.relative(root, real);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

/** `rel` of `repo` copied to `at`, never over a file already there: a note when it could not be. */
function copied(repo: string, at: string, rel: string) {
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
function* includeFiles(repo: string, at: string) {
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

/** The file that keeps a copy out of git, written at the top of the copy: it ignores the folder it stands in, itself included. */
const SELF_IGNORED = '.gitignore';

/** Why `to` of `at` is no place to write a copy into, or undefined where it is: a path that leaves `at`, a link or a file on the way. */
function unsafeTarget(at: string, to: string) {
  const parts = to.split(/[\\/]/).filter(Boolean);
  if (path.isAbsolute(to) || parts.length === 0 || parts.some((p) => p === '.' || p === '..'))
    return `${JSON.stringify(to)} is no path inside the workspace: name the copy by a path from it, with no \`..\``;
  for (let i = 1; i <= parts.length; i++) {
    const rel = parts.slice(0, i).join('/');
    const seen = fs.lstatSync(path.join(at, rel), { throwIfNoEntry: false });
    if (!seen) return undefined;
    if (seen.isSymbolicLink()) return `${rel} is a link in ${at}: remove it, and the run writes the copy there on its next pass`;
    if (!seen.isDirectory()) return `${rel} is a file in ${at}, not a folder: move it, and the run writes the copy there on its next pass`;
  }
  return undefined;
}

/**
 * The folder `from` written whole at `to` of the worktree `at`, kept out of git by a `.gitignore` of `*` at its top: the path from the
 * worktree, or a refusal naming the fix. What was at `to` is removed first, so a copy is never merged over an older one; a link inside
 * `from` is not copied. Refused where `to` leaves `at` or passes a link or a file, where git tracks a file under it, which the copy would
 * overwrite and a hand-off commit, and where `from` holds a `.gitignore` at its top, which the one that keeps the copy out of git would
 * replace.
 */
function* givenCopy(at: string, given: NonNullable<PlaceRequests['make']['given']>) {
  const { from, to } = given;
  if (!isDirectory(from)) return refused(`${from} is not a directory, so nothing can be copied to ${to}: give the run its folder again`);
  const unsafe = unsafeTarget(at, to);
  if (unsafe) return refused(`the copy of ${from} was not made: ${unsafe}`);
  let tracked: string;
  try {
    tracked = yield* git(at, ['ls-files', '--', to]);
  } catch (err) {
    return refused(`the copy of ${from} was not made: git could not say what it tracks under ${to} — ${failedWords(err)}`);
  }
  if (tracked)
    return refused(
      `the copy of ${from} was not made: the repository tracks ${tracked.split('\n').join(', ')} under ${to}, which the run keeps for its copy: move them out of ${to} on the base branch`,
    );
  if (fs.lstatSync(path.join(from, SELF_IGNORED), { throwIfNoEntry: false }))
    return refused(
      `the copy of ${from} was not made: it holds a ${SELF_IGNORED} at its top, which the one that keeps the copy out of git would replace: give the file another name`,
    );
  const into = path.join(at, to);
  fs.rmSync(into, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(into), { recursive: true });
  fs.cpSync(from, into, { recursive: true, filter: (src) => !fs.lstatSync(src).isSymbolicLink() });
  fs.writeFileSync(path.join(into, SELF_IGNORED), '*\n');
  return { given: to };
}

/** The verb's body. */
export function* make({ repo, at, run, leaf, from, also, given }: PlaceRequests['make']) {
  const name = runBranch(run, leaf);
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
  const notes = [...merged.notes, ...(yield* includeFiles(repo, at))];
  if (!given) return { workspace: at, branch: name, conflicts: merged.conflicts, notes };
  const copy = yield* givenCopy(at, given);
  if ('refused' in copy) return copy;
  return {
    workspace: at,
    branch: name,
    conflicts: merged.conflicts,
    notes: [...notes, `${copy.given}: ${given.from} copied in, which git ignores`],
    given: copy.given,
  };
}
