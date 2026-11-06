/**
 * The facts a rule is judged on (`Facts`), from what admission reads of a run at the call (`Seen`): pure, so each condition is proven on
 * a fixture state, and carrying nothing between calls. The reads are `nemia admit`'s (`admit.verb.ts`).
 */
import type { Facts } from './auto.ts';
import type { Outcome } from 'objects';

/**
 * What admission read of a run at a call, for the step it answers: the step's closeout, outcome and what it needs of the person, or
 * undefined where it signed none (`closeout`); the questions it asks, each with what it recommended (`recommended`, as `Question` holds
 * it); its check's
 * verdict, a number, `unfinished`, or undefined where it has no check (`verdict`); each looping step of the run that signed, whether it
 * asks for another round and whether a person accepted its work as it stands (`loops`); whether any step of the run is at or past the
 * cap in force on it (`overBudget`); whether the budgets the step proposes for the steps after it hold a cap above a step's own
 * `budget:` (`aboveCeiling`, `aboveTheWorkflow`); what the run has cost, in dollars (`spend`); and whether a step other than this one waits
 * on the person (`othersWaiting`).
 */
export type Seen = {
  closeout: { outcome: Outcome; needs?: string } | undefined;
  questions: readonly { recommended: string | readonly string[] | null }[];
  verdict: number | 'unfinished' | undefined;
  loops: readonly { again: boolean; personAccepted: boolean }[];
  overBudget: boolean;
  aboveCeiling: boolean;
  spend: number;
  othersWaiting: boolean;
};

/**
 * The facts of `seen`: its agent recommends it where its step signed `done` and gave each question it asks a recommended answer, a list
 * of none being none; its check passed where its verdict is exit 0, so a step with no check never meets it; its review passed where no
 * looping step asks for another round and none was accepted by a person over what it found; it stayed within budget where no step is
 * past its budget and the step proposes no cap above a step's own budget, which a person sees at the gate and never has applied
 * unasked; and nothing waits on you where the step asks no question and needs nothing of the person, and no other step waits on them.
 * Pure.
 */
export const factsOf = (seen: Seen): Facts => ({
  recommends: seen.closeout?.outcome === 'done' && seen.questions.every((q) => q.recommended !== null && q.recommended.length > 0),
  checked: seen.verdict === 0,
  accepted: seen.loops.every((l) => !l.again && !l.personAccepted),
  withinBudget: !seen.overBudget && !seen.aboveCeiling,
  nothingOpen: seen.questions.length === 0 && !seen.closeout?.needs?.trim() && !seen.othersWaiting,
  spend: seen.spend,
});
