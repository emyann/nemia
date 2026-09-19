/**
 * A judgment, and the `if` with judgment in it.
 *
 * Plain code, no Effect. `decide` is pure: the policy — the thresholds — lives in the caller's code, and changing it
 * re-asks nothing. A judgment that did not come back whole is `unsure`, whatever the reason; `why` says which reason.
 */
import type { NoulQuestion, Question, ResultFor, ScoreQuestion } from '@typesafe-ai/sdk';
import { refuse } from './key.ts';

/**
 * Why there is no answer. Every kind but the last two is a fact on the record, written once:
 * - `no-key`: no `TYPESAFE_API_KEY` in the environment; no request was made.
 * - `refused`: the service read the request and said no (400, 401, 403, 404, 422). Asking again changes nothing.
 * - `rate-limited`: 429 or 529, after the SDK's own retries.
 * - `timed-out`: no whole answer inside the deadline.
 * - `unreachable`: a connection that failed, or a 5xx, after the SDK's own retries.
 * - `malformed`: an answer came and is not one: kept raw on the record, read as this.
 * - `wrong-model`: an answer came from a model other than the pinned one.
 * These two are read, never written:
 * - `interrupted`: a claim whose asker never wrote what came of it, past its deadline: a crash.
 * - `in-flight`: a claim still inside its deadline, read by a replay, which never waits.
 */
export type FailureKind =
  | 'no-key' | 'refused' | 'rate-limited' | 'timed-out' | 'unreachable' | 'malformed' | 'wrong-model'
  | 'interrupted' | 'in-flight';

export const FAILURE_KINDS: readonly FailureKind[] = [
  'no-key', 'refused', 'rate-limited', 'timed-out', 'unreachable', 'malformed', 'wrong-model', 'interrupted', 'in-flight',
];

export type Answered<Q extends Question = Question> = {
  readonly status: 'answered';
  readonly answer: ResultFor<Q>;
  readonly key: string;
  /** When it was answered: the first time, and every time it is read after. */
  readonly at: string;
  readonly model: string;
};

export type Failed = {
  readonly status: 'failed';
  readonly kind: FailureKind;
  readonly message: string;
  readonly key: string;
  readonly at: string;
};

export type Judgment<Q extends Question = Question> = Answered<Q> | Failed;

export type Verdict = 'yes' | 'no' | 'unsure';

/** At or above `yes` is yes, at or below `no` is no, between them is unsure. */
export type Thresholds = { readonly yes: number; readonly no: number };

/** The number a verdict is read from: P(yes) for a noul, the expected level for a score. */
const valueOf = (j: Answered): number | undefined => {
  const a = j.answer as { type?: string; noul?: number; score?: number };
  return a.type === 'noul' ? a.noul : a.type === 'score' ? a.score : undefined;
};

/**
 * Three branches, and the caller's `switch` must handle `unsure`. A failure of any kind is `unsure`.
 * A choice has no threshold: read `answer.choice` and `answer.confidence`.
 */
export function decide(j: Judgment<NoulQuestion> | Judgment<ScoreQuestion> | Judgment, t: Thresholds): Verdict {
  if (!(Number.isFinite(t?.yes) && Number.isFinite(t?.no)) || t.yes <= t.no) {
    refuse(`judge: decide takes { yes, no } with yes above no; ${JSON.stringify(t)} is not.`);
  }
  if (j.status === 'failed') return 'unsure';
  const v = valueOf(j);
  if (v === undefined) return refuse(`judge: decide reads a noul or a score; a ${j.answer.type} has no threshold. Read its \`choice\`.`);
  if (j.answer.type === 'noul' && (t.yes > 1 || t.no < 0)) refuse(`judge: a noul's thresholds are probabilities, 0 to 1; ${JSON.stringify(t)} is not.`);
  return v >= t.yes ? 'yes' : v <= t.no ? 'no' : 'unsure';
}

/** In a few words, what the judgment is: its failure, or its number. */
export const why = (j: Judgment): string => {
  if (j.status === 'failed') return `${j.kind}: ${j.message}`;
  const v = valueOf(j);
  if (j.answer.type === 'choice') {
    const c = j.answer as ResultFor<Question> & { choice: string; confidence: number };
    return `chose ${c.choice}, confidence ${c.confidence.toFixed(2)}`;
  }
  return j.answer.type === 'noul' ? `P ${v!.toFixed(2)}` : `score ${v!.toFixed(2)}`;
};
