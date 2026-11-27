/**
 * A run's result branches: the steps whose branch is its result (`resultSteps`), the
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
import { type StepSpec } from '../step/step.ts';
import { terminalSteps } from '../workflow/index.ts';
import { isRepositoryRun, type Run } from '../record/record.ts';
import { conditionOf } from '../route/index.ts';
import type { Assessment } from '../tick/assess.ts';
import type { BranchStood } from '../place/place.ts';
import type { LessonState } from 'objects';
import type { BranchesAsked } from '../../contracts/branches-asked.contract.ts';

/**
 * The steps whose branch is the run's result: the steps nothing waits on (`terminalSteps`) Pure.
 *
 * @param steps The run's steps.
 * @param run The run, read for the workflow nodes that routed it on; absent, none did.
 */
export function resultSteps(steps: readonly StepSpec[], run?: Run) {
  const routed = run ? routedResult(steps, run) : [];
  if (routed.length) return routed;
  const ends = terminalSteps(steps);
  return [...new Set(ends)];
}

/**
 * The result of a run that routed on to another workflow: for each workflow node that filed its card (`StepRecord.sent`), what its
 * condition read — its `input:`, or the steps it waits on where it names none. What the routed run is handed. Empty for any other run.
 * @param steps The run's steps.
 * @param run The run, whose step records say which workflow node filed its card.
 */
function routedResult(steps: readonly StepSpec[], run: Run) {
  const read = steps.flatMap((s) => {
    const condition = (s.workflow !== undefined || s.card !== undefined) && run.steps[s.name]?.sent ? conditionOf(s, steps) : undefined;
    const names = condition ? (condition.input ?? condition.after) : [];
    return steps.filter((x) => names.includes(x.name));
  });
  return [...new Set(read)];
}

/**
 * The branches whose tips this pass records (`tipsSeen`): a stopped run's result branches — succeeded, failed or waiting on a person, so
 * neither running nor cancelled — when it cut worktrees and did not work on its base branch itself. What `nemia decide` offers to land.
 * None for any other run, so git is not asked about it.
 * @param run The run.
 * @param steps Its steps.
 * @param status Its status, as `assess` judged it.
 */
export function tipBranches(run: Run, steps: readonly StepSpec[], status: Assessment['status']) {
  if (!run.isolate || status === 'running' || status === 'cancelled') return [];
  const branches = resultSteps(steps)
    .map((s) => run.steps[s.name]?.branch)
    .filter((b): b is string => Boolean(b));
  return branches.includes(run.branch) ? [] : [...new Set(branches)];
}

/**
 * The run's `tips` once this pass has seen its branches — `seen` is each branch git has, and the commit it is at — or undefined when
 * nothing changed, so an unchanged run is not written. Pure. A branch git no longer has keeps the tip last seen: that is what it is for.
 * @param run The run, whose `tips` are its last seen.
 * @param branches Its result branches.
 * @param seen Each branch git has, and the commit it is at.
 */
