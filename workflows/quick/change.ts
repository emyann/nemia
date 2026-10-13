/**
 * `node change.ts size` — what a quick build's check asks of the change itself: that it is small.
 *
 * Reads the net change in the working directory: `git diff --numstat -M` from where the work began to `HEAD`. It began on `WF_BASE_REF`,
 * or, once the branch merged a newer base, on the base it merged last: the second parent of the newest merge on the branch's first
 * parent. A line added then removed counts for nothing, and a renamed file is one file.
 *
 * `size` counts the files changed and the lines added plus removed, tests and docs included, a generated file (`GENERATED`) left out,
 * and refuses a change past `FILES` or `LINES`: it is a card for the build workflow, and the refusal gives the two commands.
 *
 * Prints a `wf size:` line and exits 0. Exits 1, on stderr, on a refusal; and when `WF_BASE_REF` is not set, git cannot say what
 * changed, or the verb is another than `size`.
 */
import { spawnSync } from 'node:child_process';

/** A reason the step is refused: said on stderr, exit 1. */
class Refusal extends Error {}

/** The most files a quick build changes. */
const FILES = 10;

/** The most lines a quick build changes, added plus removed. */
const LINES = 300;

/** The paths a tool writes, which the bound does not count: a file, or a folder by its closing slash. */
const GENERATED = ['package-lock.json', 'apps/web/theme/', 'apps/web/src/routeTree.gen.ts'];

/** One file of the change: its path, a renamed file's new one, and its lines added plus removed, none for a binary file. */
type Change = { path: string; lines: number };

/** What git prints for `args`; refuses, saying `what` could not be told, when git fails. */
function git(what: string, ...args: string[]): string {
  const ran = spawnSync('git', ['-c', 'core.quotePath=false', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (ran.status !== 0)
    throw new Refusal(
      `cannot tell ${what}, since git ${args.join(' ')} failed (${(ran.stderr ?? '').trim() || ran.error?.message}); ` +
        'nothing is measured on a guess',
    );
  return ran.stdout;
}

/**
 * The commit the work is measured from: where `HEAD` left `base`, or the base the branch merged last, the second parent of the newest
 * merge on its first parent since.
 */
function startOf(base: string): string {
  const left = git('where the work began', 'merge-base', 'HEAD', base).trim();
  const [merge] = git('what the branch merged', 'rev-list', '--first-parent', '--merges', `${left}..HEAD`).split('\n');
  return merge ? git('the base the branch merged', 'rev-parse', `${merge}^2`).trim() : left;
}

/** The net change from `WF_BASE_REF` to `HEAD`, a file each, a rename once; refuses where `WF_BASE_REF` is not set. */
function changes(): Change[] {
  const base = process.env.WF_BASE_REF;
  if (!base) throw new Refusal("WF_BASE_REF is not set: a change is measured in a run's check, where it names the base the work began on");
  const fields = git('what the work changed', 'diff', '--numstat', '-M', '-z', startOf(base), 'HEAD', '--').split('\0');
  const found: Change[] = [];
  for (let i = 0; i < fields.length - 1; i += 1) {
    const [added, removed, path] = fields[i].split('\t');
    const lines = (Number(added) || 0) + (Number(removed) || 0);
    if (path) found.push({ path, lines });
    else found.push({ path: fields[(i += 2)], lines });
  }
  return found;
}

/** Whether a tool writes `path`. */
const generated = (path: string): boolean => GENERATED.some((made) => (made.endsWith('/') ? path.startsWith(made) : path === made));

/** The refusal of a change of `files` files and `lines` lines, which names the build workflow and the two commands that take it there. */
function tooLarge(files: number, lines: number): Refusal {
  const run = process.env.WF_RUN ?? '<run>';
  return new Refusal(
    [
      `the change is ${files} files and ${lines} lines, past a quick build's bound of ${FILES} files and ${LINES} lines ` +
        '(added plus removed; tests and docs count, generated files do not).',
      'It is a card for the build workflow, which gives a change this size a spec and a review. Cancel this run and start the card there:',
      `  nemia cancel ${run}`,
      '  nemia start "<the card\'s text>" --workflows build --factory nemia',
      'Do not trim the work to fit, and do not try this step again: the bound is on what the card asks, not on how it is written.',
    ].join('\n'),
  );
}

/** `size`: says the count, and refuses a change past `FILES` or `LINES`. */
function size(say: (line: string) => void): number {
  const counted = changes().filter((change) => !generated(change.path));
  const lines = counted.reduce((sum, change) => sum + change.lines, 0);
  say(`wf size: ${counted.length} files, ${lines} lines of ${FILES} and ${LINES}`);
  if (counted.length > FILES || lines > LINES) throw tooLarge(counted.length, lines);
  return 0;
}

/** The whole run: the exit of the verb asked for, 1 with the refusal on stderr. */
function main(): number {
  const say = (line: string): void => void process.stdout.write(`${line}\n`);
  const [verb] = process.argv.slice(2);
  try {
    if (verb === 'size') return size(say);
    throw new Refusal(`usage: node change.ts size, not ${JSON.stringify(verb)}`);
  } catch (err) {
    if (!(err instanceof Refusal)) throw err;
    process.stderr.write(`wf change: ${err.message}\n`);
    return 1;
  }
}

process.exitCode = main();
