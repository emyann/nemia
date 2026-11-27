/**
 * The one re-run of a red CI context, said once for the two reads `ci-watch.ts` makes of one: a round's head and the merge commit on the
 * base. A red the context judged — a failure or a time-out, never one only cancelled, skipped or neutral — has the failed jobs of each
 * workflow run its red entries name re-run, once (`gh run rerun <id> --failed`, which brings back the jobs that depend on them). Once is
 * read from GitHub, never carried: a run is re-run only while its `run_attempt` (`gh api repos/{owner}/{repo}/actions/runs/<id>`) is 1, so
 * a watcher started again never re-runs it a second time. The watcher asks first whether the red is worth it: it reads the logs of the red
 * jobs a re-run would bring back (`redJobsOf`) and re-runs only where none is the change's (`rerunDue`, `ci-log.ts`), saying in a line
 * whose each was (`toldSaid`); the merge's red is re-run whichever jobs it names. An attempt that cannot be read, a re-run `gh` refuses,
 * or a red entry that is no Actions job means no re-run, said in a line.
 *
 * It imports `ci-log.ts`, for how a check reads, and `exec.ts`, for how `gh` is run: the run freezes the carried folder whole
 * (`$WF_CARRIED_FILES`), so they are beside it wherever it runs.
 */
import { type Check, type Second, type Told, PASSED, linkOf, nameOf, pending, seenOf, verdict } from './ci-log.ts';
import { run } from './exec.ts';

/** The verdicts that judge nothing: a pass, and what CI or a person runs again rather than the work answers. */
const UNJUDGED: ReadonlySet<string> = new Set([PASSED, 'CANCELLED', 'SKIPPED', 'NEUTRAL']);

/** Whether a check is over and judged the commit red: a verdict that is no pass, and not cancelled, skipped or neutral. */
export const judgedRed = (entry: Check) => !pending(entry) && !UNJUDGED.has(verdict(entry));

/** The job GitHub's own URL names for `entry` (`…/actions/runs/<run>/job/<id>`); none where its URL names no job. */
export const jobIdOf = (entry: Check) => /\/job\/(\d+)/.exec(linkOf(entry))?.[1];

/**
 * The workflow run GitHub's own URL names for `entry`: a job's (`…/actions/runs/<run>/job/<id>`), or the run's own
 * (`…/actions/runs/<run>`), which is what the rollup entry of a run started by `workflow_dispatch` links; none where it is no Actions run.
 */
export const runIdOf = (entry: Check) => /\/actions\/runs\/(\d+)(?:[/?#]|$)/.exec(linkOf(entry))?.[1];

/**
 * The attempt GitHub says the workflow run `id` is on; `undefined` where it cannot be read or is no number.
 * @param id The workflow run's id.
 * @param cwd The folder `gh` runs in, a checkout of the repository the run belongs to.
 */
export function attemptOfRun(id: string, cwd: string) {
  const ran = run('gh', ['api', `repos/{owner}/{repo}/actions/runs/${id}`], cwd);
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
 * watcher asks, a run is re-run once at most. Answers the runs re-run and the lines that say why a run was not.
 * @param ours The CI context's entries of the commit.
 * @param cwd The folder `gh` runs in, a checkout of the repository the runs belong to.
 */
export function rerunOnce(ours: readonly Check[], cwd: string) {
  const red = ours.filter(judgedRed);
  if (seenOf(ours) !== 'failed' || !red.length) return undefined;
  const lines = red.filter((entry) => !runIdOf(entry)).map((entry) => `  not re-run: ${nameOf(entry)} names no job of an Actions run`);
  const runs = [...new Set(red.flatMap((entry) => runIdOf(entry) ?? []))].filter((id) => {
    const attempt = attemptOfRun(id, cwd);
    const asked = attempt === 1 ? run('gh', ['run', 'rerun', id, '--failed'], cwd) : undefined;
    const not = asked
      ? `\`gh run rerun ${id} --failed\` failed: ${asked.err.split('\n')[0]}`
      : `its attempt is ${attempt ?? 'unread'}, not 1`;
    if (asked?.status !== 0) lines.push(`  not re-run: run ${id}, as ${not}`);
    return asked?.status === 0;
  });
  return { runs, lines };
}

/**
 * The entries of `entries` judged red whose workflow run a red entry of `ours` names: the jobs a re-run of those runs' failed jobs would
 * bring back, as they were.
 * @param ours The CI context's entries of the commit.
 * @param entries The commit's latest checks.
 */
export function redJobsOf<T extends Check>(ours: readonly T[], entries: readonly T[]) {
  const runs = new Set(ours.filter(judgedRed).flatMap((entry) => runIdOf(entry) ?? []));
  return entries.filter((entry) => judgedRed(entry) && runs.has(runIdOf(entry) ?? ''));
}

/** How a red job's line names whose it was. */
const WHOSE: Record<Told, string> = {
  change: "its log names a line that failed it, the change's",
  machine: "the machine's",
  untold: 'no log could be read, untold',
};

/**
 * The line that says why a red context was re-run or reported at once, naming each red job read and whose it was.
 * @param jobs The red jobs whose logs were read, in the order read.
 * @param told Whose each of `jobs` was, in the same order, with one more `untold` where more jobs were red than were read.
 * @param due Whether the context is re-run or reported.
 */
export function toldSaid(jobs: readonly Check[], told: readonly Told[], due: Second) {
  const each = jobs.map((job, i) => `${nameOf(job)} ${verdict(job).toLowerCase()} (${WHOSE[told[i] ?? 'untold']})`);
  const named = each.length ? each.join('; ') : 'no red job of an Actions run could be read';
  return due === 'report'
    ? "  not re-run, since a red job's log names a line that failed it, which a second run of the same commit would fail again: " +
        `${named}. A failing line this change did not touch (a flaky test) is said so in the sign-off.`
    : `  a second run is due, since no red job's log names a line that failed it: ${named}`;
}
