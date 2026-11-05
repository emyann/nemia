/**
 * The lines of a failing CI job's log that say why it failed, for `pull-request.ts`'s refusal of a red CI context, and how a check of a
 * commit reads — its name, whether it is over, its verdict, the latest run of each — for that script's wait and `landing.ts`'s: pure,
 * reading no process and calling nothing. It sits beside the scripts rather than in them so each stays within its size, and it travels
 * with them: a run freezes its workflow's whole folder (`$WF_WORKFLOW_FILES`), so a script reads it there, as it is read here. It
 * imports nothing.
 */

/** The most lines the refusal prints of one failing job's log: enough to read, never a log in a closeout. */
const JOB_LINES = 60;

/** The most lines from the end of a job's log the refusal prints where the log names no failing test: a typecheck, a lint, a build. */
const TAIL_LINES = 30;

/** How far past a line naming a failing test its assertion is looked for, in lines of the log, and how many of them are kept. */
const AFTER_LINES = 30;
const DETAIL_LINES = 14;

/** The byte order mark GitHub opens a job's log with, built from its code so no raw mark sits in this file. */
const BOM = String.fromCharCode(0xfeff);

/** A line of a job's log as GitHub serves it, without the timestamp it prefixes each with and the mark it opens the log with. */
const unstamped = (line: string): string => line.replace(BOM, '').replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z ?|\r$/g, '');

/** A line without the prefix a monorepo's task runner gave it (`pkg:test: `), as Nemia's own check reads one. */
const bare = (line: string): string => line.replace(/^\S+:\S+: /, '');

/**
 * Whether `line` fails a job: a test node's reporters name, `✖` (spec) or `not ok ` (TAP) after its indent — never the heading
 * `✖ failing tests:` the spec reporter lists them again under, the rule of Nemia's own check, copied, since this script imports
 * nothing — a TypeScript error (`<path>(<line>,<col>): error TS<n>: …`) or oxlint's ` x <rule>: …` (`×` where it draws).
 */
const failing = (line: string): boolean => {
  const said = bare(line);
  const test = /^\s*((?:✖|not ok ).*)$/.exec(said);
  if (test !== null) return !test[1].startsWith('✖ failing tests:');
  return /^\s*\S.*?(?:\(\d+,\d+\)|:\d+:\d+)(?::| -) error TS\d+: /.test(said) || /^\s*[x×] \S+: /.test(said);
};

