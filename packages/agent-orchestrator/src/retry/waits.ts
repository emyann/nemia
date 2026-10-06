/**
 * What waits on the person, from a step's standing: a step at its gate, a step's question to them, a step that ended unsigned, a refused
 * check, a loop out of rounds, a step over its cap, a denied call (`WAITS_ON_PERSON`, `waitsOnPerson`). Pure: `nemia ls` says such a step
 * waits on you (`listing`), a run with nothing in flight and such a step is not finished to `nemia cancel` (`cancelPlan`), and admission
 * asks the person of a try of such a step (`admissionOf`), and lets any other through.
 */
import type { StepStatus } from '../record/record.ts';
import type { retryable } from './retry.ts';

/**
 * Whether a step in each status waits on the person, nothing moving it on until someone does: `awaiting approval` at its gate, `blocked` on
 * its question, `unsigned` without the closeout it was asked for, `failed (check)` on a check that refused or did not finish, `exhausted`
 * out of its loop's rounds, `over budget` and `budget exhausted` at its cap, `denied` a call under `denials: fail`; never a step the engine
 * ended on its own (`failed`, `stopped`). A try or a round the run has due moves such a step on unasked, and its readers read that first.
 * Every status says, so a new one is classed before it compiles.
 */
export const WAITS_ON_PERSON: Record<StepStatus, boolean> = {
  waiting: false,
  running: false,
  blocked: true,
  unsigned: true,
  checking: false,
  verified: false,
  unverified: false,
  'awaiting approval': true,
  exhausted: true,
  'over budget': true,
  'budget exhausted': true,
  denied: true,
  'failed (check)': true,
  failed: false,
  stopped: false,
};

/**
 * What a try of a step waits on the person for, from its standing (`retryable`'s answer), in words they read, or undefined where nothing
 * does: its status (`WAITS_ON_PERSON`); a try that sends the work back from a gate (`sendsBack`); a session its harness blocked on them
 * (`blockedByHarness`); a try past its cap (`raise`).
 *
 * @param recheck Whether the try is a `--recheck`: it runs a refused or unfinished check again on the work as it stands, files no session
 *   and spends nothing, so `failed (check)` asks nothing of the person for it.
 */
export function waitsOnPerson(standing: ReturnType<typeof retryable>, recheck = false): string | undefined {
  if (WAITS_ON_PERSON[standing.status] && !(recheck && standing.status === 'failed (check)')) return `it is ${standing.status}`;
  if (standing.sendsBack) return 'a try of it sends the work back from a gate';
  if (standing.blockedByHarness) return 'its session waits on you';
  if (standing.raise) return 'a try of it runs past its cap';
  return undefined;
}
