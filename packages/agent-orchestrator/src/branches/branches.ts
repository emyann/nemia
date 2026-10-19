/**
 * A run's result branches: the steps whose branch is its result (`resultSteps`), the checks its work was judged by (`workChecks`), the
 * branch tips a pass records (`tipBranches`, `tipsSeen`), and the decider screen's reading of what a branch touched, told by where it is
 * and by what reads it (`radius`, `radiusLines`, `touchedLines`, `inFullLines`, `lessonLine`).
 *
 * Data in, lines out. `changes.store.ts` asks the place's `report` what each branch changed, `cli/main.ts` prints, and nothing here reads
 * a disk or spawns a thing — so every line the screen shows a person can be tested as a string.
 *
 * The lists are written once, here, and `nemia decide --help` prints them. A glob is a path from the
 * repository root: `*` and `?` stay within a directory, `**` crosses any number of them — a leading
 * `**` and its slash cross none as well, so the root's `package.json` is in the list — and a trailing
 * `/` takes everything below.
 */
import type { Workflow } from '../step/step.ts';
import { terminalSteps } from '../workflow/index.ts';
import type { Run } from '../record/record.ts';
import type { Assessment } from '../tick/assess.ts';
import type { Shipped } from '../decide/decide.ts';
import type { BranchStood } from '../place/place.ts';

/**
 * The steps whose branch is the run's result: the steps nothing waits on (`terminalSteps`) — and, where one of those works in the
 * repository's own checkout (`workspace: main`), the steps it waits on instead. Pure.
 *
 * An ending step has no branch of its own: it works on the base branch, and what it acts on is the work of the steps before it. Read as
 * the result, its `main` would be the run's own branch, and every question about the run's result — has it shipped, what did it touch,
 * what is there to decide — would be asked of the base branch and answered yes.
 */
export function resultSteps(steps: readonly Workflow[]): Workflow[] {
  const ends = terminalSteps(steps);
  const result = ends.flatMap((s) => (s.workspace === 'main' ? steps.filter((x) => s.after.includes(x.name)) : [s]));
  return [...new Set(result)];
}

/**
 * The checks the run's work was judged by: each distinct `check:` of a step that is not an ending, in the order the steps run. What an
 * ending step is told to run again on the merge, so a shipper written once reads its folder's check off its brief rather than carrying
 * one in its words. Pure.
 */
export function workChecks(steps: readonly Workflow[]): string[] {
  return [...new Set(steps.filter((s) => s.workspace !== 'main' && s.check).map((s) => s.check!))];
}

/**
 * The branches whose tips this pass records (`tipsSeen`): a stopped run's result branches — succeeded, failed or waiting on a person, so
 * neither running nor cancelled — when it cut worktrees and did not work on its base branch itself. What `nemia decide` offers to ship.
 * None for any other run, so git is not asked about it.
 */
export function tipBranches(run: Run, steps: readonly Workflow[], status: Assessment['status']): string[] {
  if (!run.isolate || status === 'running' || status === 'cancelled') return [];
  const branches = resultSteps(steps)
    .map((s) => run.steps[s.name]?.branch)
    .filter((b): b is string => Boolean(b));
  return branches.includes(run.branch) ? [] : [...new Set(branches)];
}

/**
 * The run's `tips` once this pass has seen its branches — `seen` is each branch git has, and the commit it is at — or undefined when
 * nothing changed, so an unchanged run is not written. Pure. A branch git no longer has keeps the tip last seen: that is what it is for.
 */
export function tipsSeen(
  run: Run,
  branches: readonly string[],
  seen: Readonly<Record<string, string>>,
): Record<string, string> | undefined {
  const tips: Record<string, string> = { ...run.tips };
  let changed = false;
  for (const branch of branches) {
    const at = seen[branch];
    if (at && at !== tips[branch]) {
      tips[branch] = at;
      changed = true;
    }
  }
  return changed ? tips : undefined;
}

