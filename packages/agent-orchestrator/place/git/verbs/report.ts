/**
 * `report`: what each result branch changed against a run's base, read in git's object store alone, which touches no checkout. Takes
 * `{ repo, baseRef, onto, branches, diffOf, present, atBase }`, the last three lists of paths from the repository's root; answers
 * `Changes`: `at`, the base, the commit `onto` names now (null where git has none) and each branch's tip; `files`, each branch's changed
 * files against the base, renames found, with null counts for a binary file; `diffs`, for each branch, the whole diff of each path of
 * `diffOf` it changed, a rename's two ends as one; `present`, for each branch, whether each path of `present` is a file, a directory or
 * absent at its tip; and `atBase`, the text of each path of `atBase` at the base, null where none is.
 *
 * A branch git does not have is left out of every answer, never answered as one that changed nothing. Refuses a repository that is no
 * directory, a base git cannot read, and a git command that fails, in git's words. Throws when git cannot be started at all.
 */
import { failedWords, isDirectory, printed, refused, type Asking, type Reply } from '../git.ts';
import type { ChangedFile, FileChange, PlaceRequests } from '../../../src/place/place.ts';

/** A git command that failed with an exit status: the place's refusal, in git's words. */
class Refused extends Error {}

/** Git's stdout as it printed it, with paths unquoted; a failure with an exit status is `Refused`, and any other is thrown as it is. */
function* read(repo: string, args: readonly string[]): Asking<string> {
  try {
    return yield* printed({ cmd: 'git', cwd: repo, args: ['-c', 'core.quotePath=false', '--literal-pathspecs', ...args] });
  } catch (err) {
    if (typeof (err as { status?: unknown }).status === 'number') throw new Refused(`git ${args[0]} failed: ${failedWords(err)}`);
    throw err;
  }
}

/** Git's stdout, trimmed, or undefined when git exits with a status: a question whose no is an answer. Git that cannot start is thrown. */
function* asked(repo: string, args: readonly string[]): Asking<string | undefined> {
  try {
    return (yield* read(repo, args)).trim();
  } catch (err) {
    if (err instanceof Refused) return undefined;
    throw err;
  }
}

/** The commit `rev` names in `repo`, or undefined where git has none. */
const commitOf = (repo: string, rev: string): Asking<string | undefined> =>
  asked(repo, ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`]);

/** What git's object store holds at `rev:path`: `blob`, `tree`, another kind, or undefined for nothing. */
const kindAt = (repo: string, rev: string, file: string): Asking<string | undefined> => asked(repo, ['cat-file', '-t', `${rev}:${file}`]);

/** `--numstat -z` read into counts and paths, in git's order: a rename's record is its counts, then an empty path, then both ends. */
function numstat(out: string): Omit<ChangedFile, 'status'>[] {
  const tokens = out.split('\0');
  const counted: Omit<ChangedFile, 'status'>[] = [];
  const count = (n: string | undefined) => (n === '-' ? null : Number(n));
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === undefined || token === '') break;
    const [added, removed, ...rest] = token.split('\t');
    const path = rest.join('\t');
    const counts = { added: count(added), removed: count(removed) };
    if (path) counted.push({ ...counts, path });
    else {
      const [from, to] = [tokens[i + 1], tokens[i + 2]];
      if (from === undefined || to === undefined) throw new Refused(`git's numstat ends inside a rename's record`);
      counted.push({ ...counts, from, path: to });
      i += 2;
    }
  }
  return counted;
}

/**
 * Git's status letter for a file of a range, in the place's word for it; a letter git prints only for a merge or a broken pair has none.
 */
const CHANGE_OF: Readonly<Record<string, FileChange>> = {
  A: 'added',
  M: 'modified',
  D: 'removed',
  R: 'renamed',
  C: 'copied',
  T: 'changed',
};

/**
 * `--name-status -z` read into each file's change, in git's order: a rename or copy names both ends. A letter the place has no word for
 * is `Refused`, never passed on as git spelled it.
 */
export function nameStatus(out: string): { status: FileChange; path: string }[] {
  const tokens = out.split('\0');
  const named: { status: FileChange; path: string }[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === undefined || token === '') break;
    const letter = token.charAt(0);
    const status = CHANGE_OF[letter];
    if (status === undefined)
      throw new Refused(
        `git's name-status says ${letter} of a file, a change the place has no word for: report the range without it, or name it in FileChange (src/place/place.ts)`,
      );
    const both = status === 'renamed' || status === 'copied';
    const path = tokens[i + (both ? 2 : 1)];
    if (path === undefined) throw new Refused(`git's name-status ends inside the record of ${letter}`);
    named.push({ status, path });
    i += both ? 2 : 1;
  }
  return named;
}

