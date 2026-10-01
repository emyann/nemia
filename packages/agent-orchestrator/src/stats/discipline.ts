/**
 * The calls a try was refused, as the stats count them: which steps' tries are measured at all (`deniesRecorded`), which sessions ran as
 * jobs that record them (`ranAsJob`), and every call each ended attempt of a session was denied, one per call (`deniedCallsOf`). Pure:
 * `stats.verb.ts` hands the views here and words each call with the runtime's `denialText`.
 */
import { DEFAULT_HARNESS } from '../harness/harness.ts';
import type { Workflow } from '../step/step.ts';
import type { TaskSpan } from '../timeline/timeline.ts';

/** The harnesses whose sessions say what they were denied: a job, `claude -p`, on either. */
const RECORDING = ['claude', 'claude-detached'];

/**
 * Whether a step's sessions record what they were denied, read off its frozen `harness:` (`DEFAULT_HARNESS` where it names none) and
 * `background:`: true on `claude` and `claude-detached`. False on `codex`, whose sandbox refuses a call nowhere the run reads, on a remote
 * agent (`a2a:<name>`), which reports none, and beside `background: true`, whose `claude --bg` session records none — the same harnesses
 * `denialsOf` refuses `denials: fail` on.
 */
export const deniesRecorded = (step: Pick<Workflow, 'harness' | 'background'>): boolean =>
  RECORDING.includes(step.harness ?? DEFAULT_HARNESS) && step.background !== true;

/**
 * The moment a `claude` step's sessions began to run as jobs (`claude -p`), which record what they were denied: a session filed before it
 * ran as a background session (`claude --bg`), which records none, and its journal says nothing that tells the two apart.
 */
export const JOBS_SINCE = '2026-09-23T19:04:31.000Z';

/**
 * Whether a session ran as a job that records its denials: filed at `JOBS_SINCE` or after, read off its filing, else its first spawn.
 * False for a session filed before, and for one whose filing and spawn are both unknown.
 */
export const ranAsJob = (session: Pick<TaskSpan, 'filedAt' | 'spawnedAt'>): boolean => {
  const since = session.filedAt ?? session.spawnedAt;
  return since !== null && Date.parse(since) >= Date.parse(JOBS_SINCE);
};

/** What `deniedCallsOf` reads of a task's view: its attempts, whether each ended, and what each was denied. */
export type DeniedClock<D> = { state: { attempts: ReadonlyArray<{ ended: unknown; denials?: readonly D[] }> } };

/**
 * Every call a task's sessions were denied: each denial of each attempt that ended, in the order of the attempts, one per call — a call
 * denied twice is two. Empty for a task with no view, and for one denied nothing.
 */
export const deniedCallsOf = <D>(view: DeniedClock<D> | undefined): D[] =>
  (view?.state.attempts ?? []).flatMap((a) => (a.ended === null || a.ended === undefined ? [] : [...(a.denials ?? [])]));
