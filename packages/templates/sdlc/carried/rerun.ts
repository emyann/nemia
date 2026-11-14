/**
 * The one re-run of a red CI context, said once for the two waits that ask it: `pull-request.ts`'s wait on a round's head and
 * `landing.ts`'s receipt at the merge commit on the base. A red the context judged — a failure or a time-out, never one only cancelled,
 * skipped or neutral — has the failed jobs of each workflow run its red entries name re-run, once (`gh run rerun <id> --failed`, which
 * brings back the jobs that depend on them). Once is read from GitHub, never carried: a run is re-run only while its `run_attempt`
 * (`gh api repos/{owner}/{repo}/actions/runs/<id>`) is 1, so a retry of the step that waits never re-runs it again. Until GitHub has
 * replaced every job re-run, the red it still shows is no verdict (`seenAfter`); the pass or the refusal then names the jobs re-run and
 * how each ended the second time (`rerunSaid`). An attempt that cannot be read, a re-run `gh` refuses, or a red entry that is no Actions
 * job means no re-run, said in a line. Each script keeps beside its own code how long it waits and what its refusal says.
 *
 * It imports `ci-log.ts`, for how a check reads, and `exec.ts`, for how `gh` is run: the run freezes the carried folder whole
 * (`$WF_CARRIED_FILES`), so they are beside it wherever it runs.
 */
import { type Check, PASSED, type Seen, checkKey, linkOf, nameOf, pending, seenOf, verdict } from './ci-log.ts';
import { run } from './exec.ts';

/** The verdicts that judge nothing: a pass, and what CI or a person runs again rather than the work answers. */
const UNJUDGED: ReadonlySet<string> = new Set([PASSED, 'CANCELLED', 'SKIPPED', 'NEUTRAL']);

/** Whether a check is over and judged the commit red: a verdict that is no pass, and not cancelled, skipped or neutral. */
export const judgedRed = (entry: Check): boolean => !pending(entry) && !UNJUDGED.has(verdict(entry));

/** The job GitHub's own URL names for `entry` (`…/actions/runs/<run>/job/<id>`); none where its URL names no job. */
export const jobIdOf = (entry: Check): string | undefined => /\/job\/(\d+)/.exec(linkOf(entry))?.[1];

/**
 * The workflow run GitHub's own URL names for `entry`: a job's (`…/actions/runs/<run>/job/<id>`), or the run's own
 * (`…/actions/runs/<run>`), which is what the rollup entry of a run started by `workflow_dispatch` links; none where it is no Actions run.
 */
export const runIdOf = (entry: Check): string | undefined => /\/actions\/runs\/(\d+)(?:[/?#]|$)/.exec(linkOf(entry))?.[1];

/** What a wait re-ran of a red: the workflow runs, their red jobs as they were, and the lines that say why a run was not re-run. */
export type Rerun<T extends Check = Check> = { runs: string[]; was: T[]; lines: string[] };

/** The attempt GitHub says the workflow run `id` is on; `undefined` where it cannot be read or is no number. */
function attemptOfRun(id: string): number | undefined {
  const ran = run('gh', ['api', `repos/{owner}/{repo}/actions/runs/${id}`]);
  try {
    const said = ran.status === 0 ? (JSON.parse(ran.out) as { run_attempt?: unknown }).run_attempt : undefined;
    return typeof said === 'number' ? said : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The failed jobs of each workflow run a red entry of `ours`, the CI context's, names re-run, once, where it failed; none asked of a
 * context pending, green, or only cancelled, skipped or neutral. Once: only a run GitHub says is on its first attempt, so whichever
 * invocation asks, a run is re-run once at most. `entries`, the commit's latest checks, give the jobs re-run.
 */
export function rerunOnce<T extends Check>(ours: readonly T[], entries: readonly T[]): Rerun<T> | undefined {
  const red = ours.filter(judgedRed);
  if (seenOf(ours) !== 'failed' || !red.length) return undefined;
  const lines = red.filter((entry) => !runIdOf(entry)).map((entry) => `  not re-run: ${nameOf(entry)} names no job of an Actions run`);
  const runs = [...new Set(red.flatMap((entry) => runIdOf(entry) ?? []))].filter((id) => {
    const attempt = attemptOfRun(id);
    const asked = attempt === 1 ? run('gh', ['run', 'rerun', id, '--failed']) : undefined;
    const not = asked
      ? `\`gh run rerun ${id} --failed\` failed: ${asked.err.split('\n')[0]}`
      : `its attempt is ${attempt ?? 'unread'}, not 1`;
    if (asked?.status !== 0) lines.push(`  not re-run: run ${id}, as ${not}`);
    return asked?.status === 0;
  });
  return { runs, was: entries.filter((entry) => judgedRed(entry) && runs.includes(runIdOf(entry) ?? '')), lines };
}

/**
 * Which run of a check `entry` is: its job's id, or, for an entry that links only its workflow run (a dispatched run's), that link and
 * when it started, since a re-run keeps the run's link and starts the job again.
 */
const attemptOf = (entry: Check): string => jobIdOf(entry) ?? `${linkOf(entry)}@${entry.startedAt ?? ''}`;

/** How a job the wait re-ran ended the second time, by `entries`: empty while GitHub still shows its first time, which is no verdict. */
function second(entries: readonly Check[], was: Check): string {
  const now = entries.find((entry) => checkKey(entry) === checkKey(was));
  return !now || attemptOf(now) === attemptOf(was) ? '' : (verdict(now) || now.status || 'no verdict').toLowerCase();
}

/** Whether a job re-run is red again, its second time over and judged red: a real break, not a flake. */
export const redTwice = (rerun: Rerun | undefined, entries: readonly Check[]): boolean =>
  rerun?.was.some((was) => {
    const now = entries.find((entry) => checkKey(entry) === checkKey(was));
    return now !== undefined && attemptOf(now) !== attemptOf(was) && judgedRed(now);
  }) ?? false;

/** What the wait re-ran and how each job ended the second time, then why any run was not re-run; nothing where it asked nothing. */
export function rerunSaid(rerun: Rerun | undefined, entries: readonly Check[]): string[] {
  if (!rerun?.runs.length) return rerun?.lines ?? [];
  const jobs = rerun.was.map((was) => `${nameOf(was)}: ${second(entries, was) || 'not replaced yet'}`);
  return [`  re-ran the failed jobs of run ${rerun.runs.join(', ')} once; the second time, ${jobs.join(', ')}`, ...rerun.lines];
}

/** How the CI context's entries `ours` read now, where a job the wait re-ran still shows its first time in `entries`: not over yet. */
export const seenAfter = (rerun: Rerun | undefined, entries: readonly Check[], ours: readonly Check[]): Seen =>
  rerun?.was.some((was) => !second(entries, was)) ? 'pending' : seenOf(ours);
