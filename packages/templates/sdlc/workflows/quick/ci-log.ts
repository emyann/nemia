/**
 * The lines of a failing CI job's log that say why it failed, for `pull-request.ts`'s refusal of a red CI context: pure, reading no
 * process and calling nothing. It sits beside the script rather than in it so the script stays within its size, and it travels with it:
 * a run freezes its workflow's whole folder (`$WF_WORKFLOW_FILES`), so the script reads it there, as it is read here. It imports nothing.
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