/** Whether `line` ends the lines that tell one failing test: the next test, a pass, a summary, the spec reporter's location line. */
const ends = (line: string): boolean => /^\s*(?:✔|ℹ|ok |# Subtest|test at )/.test(bare(line)) || failing(line);

/**
 * Whether `line` tells why a test failed: an error's line (`AssertionError …`, `Error: …`), the diff (`+ actual - expected`, `+`, `-`), or
 * the location oxlint draws under its rule (`,-[src/a.ts:3:7]`, `╭─[…]`).
 */
const detail = (line: string): boolean => {
  const said = bare(line).trim();
  return /^[+-](?:\s|$)/.test(said) || /^(?:,-|╭─)\[/.test(said) || (/error/i.test(said) && !said.startsWith('at '));
};

/**
 * Whether `line` is GitHub's own after the job's steps ran: the post-job cleanup, the git commands it runs there, the orphans it ends.
 * A tail drops them, and everything from `Post job cleanup.` on: none of it says why the job failed.
 */
const postJob = (line: string): boolean =>
  /^(?:Post job cleanup\.?|\[command\]\/usr\/bin\/git |Cleaning up orphan processes)/.test(line.trim());

/**
 * What a failing job's log says of why it failed: each line that fails it (`failing`) once, in order, with the lines after it that tell
 * why (`detail`) — the occurrence that tells most, since the spec reporter prints the test bare where it ran and with its error under
 * `✖ failing tests:` — bounded by `JOB_LINES`. A log with no such line gives its
 * last `TAIL_LINES` before GitHub's post-job lines (`postJob`) instead.
 */
export function failures(log: string): { lines: string[]; tests: boolean } {
  const all = log.split('\n').map(unstamped);
  const told = new Map<string, string[]>();
  all.forEach((line, i) => {
    if (!failing(line)) return;
    const after: string[] = [];
    for (const next of all.slice(i + 1, i + 1 + AFTER_LINES)) {
      if (ends(next)) break;
      if (detail(next) && after.length < DETAIL_LINES) after.push(next);
    }
    const key = bare(line).trim();
    if ((told.get(key)?.length ?? -1) <= after.length) told.set(key, [line, ...after]);
  });
  if (told.size) return { lines: [...told.values()].flat().slice(0, JOB_LINES), tests: true };
  const cleanup = all.findIndex((line) => /^Post job cleanup\.?$/.test(line.trim()));
  const ran = cleanup === -1 ? all : all.slice(0, cleanup);
  return { lines: ran.filter((line) => line.trim() && !postJob(line)).slice(-TAIL_LINES), tests: false };
}

/**
 * A check of a commit, a check run or a status context, as either script reads one: each field absent where GitHub gives none.
 * `startedAt` is when a check run started; Go's zero time (`0001-01-01T00:00:00Z`) for one still queued.
 */
type Check = Partial<Record<CheckField, string>>;
type CheckField = 'name' | 'context' | 'status' | 'state' | 'conclusion' | 'detailsUrl' | 'targetUrl' | 'workflowName' | 'startedAt';

/** The one conclusion that is a pass: a skipped, cancelled or neutral CI context is no verdict to land on. */
export const PASSED = 'SUCCESS';

/** The states of a check that is not over: anything else is a verdict. */
const PENDING = new Set(['QUEUED', 'IN_PROGRESS', 'WAITING', 'PENDING', 'REQUESTED', 'EXPECTED']);

/** The name of a check, a check run's or a status context's. */
export const nameOf = (entry: Check): string => entry.name ?? entry.context ?? '';

/** Whether a check is not over yet. */
export const pending = (entry: Check): boolean => PENDING.has((entry.status ?? entry.state ?? '').toUpperCase());

/** The verdict of a check, a check run's conclusion or a status context's state, upper-cased; empty where it has neither. */
export const verdict = (entry: Check): string => (entry.conclusion ?? entry.state ?? '').toUpperCase();

/** Where a person reads the check: a check run's details, a status context's target. */
export const linkOf = (entry: Check): string => entry.detailsUrl ?? entry.targetUrl ?? '';

/** How the CI context's checks of a commit read: none reported, none over yet, every one passed, or one that did not. */
export type Seen = 'absent' | 'pending' | 'passed' | 'failed';

/** How `ours`, the CI context's checks of a commit, read now. */
export function seenOf(ours: readonly Check[]): Seen {
  if (ours.length === 0) return 'absent';
  if (ours.every(pending)) return 'pending';
  return ours.every((entry) => verdict(entry) === PASSED) ? 'passed' : 'failed';
}

/** When `entry` started, in milliseconds; a run not started yet — no time, one that does not parse, or Go's zero time — is the newest. */
const startOf = (entry: Check): number => {
  const at = Date.parse(entry.startedAt ?? '');
  return Number.isNaN(at) || at < 0 ? Number.POSITIVE_INFINITY : at;
};

/** What makes two rollup entries runs of one check: a status context's name, or a check run's name within its workflow. */
export const checkKey = (entry: Check): string =>
  entry.context !== undefined ? `status ${entry.context}` : `run ${entry.name ?? ''}\u0000${entry.workflowName ?? ''}`;

/**
 * The latest run of each check in `entries`, in the rollup's order: a check re-run, or run again on another event of the same head (a
 * `labeled` after an `opened`), leaves its earlier runs in the rollup, and only the newest is its verdict, as GitHub's branch protection
 * and `gh pr checks` read it. The newest by `startedAt`, one not started counting as newest; of two that tie, the later in the rollup.
 */
export function latest<T extends Check>(entries: readonly T[]): T[] {
  const newest = new Map<string, number>();
  entries.forEach((entry, i) => {
    const was = newest.get(checkKey(entry));
    const prior = was === undefined ? undefined : entries[was];
    if (prior === undefined || startOf(entry) >= startOf(prior)) newest.set(checkKey(entry), i);
  });
  const kept = new Set(newest.values());
  return entries.filter((_, i) => kept.has(i));
}
