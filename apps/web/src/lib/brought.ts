/**
 * A step of a run her message links to (`/runs/<run>?step=<step>`), as her chat draws it under her words: the facts the run's page reads
 * of it (`broughtFacts`) and which of the run's page's own parts answers it (`broughtPart`, proved by `contracts/brought.contract.ts`).
 * Pure: the drawing is `components/nemia/chat/ChatBrought.tsx`.
 */
import type { BroughtFacts, BroughtPart, BroughtPartOf } from '../../contracts/brought.contract.ts';
import { askedOf, offersOf } from './asks.ts';
import { gateOfStep } from './gate.ts';
import type { RunView } from './runView';

export type { BroughtFacts, BroughtPart } from '../../contracts/brought.contract.ts';

/**
 * The part the chat draws for a step with the facts `facts`, the one the run's page draws for that state: missing where the run has no
 * such step; its gate where it waits at one on the person, as the inspector draws it before anything else; the banner's Continue for a
 * session the harness blocked; the Decide section's row where it offers one; the note of a try asked already; else its state alone.
 */
export const broughtPart: BroughtPartOf = (facts: BroughtFacts): BroughtPart => {
  if (!facts.found) return 'missing';
  if (facts.atGate) return 'gate';
  if (facts.offer === 'continue') return 'continue';
  if (facts.offer !== null) return 'answer';
  return facts.asked ? 'asked' : 'settled';
};

/** What the run's page reads of the step `step` of `run`, each fact its own read: `gateOfStep`, `offersOf`'s case for it, `askedOf`. */
export function broughtFacts(run: RunView, step: string): BroughtFacts {
  const found = run.steps.find((s) => s.name === step);
  if (!found) return { found: false, atGate: false, offer: null, asked: false };
  return {
    found: true,
    atGate: gateOfStep(run, found) !== null,
    offer: offersOf(run).find((offer) => offer.step === step)?.case ?? null,
    asked: askedOf(run, step) !== null,
  };
}
