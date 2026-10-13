/**
 * `node change.ts <size|tests|pages> [closeout.json]` — what a quick build's check asks of the change itself: that it is small, and that
 * the tests and the pages of what it touched pass.
 *
 * Reads the net change in the working directory: `git diff --numstat -M` from where the work began to `HEAD`. It began on `WF_BASE_REF`,
 * or, once the branch merged a newer base, on the base it merged last: the second parent of the newest merge on the branch's first
 * parent. A line added then removed counts for nothing, and a renamed file is one file.
 *
 * - `size` counts the files changed and the lines added plus removed, tests and docs included, a generated file (`GENERATED`) left out,
 *   and refuses a change past `FILES` or `LINES`: it is a card for the build workflow, and the refusal gives the two commands.
 * - `tests` runs the tests of each package that reads a path the change touched (`READS`, which mirrors `turbo.json`), and of the
 *   packages that depend on it; every package where a root config file changed, none where no package reads the change.
 * - `pages` runs the e2e on the pages the closeout names in `pages` (`WF_CLOSEOUT`, flat), and refuses a change under `apps/web/src`
 *   that names none.
 *
 * Prints `wf size:` and `wf scope:` lines and exits 0, or with the exit of what it ran. Exits 1, on stderr, on a refusal; and when
 * `WF_BASE_REF` is not set, git cannot say what changed, or no closeout reached `pages`.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

/** A reason the step is refused: said on stderr, exit 1. */
class Refusal extends Error {}

/** The most files a quick build changes. */
const FILES = 10;

/** The most lines a quick build changes, added plus removed. */
const LINES = 300;

/** The paths a tool writes, which the bound does not count: a file, or a folder by its closing slash. */
const GENERATED = ['package-lock.json', 'apps/web/theme/', 'apps/web/src/routeTree.gen.ts'];

/** What turbo does not hash and the orchestrator's tests read all the same: the workflows, the docs, the skills and the settings. */
const UNHASHED = ['workflows/**', 'docs/**', '*.md', '.claude/**', 'apps/*/.claude/**'];

/**
 * The paths each package's tests read, from the root, as globs: its own folder, and each `$TURBO_ROOT$` input of its `test` task in
 * `turbo.json`; the orchestrator's with `UNHASHED`.
 */
const READS: Record<string, readonly string[]> = {
  'agent-orchestrator': [
    'packages/agent-orchestrator/**',
    '.oxlintrc.json',
    'lint/**',
    'tools/**',
    'apps/*/src/**',
    'apps/*/test/**',
    'apps/*/*.ts',
    'apps/*/package.json',
    'workflows/agents/**',
    'packages/agent-runtime/**',
    ...UNHASHED,
  ],
  'agent-runtime': [
    'packages/agent-runtime/**',
    'lint/**',
    'tools/**',
    'apps/*/src/**',
    'apps/*/test/**',
    'apps/*/*.ts',
    'packages/agent-orchestrator/src/**',
    'packages/agent-orchestrator/bin/**',
    'packages/agent-orchestrator/test/**',
    'packages/agent-orchestrator/place/**',
  ],
  api: ['apps/api/**', 'tools/**'],
  web: ['apps/web/**', 'tools/**'],
  docs: [
    'apps/docs/**',
    'tools/**',
    'lint/**',
    'apps/*/src/**',
    'apps/*/test/**',
    'packages/**',
    'docs/**',
    'workflows/**',
    'README.md',
    'CLAUDE.md',
  ],
};

/** A config file at the root, which every package's tests may read: a change to one selects them all. */
const ROOT_CONFIG = /^[^/]+\.(?:json|ts|mjs|js|yaml|yml)$/;

/** Where a change touches the board's pages. */
const PAGES = 'apps/web/src/';

/** One file of the change: its path, the path it was renamed from, and its lines added plus removed, none for a binary file. */
type Change = { path: string; from?: string; lines: number };

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
    else found.push({ from: fields[(i += 1)], path: fields[(i += 1)], lines });
  }
  return found;
}

/** Whether a tool writes `path`. */
const generated = (path: string): boolean => GENERATED.some((made) => (made.endsWith('/') ? path.startsWith(made) : path === made));

