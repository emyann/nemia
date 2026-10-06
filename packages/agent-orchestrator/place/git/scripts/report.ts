/**
 * `report`: what each result branch changed against a run's base, read in git's object store alone, which touches no checkout. Takes
 * `{ repo, baseRef, onto, branches, diffOf, present, atBase }`, the last three lists of paths from the repository's root; answers
 * `Changes`: `at`, the base, the commit `onto` names now (null where git has none) and each branch's tip; `files`, each branch's changed
 * files against the base, renames found, with null counts for a binary file; `diffs`, for each branch, the whole diff of each path of
 * `diffOf` it changed, a rename's two ends as one; `present`, for each branch, whether each path of `present` is a file, a directory or
 * absent at its tip; and `atBase`, the text of each path of `atBase` at the base, null where none is.
 *
 * A branch git does not have is left out of every answer, never answered as one that changed nothing. Refuses a repository that is no
 * directory, a base git cannot read, and a git command that fails, in git's words. Exits 1 when git cannot be started at all.
 */
import { execFileSync } from 'node:child_process';
import { Malformed, failedWords, isDirectory, refused, serve, text, type Request } from './contract.ts';

/** One file a branch changed, as `Changes.files` says it. */
type ChangedFile = { path: string; from?: string; status: string; added: number | null; removed: number | null };

/** A git command that failed with an exit status: the place's refusal, in git's words. */
class Refused extends Error {}

/** The list of strings `key` of `request`, or `Malformed` naming it. */
function listOf(request: Request, key: string): string[] {
  const value = request[key];
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string'))
    throw new Malformed(`the request's \`${key}\` is ${JSON.stringify(value) ?? 'missing'}, where a list of strings is asked`);
  return value as string[];
}