/**
 * The commit each of a run's result `branches` is at, as `heads` has it — or, for one `heads` does not have, the tip the run last saw
 * (`tipsSeen`): what a merge in the repository's checkout is read as this run's by (`checkoutStatus`). Pure: `heads` is every branch of
 * the repository and its commit as its caller read them, none where it read nothing.
 */
export function resultTips(
  run: Pick<Run, 'tips'>,
  branches: readonly string[],
  heads: Readonly<Record<string, string>> | undefined,
): Record<string, string> {
  const tips: Record<string, string> = Object.fromEntries(Object.entries(run.tips ?? {}).filter(([b]) => branches.includes(b)));
  for (const branch of branches) if (heads && Object.hasOwn(heads, branch)) tips[branch] = heads[branch];
  return tips;
}

/**
 * Whether a branch has landed on its base, read off where the place's `standing` says it stands: yes when it is on
 * its base — `true` with work past its run's base, `'unchanged'` with none or where git could not tell — and false otherwise, or where
 * nothing was read. Pure.
 */
export const shippedOver = (stood: BranchStood | undefined): Shipped =>
  stood?.onBase !== 'yes' ? false : stood.pastBase === true ? true : 'unchanged';

/**
 * One file a branch changed, as the place's `report` counts it (`ChangedFile`). A rename keeps where it came `from`.
 * A binary file has no line counts: `null`, never 0, because nothing was counted.
 */
export type Change = { path: string; from?: string; added: number | null; removed: number | null };

/** A part of the repository a change touched: a workspace package, a top-level directory, or the root. */
export type Group = { name: string; files: number; added: number; removed: number; binary: number };

export type Radius = {
  changes: Change[];
  groups: Group[];
  agentFacing: string[];
  checkAffecting: string[];
  /** The changes to a file where the next agent reads (`isLesson`), for the lesson line. */
  lessons: Change[];
  /**
   * The base's `workspaces` globs that have `**`, as written (`deepWorkspaces`): each file still counts once, and the screen names
   * them. Absent on a radius nobody read workspaces for.
   */
  deepWorkspaces?: string[];
};

/** A branch the screen read, and what it touched — or the sentence saying it is not known (`notKnown`). */
export type Touched = { branch: string; radius: Radius | { error: string } };

/** The sentence for a branch whose changes could not be read, with what the place said: never read as a branch that changed nothing. */
export const notKnown = (said: string): string => `what this run changed is not known: ${said}`;

/** Files an agent reads as instructions before it reads the brief. A change to one changes every step after it. */
export const AGENT_FACING: readonly string[] = [
  '**/CLAUDE.md',
  '**/AGENTS.md',
  '**/.claude/',
  '**/.codex/',
  '**/.mcp.json',
  '**/README.md',
];

/**
 * Files that decide what a check means: its scripts, its dependencies, its compiler, its lint, and its tests. A
 * change could edit one of these to make its check pass, so they are the default `--sensitive` list,
 * and their whole diff is on the screen.
 */
export const CHECK_AFFECTING: readonly string[] = [
  '**/package.json',
  '**/package-lock.json',
  '**/tsconfig*.json',
  '**/turbo.json',
  '**/.oxlintrc.json',
  '**/.oxfmtrc.json',
  '**/*.test.*',
  '**/test/',
  '**/.e2e/',
];

/**
 * Where the next agent reads what this one learned: these, and the `docs/` of
 * each workspace package (`lessonGlobs`). Not any `docs/`: an app's `src/routes/docs/` is product code, and a
 * lesson line that counts it says a lesson was written when none was — the one wrong answer the line is for.
 */
export const LESSON: readonly string[] = ['**/CLAUDE.md', '**/AGENTS.md', 'docs/'];

/**
 * A `workspaces` glob as the radius matches it: a leading `./` and a trailing `/` dropped, so `./packages/*` is `packages/*`, with or
 * without a slash after it. npm reads them the same, and a regexp built from `./packages/*` as written matches no path git prints.
 */
export const workspaceGlob = (written: string): string => written.replace(/^(?:\.\/+)+/, '').replace(/\/+$/, '');