/** A glob of `READS` as a pattern of a whole path: `**` any path, `*` any name. */
const globbed = (glob: string): RegExp =>
  new RegExp(
    `^${glob
      .split('**')
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '[^/]*'))
      .join('.*')}$`,
  );

/** The packages whose tests read one of `paths`, in the order of `READS`: all of them where one is a root config file. */
function packagesOf(paths: readonly string[]): string[] {
  if (paths.some((path) => ROOT_CONFIG.test(path))) return Object.keys(READS);
  return Object.keys(READS).filter((name) => READS[name].some((glob) => paths.some((path) => globbed(glob).test(path))));
}

/** The exit of `command` run with `args`, its streams this process's own: 1 where it ended with no exit. */
function ran(command: string, args: readonly string[]): number {
  return spawnSync(command, args, { stdio: 'inherit' }).status ?? 1;
}

/** Every path the change touched, a renamed file's former path with its new one. */
const touched = (): string[] => changes().flatMap((change) => [change.path, ...(change.from ? [change.from] : [])]);

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

/** `tests`: runs the tests of the packages that read the change, and of their dependents; the exit of the run, 0 where none reads it. */
function tests(say: (line: string) => void): number {
  const names = packagesOf(touched());
  if (!names.length) {
    say("wf scope: tests of no package, since none reads what the change touched; the landing's check runs them all");
    return 0;
  }
  const every = names.length === Object.keys(READS).length;
  say(`wf scope: tests ${every ? 'of every package' : names.join(', ')}`);
  return ran('npx', ['turbo', 'run', 'test', '--force', '--continue', ...(every ? [] : names.map((name) => `--filter=...${name}`))]);
}

/** The `pages` of the closeout at `file`, a list of none when it names none; refuses a closeout that does not read, or a name that is no string. */
function pagesOf(file: string | undefined): string[] {
  if (!file) throw new Refusal('no closeout reached the check: WF_CLOSEOUT is empty, so there is no list of pages to read');
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Refusal(`no closeout reached the check: ${file} does not read as JSON (${(err as Error).message})`, { cause: err });
  }
  const pages = (parsed as { pages?: unknown } | null)?.pages ?? [];
  if (!Array.isArray(pages) || pages.some((page) => typeof page !== 'string' || !/^[a-z0-9][\w-]*$/i.test(page)))
    throw new Refusal(`the closeout's \`pages\` is not a list of page names: ${JSON.stringify(pages)}`);
  return pages as string[];
}

/** `pages`: runs the e2e on the pages the closeout names; refuses a change to the board's pages that names none. */
function pages(say: (line: string) => void, closeout: string | undefined): number {
  const board = touched().filter((path) => path.startsWith(PAGES));
  const named = pagesOf(closeout);
  if (!named.length && board.length)
    throw new Refusal(
      `the work touches the board's pages (${board.slice(0, 5).join(', ')}), and the closeout's \`pages\` names none. ` +
        'Name the e2e pages the change touches there, as `npm run e2e -- --pages <name,…>` takes them: the check runs those.',
    );
  if (!named.length) {
    say(`wf scope: pages none, since nothing under ${PAGES.slice(0, -1)} was touched and the closeout names none`);
    return 0;
  }
  say(`wf scope: pages ${named.join(', ')}`);
  return ran('npm', ['run', 'e2e', '--', '--pages', named.join(',')]);
}

/** The whole run: the exit of the verb asked for, 1 with the refusal on stderr. */
function main(): number {
  const say = (line: string): void => void process.stdout.write(`${line}\n`);
  const [verb, closeout] = process.argv.slice(2);
  try {
    if (verb === 'size') return size(say);
    if (verb === 'tests') return tests(say);
    if (verb === 'pages') return pages(say, closeout);
    throw new Refusal(`usage: node change.ts <size|tests|pages> [closeout.json], not ${JSON.stringify(verb)}`);
  } catch (err) {
    if (!(err instanceof Refusal)) throw err;
    process.stderr.write(`wf change: ${err.message}\n`);
    return 1;
  }
}

process.exitCode = main();
