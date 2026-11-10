/**
 * The lines of a failing CI job's log that say why it failed, for `pull-request.ts`'s refusal of a red CI context, and how a check of a
 * commit reads — its name, whether it is over, its verdict, the latest run of each, whether a context's runs were all superseded, and the
 * jobs that did not pass as a refusal lists them — for that script's wait and `landing.ts`'s, and what `landing.ts`'s receipt says of
 * its wait at the merge: pure,
 * reading no process and calling nothing. It sits beside the scripts rather than in them so each stays within its size, and it travels
 * with them: a run freezes the carried folder whole (`$WF_CARRIED_FILES`), so a script reads it there, as it is read here. It
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
 * A runner's own line for a subject that failed, `<tool>: FAILED — <subject>: <why>`, also said by one of its workers as `<tool>: worker
 * <n> FAILED — …` and relayed with the worker's tag before it (`[w<n>] `): its subject, which names the page or the case, and the rest.
 * The runner prints one such failure several times — by the worker, by the runner, again in a headline — so the subject, never the whole
 * line, is what says it once.
 */
const SUBJECT_FAILED = /^\s*(?:\[[^\]\s]+\] )?[\w.-]+: (?:worker \d+ )?FAILED — (.+)$/;

/** The subject of a runner's failed line (`SUBJECT_FAILED`): what it says before its first `: `, or all of it where it says no reason. */
const subjectOf = (line: string): string | undefined => {
  const said = SUBJECT_FAILED.exec(bare(line))?.[1];
  return said === undefined ? undefined : said.split(': ')[0].trim();
};

/**
 * Whether `line` fails a job: a test node's reporters name, `✖` (spec) or `not ok ` (TAP) after its indent — never the heading
 * `✖ failing tests:` the spec reporter lists them again under, the rule of Nemia's own check, copied, since this script imports
 * nothing — a runner's failed subject (`SUBJECT_FAILED`), a TypeScript error (`<path>(<line>,<col>): error TS<n>: …`) or oxlint's
 * ` x <rule>: …` (`×` where it draws).
 */
const failing = (line: string): boolean => {
  const said = bare(line);
  const test = /^\s*((?:✖|not ok ).*)$/.exec(said);
  if (test !== null) return !test[1].startsWith('✖ failing tests:');
  return (
    subjectOf(line) !== undefined || /^\s*\S.*?(?:\(\d+,\d+\)|:\d+:\d+)(?::| -) error TS\d+: /.test(said) || /^\s*[x×] \S+: /.test(said)
  );
};

/** What says a failing line once: a runner's failure by its subject, any other by the line itself. */
const keyOf = (line: string): string => {
  const subject = subjectOf(line);
  return subject === undefined ? bare(line).trim() : `FAILED — ${subject}`;
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
 * Whether `line` tells why a runner's subject failed: what it looked like as the runner pictured it (`what it looked like: <file>`) and,
 * where it says one, what it then failed on — its indented `what …: ` lines, and none of the call log or server lines around them.
 */
const told = (line: string): boolean => /^\s*(?:\[[^\]\s]+\] )?\s*what [^:]*: \S/.test(bare(line));

/**
 * Whether `line` is GitHub's own after the job's steps ran: the post-job cleanup, the git commands it runs there, the orphans it ends.
 * A tail drops them, and everything from `Post job cleanup.` on: none of it says why the job failed.
 */
const postJob = (line: string): boolean =>
  /^(?:Post job cleanup\.?|\[command\]\/usr\/bin\/git |Cleaning up orphan processes)/.test(line.trim());

/**
 * What a failing job's log says of why it failed: each line that fails it (`failing`) once, in order, with the lines after it that tell
 * why (`detail`, or `told` of a runner's failed subject) — the occurrence that tells most, since the spec reporter prints the test bare
 * where it ran and with its error under `✖ failing tests:`, and a runner its failure where it failed, again from the worker that ran
 * it and again in a headline — bounded by `JOB_LINES`. A log with no such line gives its
 * last `TAIL_LINES` before GitHub's post-job lines (`postJob`) instead.
 */
