/**
 * What waits on the person, from a step's standing: a step at its gate, a step's question to them — signed off, or asked by its session
 * through its harness — a loop out of rounds, a step over its cap (`WAITS_ON_PERSON`, `waitsOnPerson`). Pure: admission asks the person
 * of a try of such a step (`admissionOf`), and lets any other through. What holds a run until someone acts is read off the codes
 * (`holdsTheRun`, `phase.ts`).
 */
import type { StepReason } from '../phase/phase.ts';
import type { retryable } from './retry.ts';

/**
 * Whether a try of a step standing in each reason needs the person's word: `AwaitingApproval` at its gate, `AwaitingAnswer` on its
 * question (signed off blocked, or its session asking through its harness), `AwaitingRound` out of its loop's rounds, `OverBudget` and
 * `BudgetExhausted` at its cap. `Unsigned` and `Denied` wait on a person too, but a try of them is Nemia's to give unasked. Every reason
 * says, so a new one is classed before it compiles.
 */
export const WAITS_ON_PERSON: Record<StepReason, boolean> = {
  Pending: false,
  Waiting: false,
  Running: false,
  Checking: false,
  AwaitingApproval: true,
  AwaitingAnswer: true,
  AwaitingRound: true,
  OverBudget: true,
  BudgetExhausted: true,
  Unsigned: false,
  Denied: false,
  Succeeded: false,
  CheckPassed: false,
  Failed: false,
  CheckFailed: false,
  UnreadableCloseout: false,
  Stopped: false,
  Unknown: false,
};

/**
 * What waits on the person in a step's standing (`retryable`'s answer), in words they read, or undefined where nothing does: its reason
 * (`WAITS_ON_PERSON`), a session asking through its harness said as such; a try that sends the work back from a gate (`sendsBack`); a
 * try past its cap (`raise`).
 */
export function waitsOnPerson(standing: ReturnType<typeof retryable>): string | undefined {
  if (WAITS_ON_PERSON[standing.reason]) return standing.via === 'session' ? 'its session waits on you' : `it is ${standing.status}`;
  if (standing.sendsBack) return 'a try of it sends the work back from a gate';
  if (standing.raise) return 'a try of it runs past its cap';
  return undefined;
}
