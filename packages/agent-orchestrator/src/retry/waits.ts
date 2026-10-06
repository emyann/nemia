/**
 * What waits on the person, from a step's standing: a step at its gate, a step's question to them, a loop out of rounds, a step over its
 * cap (`WAITS_ON_PERSON`, `waitsOnPerson`). Pure: admission asks the person of a try of such a step (`admissionOf`), and lets any other
 * through. And what holds a run until someone acts, the person or Nemia (`HOLDS_THE_RUN`): `nemia ls` says such a step waits on you
 * (`listing`), and a run with nothing in flight and such a step is not finished to `nemia cancel` (`cancelPlan`).
 */
import type { StepStatus } from '../record/record.ts';
import type { retryable } from './retry.ts';

/**
 * Whether a step in each status waits on the person: `awaiting approval` at its gate, `blocked` on its question, `exhausted` out of its
 * loop's rounds, `over budget` and `budget exhausted` at its cap. Every status says, so a new one is classed before it compiles.
 */
export const WAITS_ON_PERSON: Record<StepStatus, boolean> = {
  waiting: false,
  running: false,
  blocked: true,
  unsigned: false,
  checking: false,
  verified: false,
  unverified: false,
  'awaiting approval': true,
  exhausted: true,
  'over budget': true,
  'budget exhausted': true,
  denied: false,
  'failed (check)': false,
  failed: false,
  stopped: false,
};

/**
 * Whether a step in each status holds its run until someone acts, the person or Nemia: what waits on the person (`WAITS_ON_PERSON`), and
 * the steps that stopped on what they were asked, `unsigned` without its closeout, `failed (check)` on a check that refused or did not
 * finish, `denied` a call under `denials: fail`; never a step the engine ended on its own (`failed`, `stopped`). Admission does not read
 * it: a try of a stopped step is Nemia's to give unasked. A try or a round the run has due moves such a step on, and its readers read
 * that first.
 */
export const HOLDS_THE_RUN: Record<StepStatus, boolean> = {
  ...WAITS_ON_PERSON,
  unsigned: true,
  denied: true,
  'failed (check)': true,
};

/**
 * What waits on the person in a step's standing (`retryable`'s answer), in words they read, or undefined where nothing does: its status
 * (`WAITS_ON_PERSON`); a try that sends the work back from a gate (`sendsBack`); a session its harness blocked on them
 * (`blockedByHarness`); a try past its cap (`raise`).
 */
export function waitsOnPerson(standing: ReturnType<typeof retryable>): string | undefined {
  if (WAITS_ON_PERSON[standing.status]) return `it is ${standing.status}`;
  if (standing.sendsBack) return 'a try of it sends the work back from a gate';
  if (standing.blockedByHarness) return 'its session waits on you';
  if (standing.raise) return 'a try of it runs past its cap';
  return undefined;
}