export function failures(log: string): { lines: string[]; tests: boolean } {
  const all = log.split('\n').map(unstamped);
  const seen = new Map<string, string[]>();
  all.forEach((line, i) => {
    if (!failing(line)) return;
    const [after, why] = [[] as string[], subjectOf(line) === undefined ? detail : told];
    for (const next of all.slice(i + 1, i + 1 + AFTER_LINES)) {
      if (ends(next)) break;
      if (why(next) && after.length < DETAIL_LINES) after.push(next);
    }
    const key = keyOf(line);
    if ((seen.get(key)?.length ?? -1) <= after.length) seen.set(key, [line, ...after]);
  });
  if (seen.size) return { lines: [...seen.values()].flat().slice(0, JOB_LINES), tests: true };
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

/**
 * Whether `ours`, the CI context's checks of a commit, carry no verdict of the commit's own: none reported, or every one concluded
 * `CANCELLED` — as a CI does whose pending run of a branch is replaced by a newer one. A check not over yet has no conclusion, so a
 * context still running is never superseded.
 */
export const superseded = (ours: readonly Check[]): boolean => ours.every((entry) => verdict(entry) === 'CANCELLED');

/** The verdicts of a job that did not fail it: a job that is over with any other did not pass. */
export const NOT_FAILED: ReadonlySet<string> = new Set([PASSED, 'SKIPPED', 'NEUTRAL']);

/** The entries of `entries` named `check`. */
export const named = <T extends Check>(entries: readonly T[], check: string): T[] => entries.filter((entry) => nameOf(entry) === check);

/** The most jobs that did not pass a refusal names, and whose log `pull-request.ts` reads. */
export const JOBS = 10;

/** `listed` by name and verdict, or state where it has none yet, with its URL, one a line, at most `JOBS` of them. */
export const listing = (listed: readonly Check[]): string[] => [
  ...listed.slice(0, JOBS).map((e) => `    ${nameOf(e)}: ${verdict(e) || e.status?.toLowerCase() || 'no verdict'} ${linkOf(e)}`.trimEnd()),
  ...(listed.length > JOBS ? [`    … and ${listed.length - JOBS} more`] : []),
];

/**
 * A landing as the receipt's wait on CI names it in what it says: its pull request's number and address, its merge commit, the base
 * branch it is on, and the CI context waited on.
 */
export type Landing = { number: number; url: string; oid: string; onto: string; check: string };

/** Where a person reads a commit of the repository the landing's pull request is of. */
const commitUrl = (l: Landing, sha: string): string => `${l.url.replace(/\/pull\/\d+$/, '')}/commit/${sha}`;

/** What every refusal of the wait says: the merge stands, and nothing was taken back. */
export const stands = (l: Landing): string => `  The merge stands and nothing was taken back: #${l.number} is on \`${l.onto}\`.`;

/** Why the merge's own `ours`, `superseded`, carry no verdict: every run cancelled, or none reported. */
export const noVerdict = (ours: readonly Check[]): string =>
  ours.length
    ? "the merge's own run was cancelled, most likely replaced by a newer run of the base's CI"
    : "the merge's own was not reported there";

/** What the receipt says where the context passed at `sha`, the base's tip, which holds the merge: red there, or `none` of its own. */
export const greenLater = (l: Landing, sha: string, none?: string): string =>
  none === undefined
    ? `\`${l.check}\` was red on \`${l.onto}\` at the merge ${l.oid.slice(0, 12)}, and is green at ${sha.slice(0, 12)}, the base's tip, which holds it`
    : `\`${l.check}\` is green on \`${l.onto}\` at ${sha.slice(0, 12)}, the base's tip, which holds the merge ${l.oid.slice(0, 12)}: ${none}`;

/**
 * What the wait says of the context at the merge once `secs` are out: never read from GitHub, naming the last error `unread`; still
 * running; cancelled; or never reported.
 */
export function unfinished(l: Landing, entries: readonly Check[], secs: number, unread?: string): string {
  const [ours, at] = [named(entries, l.check), `\`${l.check}\` on \`${l.onto}\` at ${l.oid.slice(0, 12)}, the merge of #${l.number},`];
  if (unread !== undefined)
    return `${at} could not be read from GitHub within ${secs} s; the last read said: ${unread}\n  Read ${commitUrl(l, l.oid)}.`;
  if (seenOf(ours) === 'pending') {
    const states = ours.map((entry) => (entry.status ?? entry.state ?? '').toLowerCase()).join(', ');
    return `${at} was still ${states} after ${secs} s: read ${linkOf(ours[0]) || commitUrl(l, l.oid)}, and retry the step once it is over.`;
  }
  if (ours.length)
    return [
      `${at} was cancelled, most likely replaced by a newer run of the base's CI, and no later commit of \`${l.onto}\` that holds ` +
        `it had a verdict within ${secs} s:`,
      ...listing(ours),
      `  A person re-runs it at its link, or the step is retried once a later commit's \`${l.check}\` is over.`,
    ].join('\n');
  return unreported(l, entries, secs);
}

/**
 * The refusal of a context never reported at the merge within `secs`: the other checks there still running or not passed, with their
 * URLs, and that CI may not run it on pushes to the base, which the factory's `landingWaitsOnCi` answers, or has not yet.
 */
function unreported(l: Landing, entries: readonly Check[], secs: number): string {
  const told = entries.filter((entry) => pending(entry) || !NOT_FAILED.has(verdict(entry)));
  return [
    `no \`${l.check}\` was reported on \`${l.onto}\` at ${l.oid.slice(0, 12)}, the merge of #${l.number}, within ${secs} s ` +
      `(${commitUrl(l, l.oid)}).`,
    ...(told.length ? ['  The other checks there still running or not passed:', ...listing(told)] : []),
    `  Either CI does not run \`${l.check}\` on pushes to \`${l.onto}\`, and the factory sets \`landingWaitsOnCi\` false ` +
      '(`--set landingWaitsOnCi=false`), or it has not reported yet, and the step is retried.',
  ].join('\n');
}

/**
 * The refusal of a red context at `sha` on the base, its retry line left to the caller: where — the merge, which turned the base red,
 * or the base's tip, which holds the merge that had `none` of its own — the jobs that did not pass with their URLs, and what a person
 * does.
 */
export function reddened(l: Landing, sha: string, entries: readonly Check[], none?: string): string[] {
  const [at, merge] = [sha.slice(0, 12), `the merge of #${l.number}`];
  return [
    none === undefined
      ? `\`${l.check}\` is red on \`${l.onto}\` at ${at}, ${merge}: this landing turned the base branch red.`
      : `\`${l.check}\` is red on \`${l.onto}\` at ${at}, the base's tip, which holds ${l.oid.slice(0, 12)}, ${merge}: ${none}. ` +
        'The base branch is red there.',
    stands(l),
    `  The jobs that did not pass (${commitUrl(l, sha)}):`,
    ...listing(entries.filter((entry) => !pending(entry) && !NOT_FAILED.has(verdict(entry)))),
    '  Where CI failed on its own account, a person re-runs the failed jobs; where the change broke it, a fix is landed. Then the ' +
      'step is retried, which reads the merge and the base again.',
  ];
}