export function tipsSeen(run: Run, branches: readonly string[], seen: Readonly<Record<string, string>>) {
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
 * (`tipsSeen`). Pure: `heads` is every branch of
 * the repository and its commit as its caller read them, none where it read nothing.
 * @param run The run, by the tips it last saw.
 * @param branches Its result branches.
 * @param heads Every branch of the repository and its commit; undefined where its caller read nothing.
 */
export function resultTips(run: Pick<Run, 'tips'>, branches: readonly string[], heads: Readonly<Record<string, string>> | undefined) {
  const tips: Record<string, string> = Object.fromEntries(Object.entries(run.tips ?? {}).filter(([b]) => branches.includes(b)));
  for (const branch of branches) {
    if (!heads || !Object.hasOwn(heads, branch)) continue;
    const head = heads[branch];
    if (head !== undefined) tips[branch] = head;
  }
  return tips;
}

/**
 * Whether a branch has merged into its base, read off where the place's `standing` says it stands: yes when it is on
 * its base — `true` with work past its run's base, `'unchanged'` with none or where git could not tell — and false otherwise, or where
 * nothing was read. Pure.
 * @param stood Where the place says the branch stands; undefined where nothing was read.
 */
export const mergedOver = (stood: BranchStood | undefined) =>
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

/**
 * The sentence for a branch whose changes could not be read, with what the place said: never read as a branch that changed nothing.
 * @param said What the place said instead of the changes.
 */
export const notKnown = (said: string) => `what this run changed is not known: ${said}`;

/** The globs a factory's radius names (`Factory.radius`): the files its team wants shown at decide, each a list; none flags nothing. */
export type RadiusGlobs = {
  readonly agentFacing: readonly string[];
  readonly checkAffecting: readonly string[];
  readonly lessons: readonly string[];
};

/** A radius that names no file: the core knows none of a repository's own. */
export const NO_RADIUS: RadiusGlobs = { agentFacing: [], checkAffecting: [], lessons: [] };

/**
 * A `workspaces` glob as the radius matches it: a leading `./` and a trailing `/` dropped, so `./packages/*` is `packages/*`, with or
 * without a slash after it. npm reads them the same, and a regexp built from `./packages/*` as written matches no path git prints.
 * @param written The glob as the `package.json` writes it.
 */
const workspaceGlob = (written: string) => written.replace(/^(?:\.\/+)+/, '').replace(/\/+$/, '');

/**
 * The globs among a repository's `workspaces` that have `**`, as written. Not refused — the repository's `package.json` is not
 * ours — but named on the screen (`radiusLines`), since such a glob names a package at any depth: each file counts once all the
 * same, in the outermost package on its way (`packageOf`).
 * @param workspaces The repository's `workspaces` globs, as written.
 */
export const deepWorkspaces = (workspaces: readonly string[]) => workspaces.filter((w) => workspaceGlob(w).includes('**'));

/** The group of a file in no directory. */
export const ROOT_GROUP = '(root)';

/**
 * A glob as a regexp of a whole path: `*` and `?` within one folder, `**` across folders, and a trailing `/` every path under it.
 * @param glob The glob.
 */
function globRegExp(glob: string) {
  const g = glob.endsWith('/') ? `${glob}**` : glob;
  let re = '';
  for (let i = 0; i < g.length; i++) {
    if (g.startsWith('**/', i)) {
      re += '(?:.*/)?';
      i += 2;
    } else if (g.startsWith('**', i)) {
      re += '.*';
      i += 1;
    } else if (g.charAt(i) === '*') re += '[^/]*';
    else if (g.charAt(i) === '?') re += '[^/]';
    else re += g.charAt(i).replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

/**
 * Whether any of `globs` names `file` (`globRegExp`).
 * @param file The file's path from the repository's root.
 * @param globs The globs.
 */
export const matches = (file: string, globs: readonly string[]) => globs.some((g) => globRegExp(g).test(file));

/** Both ends of a rename: moving a test out of `test/` changes the check as much as editing it. */
const pathsOf = (c: Change) => (c.from ? [c.from, c.path] : [c.path]);
const nameOf = (c: Change) => (c.from ? `${c.from} → ${c.path}` : c.path);
const linesOf = (c: Change) => (c.added === null || c.removed === null ? 'binary' : `+${c.added} −${c.removed}`);

/**
 * The workspace package a file is in: the outermost directory on its way that a `workspaces` glob names (`packages/agent-orchestrator`),
 * or undefined when none does. Outermost, so a glob with `**`, which names every directory below `packages/`, puts a file in one package.
 * @param file The file's path from the repository's root.
 * @param workspaces The repository's `workspaces` globs, as written.
 */
function packageOf(file: string, workspaces: readonly string[]) {
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
 * @param file The file's path from the repository's root.
 * @param workspaces The repository's `workspaces` globs, as written; none where absent.
 */
export function groupOf(file: string, workspaces: readonly string[] = []) {
  const [top] = file.split('/').slice(0, -1);
  if (top === undefined) return ROOT_GROUP;
  return packageOf(file, workspaces) ?? top;
}

/**
 * Whether a file is where the next agent reads what this one learned: one a factory's `lessons` globs name.
 * @param file The file's path from the repository's root.
 * @param lessons The factory's `lessons` globs.
 */
export const isLesson = (file: string, lessons: readonly string[]) => matches(file, lessons);

/**
 * What a branch touched, grouped by blast radius, from the files the place's `report` says it changed. A file counts in every group it
 * touched — a move from one package to another is a change to both — and a binary file counts as a file, with no lines.
 * @param files The files the branch changed, each with its lines added and removed.
 * @param workspaces The repository's `workspaces` globs, as written; none where absent.
 * @param globs The factory's radius: the globs of the agent-facing, check-affecting and lesson files; a list left empty flags none.
 */
export function radius(files: readonly Change[], workspaces: readonly string[] = [], globs: RadiusGlobs = NO_RADIUS) {
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
    agentFacing: touching(globs.agentFacing).map(nameOf),
    checkAffecting: touching(globs.checkAffecting).map(nameOf),
    lessons: changes.filter((c) => pathsOf(c).some((p) => isLesson(p, globs.lessons))),
    deepWorkspaces: deepWorkspaces(workspaces),
  };
}

/**
 * The radius for a person: a line per group, then the agent-facing and check-affecting lines, each only when true — and a line naming
 * a `workspaces` glob with `**`, when the base has one, since the groups above are read through it.
 * @param r What the branch touched, grouped.
 */
export function radiusLines(r: Radius) {
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
          `workspaces       ${r.deepWorkspaces.join(', ')} in the base's package.json ${r.deepWorkspaces.length > 1 ? 'cross' : 'crosses'} directories: a file counts once, in the outermost package on its way`,
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
 * such a run's work is never on it. A step that recorded the base branch worked in the repository's own checkout,
 * where the run commits nothing — so the diff between the run's frozen base and that branch is not the run's work but the base moving
 * under it, which every other run's merge adds to, and read as the work it would show a person everything merged since the run
 * started. `tipBranches` refuses the same branch for the same reason.
 *
 * A run that worked on its base branch itself (`--no-worktree`) gives none: there that branch is exactly where its work is.
 * @param result The run's result branches.
 * @param worked The branch each step worked on, undefined for a step that has none.
 * @param base The run's base branch, for a run that cut worktrees; absent otherwise.
 */
export const branchesToRead = (result: readonly string[], worked: ReadonlyArray<string | undefined>, base?: string) =>
  result.length ? [...result] : [...new Set(worked.filter((b): b is string => Boolean(b) && b !== base))];

/**
 * The paths whose whole diff the screen asks for: each change a glob names at either end, by its path; the place diffs a rename as one.
 * @param changes The files a branch changed.
 * @param globs The globs of the files asked for in full.
 */
export const sensitivePaths = (changes: readonly Change[], globs: readonly string[]) =>
  changes.filter((c) => pathsOf(c).some((p) => matches(p, globs))).map((c) => c.path);

/**
 * `--sensitive a,b` read into globs; empty entries dropped.
 * @param arg The words `--sensitive` was given.
 */
export const parseGlobs = (arg: string) =>
  arg
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean);

/**
 * The heading over the files printed in full, saying why they are.
 * @param globs The globs `--sensitive` names; undefined where it was not given, and the check-affecting files are printed.
 */
export const sensitiveHeading = (globs: readonly string[] | undefined) =>
  globs
    ? `in full: the files --sensitive names (${globs.join(', ')}), in place of what decides a check`
    : 'in full: the check-affecting files — what a change could edit to make its check pass';

/**
 * How much a branch changed, in one line: `3 files: +14 −1`, and `, 1 binary` where a file has no line counts; null for a branch that
 * changed no file, which the screen beside it leaves unsaid.
 * @param r What the branch touched, grouped.
 */
export function countsLine(r: Radius) {
  if (!r.changes.length) return null;
  const binary = r.changes.filter((c) => c.added === null || c.removed === null).length;
  const sum = (n: (c: Change) => number | null) => r.changes.reduce((total, c) => total + (n(c) ?? 0), 0);
  const counted = r.changes.length > binary ? ` +${sum((c) => c.added)} −${sum((c) => c.removed)}` : '';
  const files = `${r.changes.length} file${r.changes.length === 1 ? '' : 's'}:`;
  return `${files}${counted}${binary ? `${counted ? ',' : ''} ${binary} binary` : ''}`;
}

/**
 * What each branch touched, for a person: the branch, then its radius beneath it — or the sentence saying it is not known.
 * @param touched Each branch read, and what it touched or why it is not known.
 */
export const touchedLines = (touched: readonly Touched[]) =>
  touched.flatMap(({ branch, radius: r }) =>
    'error' in r ? [`touched  ${branch}  —  ${r.error}`] : [`touched  ${branch}`, ...radiusLines(r).map((line) => `  ${line}`)],
  );

/**
 * The files printed in full on one branch, under a heading that says why: the diff the place gave, `none`
 * when no changed file is on the list — said, so an empty section is not mistaken for one never
 * looked at — or the sentence saying it is not known.
 * @param t The branch, and what it touched or why it is not known.
 * @param globs The globs `--sensitive` names; undefined for the check-affecting files.
 * @param diff The diff the place gave, or what it said instead.
 * @param many Whether the run has more than one branch, so the heading names this one; false where absent.
 */
export function inFullLines(t: Touched, globs: readonly string[] | undefined, diff: string | { error: string }, many = false) {
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
 * The lesson, for the whole run: whether its branches changed a file the next agent reads, in words without the screen's label, and which
 * of its three it is. A branch that could not be read is not a branch that wrote nothing, and it says it does not know.
 * @param touched Each branch read, and what it touched or why it is not known.
 */
export function lessonOf(touched: readonly Touched[]) {
  const unread = touched.filter((t) => 'error' in t.radius).map((t) => t.branch);
  if (unread.length)
    return { said: `not known — ${unread.join(', ')} could not be read`, state: 'unknown' } satisfies { said: string; state: LessonState };
  const written = touched.flatMap(({ branch, radius: r }) =>
    (r as Radius).lessons.map((c) => `${nameOf(c)} ${linesOf(c)}${touched.length > 1 ? ` (${branch})` : ''}`),
  );
  if (!written.length)
    return { said: 'nothing written where the next agent reads', state: 'nothing' } satisfies { said: string; state: LessonState };
  return { said: written.join(' · '), state: 'written' } satisfies { said: string; state: LessonState };
}

/**
 * The lesson line `nemia decide` prints (`lessonOf`), under its label.
 * @param touched Each branch read, and what it touched or why it is not known.
 */
export const lessonLine = (touched: readonly Touched[]) => `lesson  ${lessonOf(touched).said}`;

/**
 * Which of a run's result branches its reading asks where they stand (`BranchesAsked`, contracts/branches-asked.contract.ts): every one
 * of a run that cut worktrees of its own, nobody called off, and that is no longer running, whatever its status and whether a step of it
 * merges; none of any other. Exactly the runs the tick's pass asks git of (`asksOwn`), so a branch asked is one `standing.json` holds.
 * Pure: what the judgement, the tick's `withStandings` and `nemia decide` all read a run's standings off.
 */
export const branchesAsked: BranchesAsked = ({ isolate, cancelled, running, results }) =>
  isolate && !cancelled && !running ? [...new Set(results)] : [];

/**
 * What `branchesAsked` is asked of `run`, off its record and its status (`assess`'s): its result branches, in the order of its steps.
 * @param run The run.
 * @param steps Its steps.
 * @param status Its status, as `assess` judged it.
 */
export const askedOf = (run: Run, steps: readonly StepSpec[], status: Assessment['status']) => ({
  isolate: isRepositoryRun(run) && Boolean(run.isolate),
  cancelled: Boolean(run.cancelledAt) || status === 'cancelled',
  running: status === 'running',
  results: resultSteps(steps)
    .map((s) => run.steps[s.name]?.branch)
    .filter((b): b is string => Boolean(b)),
});
