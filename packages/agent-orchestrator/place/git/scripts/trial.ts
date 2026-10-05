/**
 * `trial`: whether each branch merges onto another as both are now, by `git merge-tree --write-tree`, a merge made in git's object store
 * alone, which touches no checkout, no index and no ref. Takes `{ repo, trials }`, `trials` a list of `{ onto, branch }`; answers
 * `{ at, trials }`: the commit each `onto` names now (null where git has none), and each trial in the order asked — `{ clean: true }`,
 * `{ clean: false, conflicts }` with the files git names, or `{ unknown }` in git's first line, a branch it lacks or a git older than 2.38,
 * never a guess either way. Refuses a repository that is no directory.
 */
import { execFileSync } from 'node:child_process';
import { Malformed, gitSays, isDirectory, refused, serve, text, type Request } from './contract.ts';

/** One trial asked: merge `branch` onto `onto`. */
type Pair = { readonly onto: string; readonly branch: string };

/** One trial's answer. */
type Trial = { readonly clean: true } | { readonly clean: false; readonly conflicts: string[] } | { readonly unknown: string };

/** The list `trials` of `request`, each with a string `onto` and `branch`, or `Malformed` naming it. */
function pairs(request: Request): Pair[] {
  const value = request.trials;
  const valid =
    Array.isArray(value) &&
    value.every((p) => typeof p === 'object' && p !== null && typeof p.onto === 'string' && typeof p.branch === 'string');
  if (!valid)
    throw new Malformed(`the request's \`trials\` is ${JSON.stringify(value) ?? 'missing'}, where a list of { onto, branch } is asked`);
  return value as Pair[];
}

/**
 * Whether `branch` merges onto `onto` in `repo`. Git's exit 1 with output is its answer that the merge conflicts: the tree it wrote on the
 * first line, then each conflicted file once. Any other failure is not known, in git's first line.
 */
function trial(repo: string, { onto, branch }: Pair): Trial {
  try {
    execFileSync('git', ['merge-tree', '--write-tree', '--name-only', '--no-messages', onto, branch], {
      cwd: repo,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 16 * 1024 * 1024,
    });
    return { clean: true };
  } catch (err) {
    const { status, stdout, stderr, message } = err as { status?: number | null; stdout?: string; stderr?: string; message: string };
    if (status === 1 && stdout) return { clean: false, conflicts: stdout.split('\n').slice(1).filter(Boolean) };
    return { unknown: (stderr || message).trim().split('\n')[0] || `git merge-tree exited ${status}` };
  }
}

serve((request) => {
  const repo = text(request, 'repo');
  const asked = pairs(request);
  if (!isDirectory(repo)) return refused(`${repo} is not a directory, so no branch in it can be tried`);
  const at = Object.fromEntries(
    [...new Set(asked.map((p) => p.onto))].map((onto) => [
      onto,
      gitSays(repo, ['rev-parse', '--verify', '--quiet', `${onto}^{commit}`]) ?? null,
    ]),
  );
  return { at, trials: asked.map((p) => trial(repo, p)) };
});