/** Git's stdout as it printed it, with paths unquoted; a failure with an exit status is `Refused`, and any other is thrown as it is. */
function read(repo: string, args: readonly string[]): string {
  try {
    return execFileSync('git', ['-c', 'core.quotePath=false', '--literal-pathspecs', ...args], {
      cwd: repo,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch (err) {
    if (typeof (err as { status?: unknown }).status === 'number') throw new Refused(`git ${args[0]} failed: ${failedWords(err)}`);
    throw err;
  }
}

/** Git's stdout, trimmed, or undefined when git exits with a status: a question whose no is an answer. Git that cannot start is thrown. */
function asked(repo: string, args: readonly string[]): string | undefined {
  try {
    return read(repo, args).trim();
  } catch (err) {
    if (err instanceof Refused) return undefined;
    throw err;
  }
}

/** The commit `rev` names in `repo`, or undefined where git has none. */
const commitOf = (repo: string, rev: string): string | undefined => asked(repo, ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`]);

/** What git's object store holds at `rev:path`: `blob`, `tree`, another kind, or undefined for nothing. */
const kindAt = (repo: string, rev: string, file: string): string | undefined => asked(repo, ['cat-file', '-t', `${rev}:${file}`]);

/** `--numstat -z` read into counts and paths, in git's order: a rename's record is its counts, then an empty path, then both ends. */
function numstat(out: string): Omit<ChangedFile, 'status'>[] {
  const tokens = out.split('\0');
  const read: Omit<ChangedFile, 'status'>[] = [];
  const count = (n: string) => (n === '-' ? null : Number(n));
  for (let i = 0; i < tokens.length && tokens[i] !== ''; i++) {
    const [added, removed, ...rest] = tokens[i].split('\t');
    const path = rest.join('\t');
    const counts = { added: count(added), removed: count(removed) };
    if (path) read.push({ ...counts, path });
    else {
      read.push({ ...counts, from: tokens[i + 1], path: tokens[i + 2] });
      i += 2;
    }
  }
  return read;
}

/** `--name-status -z` read into each file's status letter, in git's order: a rename or copy names both ends. */
function nameStatus(out: string): { status: string; path: string }[] {
  const tokens = out.split('\0');
  const read: { status: string; path: string }[] = [];
  for (let i = 0; i < tokens.length && tokens[i] !== ''; i++) {
    const status = tokens[i].charAt(0);
    const both = status === 'R' || status === 'C';
    read.push({ status, path: tokens[i + (both ? 2 : 1)] });
    i += both ? 2 : 1;
  }
  return read;
}

/** The files `range` changed, renames found: each with its status and counts, or `Refused` when git's two readings disagree. */
function filesOf(repo: string, range: string): ChangedFile[] {
  const diff = ['diff', '--no-color', '--no-ext-diff', '--find-renames', '-z'];
  const counts = numstat(read(repo, [...diff, '--numstat', range, '--']));
  const statuses = nameStatus(read(repo, [...diff, '--name-status', range, '--']));
  if (counts.length !== statuses.length || counts.some((c, i) => c.path !== statuses[i].path))
    throw new Refused(`git's numstat and name-status of ${range} name different files`);
  return counts.map((c, i) => ({ ...c, status: statuses[i].status }));
}

/** The whole diff of each path of `diffOf` that `files` changed, by that path; a rename's diff names both ends, as one. */
function diffsOf(repo: string, range: string, files: readonly ChangedFile[], diffOf: readonly string[]): Record<string, string> {
  const diffs: Record<string, string> = {};
  for (const asked of diffOf) {
    const file = files.find((f) => f.path === asked || f.from === asked);
    if (!file) continue;
    const ends = file.from ? [file.from, file.path] : [file.path];
    diffs[asked] = read(repo, ['diff', '--no-color', '--no-ext-diff', '--find-renames', range, '--', ...ends]);
  }
  return diffs;
}

/** Whether each path of `paths` is a file, a directory or absent at `rev`. */
const presentAt = (repo: string, rev: string, paths: readonly string[]): Record<string, 'file' | 'directory' | 'absent'> =>
  Object.fromEntries(
    paths.map((p) => {
      const kind = kindAt(repo, rev, p);
      return [p, kind === 'blob' ? 'file' : kind === 'tree' ? 'directory' : 'absent'];
    }),
  );

/** The text of each path of `paths` at `rev`, or null where it has no file. */
const textsAt = (repo: string, rev: string, paths: readonly string[]): Record<string, string | null> =>
  Object.fromEntries(paths.map((p) => [p, kindAt(repo, rev, p) === 'blob' ? read(repo, ['cat-file', 'blob', `${rev}:${p}`]) : null]));

serve((request) => {
  const repo = text(request, 'repo');
  const baseRef = text(request, 'baseRef');
  const onto = text(request, 'onto');
  const [branches, diffOf, present, atBase] = ['branches', 'diffOf', 'present', 'atBase'].map((key) => listOf(request, key));
  if (!isDirectory(repo)) return refused(`${repo} is not a directory, so nothing a branch in it changed can be read`);
  try {
    if (!commitOf(repo, baseRef)) return refused(`git cannot read the base ${baseRef} in ${repo}`);
    const tips: Record<string, string> = {};
    for (const branch of branches) {
      const tip = commitOf(repo, branch);
      if (tip) tips[branch] = tip;
    }
    const had = Object.keys(tips);
    const files = Object.fromEntries(had.map((b) => [b, filesOf(repo, `${baseRef}...${b}`)]));
    return {
      at: { baseRef, onto: commitOf(repo, onto) ?? null, tips },
      files,
      diffs: Object.fromEntries(had.map((b) => [b, diffsOf(repo, `${baseRef}...${b}`, files[b], diffOf)])),
      present: Object.fromEntries(had.map((b) => [b, presentAt(repo, b, present)])),
      atBase: textsAt(repo, baseRef, atBase),
    };
  } catch (err) {
    if (err instanceof Refused) return refused(err.message);
    throw err;
  }
});