/**
 * The globs among a repository's `workspaces` that have `**`, as written. Not refused — the repository's `package.json` is not
 * ours — but named on the screen (`radiusLines`), since such a glob names a package at any depth: each file counts once all the
 * same, in the outermost package on its way (`packageOf`), and as a lesson only in that package's own `docs/` (`isLesson`).
 */
export const deepWorkspaces = (workspaces: readonly string[]): string[] => workspaces.filter((w) => workspaceGlob(w).includes('**'));

/**
 * The lesson list for a repository: `LESSON`, and `<workspace>/docs/` for each of its npm `workspaces` globs without `**`. Made from
 * `packages/**`, that glob would take a `docs/` inside a package's source too — `packages/x/src/docs/`, product code — so a `**` glob's
 * packages are read one file at a time instead (`isLesson`).
 */
export const lessonGlobs = (workspaces: readonly string[]): string[] => [
  ...LESSON,
  ...workspaces
    .map(workspaceGlob)
    .filter((w) => !w.includes('**'))
    .map((w) => `${w}/docs/`),
];

/** The group of a file in no directory. */
export const ROOT_GROUP = '(root)';

export function globRegExp(glob: string): RegExp {
  const g = glob.endsWith('/') ? `${glob}**` : glob;
  let re = '';
  for (let i = 0; i < g.length; i++) {
    if (g.startsWith('**/', i)) {
      re += '(?:.*/)?';
      i += 2;
    } else if (g.startsWith('**', i)) {
      re += '.*';
      i += 1;
    } else if (g[i] === '*') re += '[^/]*';
    else if (g[i] === '?') re += '[^/]';
    else re += g[i].replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

export const matches = (file: string, globs: readonly string[]): boolean => globs.some((g) => globRegExp(g).test(file));

/** Both ends of a rename: moving a test out of `test/` changes the check as much as editing it. */
const pathsOf = (c: Change): string[] => (c.from ? [c.from, c.path] : [c.path]);
const nameOf = (c: Change): string => (c.from ? `${c.from} → ${c.path}` : c.path);
const linesOf = (c: Change): string => (c.added === null || c.removed === null ? 'binary' : `+${c.added} −${c.removed}`);

/**
 * The workspace package a file is in: the outermost directory on its way that a `workspaces` glob names (`packages/agent-orchestrator`),
 * or undefined when none does. Outermost, so a glob with `**`, which names every directory below `packages/`, puts a file in one package.
 */
export function packageOf(file: string, workspaces: readonly string[]): string | undefined {
  const dirs = file.split('/').slice(0, -1);
  const packages = workspaces.map((w) => globRegExp(workspaceGlob(w)));
  for (let n = 1; n <= dirs.length; n++) {
    const dir = dirs.slice(0, n).join('/');
    if (packages.some((p) => p.test(dir))) return dir;
  }
  return undefined;
}

/**
 * The group a file counts in: the workspace package it is in (`packageOf`), else its top-level directory, else the root.
 */
export function groupOf(file: string, workspaces: readonly string[] = []): string {
  const dirs = file.split('/').slice(0, -1);
  if (!dirs.length) return ROOT_GROUP;
  return packageOf(file, workspaces) ?? dirs[0];
}

/**
 * Whether a file is where the next agent reads: on `lessonGlobs`, or — for a package a `**` glob names — in the `docs/` of the one
 * package `packageOf` puts it in, and no `docs/` deeper in that package.
 */
export function isLesson(file: string, workspaces: readonly string[] = []): boolean {
  if (matches(file, lessonGlobs(workspaces))) return true;
  const deep = deepWorkspaces(workspaces).map((w) => globRegExp(workspaceGlob(w)));
  const pkg = deep.length ? packageOf(file, workspaces) : undefined;
  return pkg !== undefined && deep.some((p) => p.test(pkg)) && file.startsWith(`${pkg}/docs/`);
}

/**
 * The npm `workspaces` of a repository's root `package.json` text, as written — its list, or its `packages` — and none when there is no
 * file or it does not read: `radius` reads `./packages/*` as `packages/*`, and names a glob with `**` (`workspaceGlob`, `deepWorkspaces`).
 */
export function workspacesIn(packageJson: string | null | undefined): string[] {
  try {
    const { workspaces } = JSON.parse(packageJson ?? '{}') as { workspaces?: unknown };
    const globs: unknown = Array.isArray(workspaces) ? workspaces : (workspaces as { packages?: unknown } | undefined)?.packages;
    return Array.isArray(globs) ? globs.filter((g): g is string => typeof g === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * What a branch touched, grouped by blast radius, from the files the place's `report` says it changed. A file counts in every group it
 * touched — a move from one package to another is a change to both — and a binary file counts as a file, with no lines.
 */
export function radius(files: readonly Change[], workspaces: readonly string[] = []): Radius {
  const changes = [...files];
  const groups = new Map<string, Group>();
  for (const c of changes) {
    for (const name of new Set(pathsOf(c).map((p) => groupOf(p, workspaces)))) {
      const g = groups.get(name) ?? { name, files: 0, added: 0, removed: 0, binary: 0 };
      g.files++;
      if (c.added === null || c.removed === null) g.binary++;
      else {
        g.added += c.added;
        g.removed += c.removed;
      }
      groups.set(name, g);
    }
  }
  const touching = (globs: readonly string[]) => changes.filter((c) => pathsOf(c).some((p) => matches(p, globs)));
  return {
    changes,
    groups: [...groups.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
    agentFacing: touching(AGENT_FACING).map(nameOf),
    checkAffecting: touching(CHECK_AFFECTING).map(nameOf),
    lessons: changes.filter((c) => pathsOf(c).some((p) => isLesson(p, workspaces))),
    deepWorkspaces: deepWorkspaces(workspaces),
  };
}

/**
 * The radius for a person: a line per group, then the agent-facing and check-affecting lines, each only when true — and a line naming
 * a `workspaces` glob with `**`, when the base has one, since the groups above are read through it.
 */
export function radiusLines(r: Radius): string[] {
  if (!r.changes.length) return ['nothing — the branch changed no file against the base'];
  const width = Math.max(...r.groups.map((g) => g.name.length));
  const files = Math.max(...r.groups.map((g) => `${g.files}`.length));
  const groups = r.groups.map((g) => {
    const counted = g.files - g.binary;
    const lines = [counted ? `+${g.added} −${g.removed}` : '', g.binary ? (counted ? `${g.binary} binary` : 'binary') : '']
      .filter(Boolean)
      .join(' · ');
    return `${g.name.padEnd(width)}  ${`${g.files}`.padStart(files)} file${g.files === 1 ? ' ' : 's'}  ${lines}`;
  });
  return [
    ...groups,
    ...(r.agentFacing.length ? [`agent-facing     ${r.agentFacing.join(', ')}`] : []),
    ...(r.checkAffecting.length ? [`check-affecting  ${r.checkAffecting.join(', ')}`] : []),
    ...(r.deepWorkspaces?.length
      ? [
          `workspaces       ${r.deepWorkspaces.join(', ')} in the base's package.json ${r.deepWorkspaces.length > 1 ? 'cross' : 'crosses'} directories: a file counts once, in the outermost package on its way, and as a lesson only in that package's docs/`,
        ]
      : []),
  ];
}

/**
 * The branches whose diff the screen reads: the run's result branches, or — when no terminal step has
 * one yet, as when the first step's check refused it — every branch a step worked on, since that is
 * where the work a person has to judge is.
 *
 * `base` is the run's own base branch, given only for a run that cut worktrees (`isolate`): it is dropped from that fallback, because
 * such a run's work is never on it. A step that recorded the base branch worked in the repository's own checkout (`workspace: main`),
 * where the run commits nothing — so the diff between the run's frozen base and that branch is not the run's work but the base moving
 * under it, which every other run's merge adds to, and read as the work it would show a person everything merged since the run
 * started. `tipBranches` refuses the same branch for the same reason.
 *
 * A run that worked on its base branch itself (`--no-worktree`) gives none: there that branch is exactly where its work is.
 */
export const branchesToRead = (result: readonly string[], worked: ReadonlyArray<string | undefined>, base?: string): string[] =>
  result.length ? [...result] : [...new Set(worked.filter((b): b is string => Boolean(b) && b !== base))];

/** The paths whose whole diff the screen asks for: each change a glob names at either end, by its path; the place diffs a rename as one. */
export const sensitivePaths = (changes: readonly Change[], globs: readonly string[]): string[] =>
  changes.filter((c) => pathsOf(c).some((p) => matches(p, globs))).map((c) => c.path);

/** `--sensitive a,b` read into globs; empty entries dropped. */
export const parseGlobs = (arg: string): string[] =>
  arg
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean);

/** The heading over the files printed in full, saying why they are. */
export const sensitiveHeading = (globs: readonly string[] | undefined): string =>
  globs
    ? `in full: the files --sensitive names (${globs.join(', ')}), in place of what decides a check`
    : 'in full: the check-affecting files — what a change could edit to make its check pass';

/**
 * How much a branch changed, in one line: `3 files: +14 −1`, and `, 1 binary` where a file has no line counts; null for a branch that
 * changed no file, which the screen beside it leaves unsaid.
 */
export function countsLine(r: Radius): string | null {
  if (!r.changes.length) return null;
  const binary = r.changes.filter((c) => c.added === null || c.removed === null).length;
  const sum = (n: (c: Change) => number | null) => r.changes.reduce((total, c) => total + (n(c) ?? 0), 0);
  const counted = r.changes.length > binary ? ` +${sum((c) => c.added)} −${sum((c) => c.removed)}` : '';
  const files = `${r.changes.length} file${r.changes.length === 1 ? '' : 's'}:`;
  return `${files}${counted}${binary ? `${counted ? ',' : ''} ${binary} binary` : ''}`;
}

/** What each branch touched, for a person: the branch, then its radius beneath it — or the sentence saying it is not known. */
export const touchedLines = (touched: readonly Touched[]): string[] =>
  touched.flatMap(({ branch, radius: r }) =>
    'error' in r ? [`touched  ${branch}  —  ${r.error}`] : [`touched  ${branch}`, ...radiusLines(r).map((line) => `  ${line}`)],
  );

/**
 * The files printed in full on one branch, under a heading that says why: the diff the place gave, `none`
 * when no changed file is on the list — said, so an empty section is not mistaken for one never
 * looked at — or the sentence saying it is not known.
 */
export function inFullLines(t: Touched, globs: readonly string[] | undefined, diff: string | { error: string }, many = false): string[] {
  const heading = `${sensitiveHeading(globs)}${many ? `, on ${t.branch}` : ''}`;
  const body =
    'error' in t.radius
      ? [t.radius.error]
      : typeof diff !== 'string'
        ? [diff.error]
        : diff.trim()
          ? diff.replace(/\n+$/, '').split('\n')
          : ['none'];
  return [`── ${heading} ${'─'.repeat(Math.max(3, 64 - heading.length))}`, ...body];
}

/**
 * The lesson line, for the whole run: whether its branches changed a file the next agent reads. A
 * branch that could not be read is not a branch that wrote nothing, and the line says it does not know.
 */
export function lessonLine(touched: readonly Touched[]): string {
  const unread = touched.filter((t) => 'error' in t.radius).map((t) => t.branch);
  if (unread.length) return `lesson  not known — ${unread.join(', ')} could not be read`;
  const written = touched.flatMap(({ branch, radius: r }) =>
    (r as Radius).lessons.map((c) => `${nameOf(c)} ${linesOf(c)}${touched.length > 1 ? ` (${branch})` : ''}`),
  );
  return `lesson  ${written.length ? written.join(' · ') : 'nothing written where the next agent reads'}`;
}
