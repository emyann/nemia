import type { Outcome as SignedOff } from 'objects';
import type { StepTry } from './api/tries.ts';
import type { AttemptEnd } from './api/tries.ts';
import type { Frozen } from './frozen.ts';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** A field's `description` in its schema, when it has one: what a yes or a no means. */
export const descriptionOf = (schema: unknown): string | null =>
  isRecord(schema) && typeof schema.description === 'string' ? schema.description : null;

/**
 * Who said how a try ended, and what: the agent, in its statement, or in one that could not be read; the machine, in the reason its
 * attempt ended without one; or nobody yet — still running, or not filed — in the words the inspector has for that.
 */
export type Outcome =
  | { by: 'agent'; outcome: SignedOff; cut: string | null }
  | { by: 'machine'; reason: string; words: string }
  | { by: 'unreadable'; words: string }
  | { by: 'nobody'; words: string };

/**
 * The machine's reason an attempt has no statement, in a sentence each, off the engine's `EndReason` (agent-runtime) — but for
 * `unsigned`, the orchestrator's end word (`endWords`), no longer one of the engine's: an end without the statement its task asked for.
 * `harness` is not here: a harness's own end is a reason only when it said `failed` or `stopped` (`outcomeOf`).
 */
export const MACHINE_WORDS: Readonly<Partial<Record<AttemptEnd, string>>> = {
  unsigned: 'The session ended without the closing statement it was asked for. It may have finished; it did not say so.',
  lost: 'The session was lost: it vanished, or its worker stopped beating, before it said how it went.',
  unstartable: 'The session never started: its harness vouched that nothing ran.',
  budget: 'Its harness cut the session off at the spend cap its task gave it, before it said how it went.',
  operator: 'A person stopped it before it said how it went.',
  deadline: 'It ran past its deadline, and was stopped before it said how it went.',
};

/** What is said after an agent's statement when its attempt was cut anyway: it spoke, and then the machine ended it. */
const CUT_WORDS: Readonly<Partial<Record<AttemptEnd, string>>> = {
  operator: 'then a person stopped it',
  deadline: 'then it ran past its deadline and was stopped',
  budget: 'then its harness cut it off at its spend cap',
};

/**
 * How a try ended and who said so. `none` is what the inspector says of a try with no statement and no reason on the record, and of any
 * reason `MACHINE_WORDS` does not name but a harness's `failed` or `stopped`: the orchestrator reports a harness's `done` with no statement
 * as `unsigned` (`endWords`).
 */
export function outcomeOf(t: Frozen<Pick<StepTry, 'closeout' | 'unreadable' | 'attempts'>>, none: string): Outcome {
  const latest = t.attempts.latest;
  if (t.closeout) return { by: 'agent', outcome: t.closeout.outcome, cut: (latest?.reason && CUT_WORDS[latest.reason]) || null };
  if (t.unreadable)
    return {
      by: 'unreadable',
      words: `It gave a closing statement that could not be read (${t.unreadable.error}). Here it is as it came.`,
    };
  if (!latest?.ended || !latest.reason) return { by: 'nobody', words: none };
  const words = MACHINE_WORDS[latest.reason];
  if (words) return { by: 'machine', reason: latest.reason, words };
  if (latest.reason === 'harness' && (latest.ended === 'failed' || latest.ended === 'stopped')) {
    return {
      by: 'machine',
      reason: latest.ended,
      words: `Its harness ended the session ${latest.ended}, and it said nothing of how it went.`,
    };
  }
  return { by: 'nobody', words: none };
}

/**
 * An outcome in the word a fold's summary and the head's badge give it: `done`, `blocked`, `unreadable`, the machine's reason, or
 * `no closeout`.
 */
export const outcomeWord = (o: Outcome): string =>
  o.by === 'agent' ? o.outcome : o.by === 'machine' ? o.reason : o.by === 'unreadable' ? 'unreadable' : 'no closeout';
