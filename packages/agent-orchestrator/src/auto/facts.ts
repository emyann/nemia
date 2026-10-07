/**
 * The facts a rule is judged on (`Facts`), from what admission reads of a run at the call (`Seen`): pure, so each condition is proven on
 * a fixture state, and carrying nothing between calls. The reads are `nemia admit`'s (`admit.verb.ts`).
 */
import type { Facts } from './auto.ts';

/**
 * What admission read of a run at a call, for the step it answers: the step's closeout, outcome and what it needs of the person, or
 * undefined where it signed none (`closeout`); the questions it asks, each with its recommended answer or null (`questions`); its check's
 * verdict, a number, `unfinished`, or undefined where it has no check (`verdict`); each looping step of the run that signed, whether it
 * asks for another round and whether a person accepted its work as it stands (`loops`); whether any step of the run is at or past the
 * cap in force on it (`overBudget`); what the run has cost, in dollars (`spend`); and whether a step other than this one waits on the
 * person (`othersWaiting`).
 */
export type Seen = {
  closeout: { outcome: 'done' | 'blocked'; needs?: string } | undefined;
  questions: readonly { recommended: string | null }[];
  verdict: number | 'unfinished' | undefined;
  loops: readonly { again: boolean; personAccepted: boolean }[];
  overBudget: boolean;
  spend: number;
  othersWaiting: boolean;
};

/**
 * The facts of `seen`: the agent recommends where its step signed `done` and gave each question it asks a recommended answer; its check
 * passed where its verdict is exit 0, so a step with no check never meets it; every reviewer accepted where no looping step asks for
 * another round and none was accepted by a person over what it found; no step is past its budget; and nothing is left open where the
 * step asks no question and needs nothing of the person, and no other step waits on them. Pure.
 */
export const factsOf = (seen: Seen): Facts => ({
  recommends: seen.closeout?.outcome === 'done' && seen.questions.every((q) => q.recommended !== null),
  checked: seen.verdict === 0,
  accepted: seen.loops.every((l) => !l.again && !l.personAccepted),
  withinBudget: !seen.overBudget,
  nothingOpen: seen.questions.length === 0 && !seen.closeout?.needs?.trim() && !seen.othersWaiting,
  spend: seen.spend,
});