/** The files `range` changed, renames found: each with its status and counts, or `Refused` when git's two readings disagree. */
function* filesOf(repo: string, range: string): Asking<ChangedFile[]> {
  const diff = ['diff', '--no-color', '--no-ext-diff', '--find-renames', '-z'];
  const counts = numstat(yield* read(repo, [...diff, '--numstat', range, '--']));
  const statuses = nameStatus(yield* read(repo, [...diff, '--name-status', range, '--']));
  const paired = counts.flatMap((c, i) => {
    const named = statuses[i];
    return named !== undefined && named.path === c.path ? [{ ...c, status: named.status }] : [];
  });
  if (counts.length !== statuses.length || paired.length !== counts.length)
    throw new Refused(`git's numstat and name-status of ${range} name different files`);
  return paired;
}

/** The whole diff of each path of `diffOf` that `files` changed, by that path; a rename's diff names both ends, as one. */
function* diffsOf(repo: string, range: string, files: readonly ChangedFile[], diffOf: readonly string[]): Asking<Record<string, string>> {
  const diffs: Record<string, string> = {};
  for (const wanted of diffOf) {
    const file = files.find((f) => f.path === wanted || f.from === wanted);
    if (!file) continue;
    const ends = file.from ? [file.from, file.path] : [file.path];
    diffs[wanted] = yield* read(repo, ['diff', '--no-color', '--no-ext-diff', '--find-renames', range, '--', ...ends]);
  }
  return diffs;
}

/** Whether each path of `paths` is a file, a directory or absent at `rev`. */
function* presentAt(repo: string, rev: string, paths: readonly string[]): Asking<Record<string, 'file' | 'directory' | 'absent'>> {
  const present: Record<string, 'file' | 'directory' | 'absent'> = {};
  for (const p of paths) {
    const kind = yield* kindAt(repo, rev, p);
    present[p] = kind === 'blob' ? 'file' : kind === 'tree' ? 'directory' : 'absent';
  }
  return present;
}

/** The text of each path of `paths` at `rev`, or null where it has no file. */
function* textsAt(repo: string, rev: string, paths: readonly string[]): Asking<Record<string, string | null>> {
  const texts: Record<string, string | null> = {};
  for (const p of paths)
    texts[p] = (yield* kindAt(repo, rev, p)) === 'blob' ? yield* read(repo, ['cat-file', 'blob', `${rev}:${p}`]) : null;
  return texts;
}

/** What the branches git has changed against the base, each part of `Changes` read in turn. */
function* changes({ repo, baseRef, onto, branches, diffOf, present, atBase }: PlaceRequests['report']): Asking<Reply<'report'>> {
  if (!(yield* commitOf(repo, baseRef))) return refused(`git cannot read the base ${baseRef} in ${repo}`);
  const tips: Record<string, string> = {};
  for (const branch of branches) {
    const tip = yield* commitOf(repo, branch);
    if (tip) tips[branch] = tip;
  }
  const files: Record<string, ChangedFile[]> = {};
  const diffs: Record<string, Record<string, string>> = {};
  const presents: Record<string, Record<string, 'file' | 'directory' | 'absent'>> = {};
  for (const b of Object.keys(tips)) files[b] = yield* filesOf(repo, `${baseRef}...${b}`);
  for (const [b, changed] of Object.entries(files)) diffs[b] = yield* diffsOf(repo, `${baseRef}...${b}`, changed, diffOf);
  for (const b of Object.keys(tips)) presents[b] = yield* presentAt(repo, b, present);
  const at = { baseRef, onto: (yield* commitOf(repo, onto)) ?? null, tips };
  return { at, files, diffs, present: presents, atBase: yield* textsAt(repo, baseRef, atBase) };
}

/** The verb's body. */
export function* report(request: PlaceRequests['report']): Asking<Reply<'report'>> {
  if (!isDirectory(request.repo)) return refused(`${request.repo} is not a directory, so nothing a branch in it changed can be read`);
  try {
    return yield* changes(request);
  } catch (err) {
    if (err instanceof Refused) return refused(err.message);
    throw err;
  }
}
