/**
 * Which of the run's page's own parts her chat draws for a step she brought (apps/web, src/lib/brought.ts, `broughtPart`): a step of a
 * run her message links to (`/runs/<run>?step=<step>`), drawn under her words as the run's page answers it, read as the step is now.
 *
 * The facts are the board's own reads of the run, each the one the run's page already makes: whether the run has the step, whether it
 * waits at its gate on the person (`gateOfStep`, the inspector's `GateBrief`), why the run's page offers it an answer (`offersOf`'s
 * case, a row of the Decide section or the banner's Continue), and whether a try of it is asked already (`askedOf`). The part is the
 * one the run's page draws for that state, so the chat never offers an answer the run's page does not, and a step answered elsewhere
 * reads as answered.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { OfferCase } from '../src/lib/asks.ts';

/** What the chat reads of a step she brought, each fact the run's page's own read of it. */
export type BroughtFacts = {
  /** Whether the run has a step of that name. */
  readonly found: boolean;
  /** Whether the step waits at its gate on the person (`gateOfStep` gives a gate). */
  readonly atGate: boolean;
  /** Why the run's page offers the step an answer (`offersOf`'s case for it), null where it offers none. */
  readonly offer: OfferCase | null;
  /** Whether a try of the step is asked already, which the tick files (`askedOf`). */
  readonly asked: boolean;
};

/**
 * The part drawn: `missing`, the run has no such step; `gate`, the inspector's gate (`GateBrief`); `answer`, the Decide section's row for
 * the step's offer; `continue`, the banner's Continue for a session the harness blocked; `asked`, the note of a try asked already
 * (`AskedRow`); `settled`, the step's state and note, nothing to answer.
 */
export type BroughtPart = 'missing' | 'gate' | 'answer' | 'continue' | 'asked' | 'settled';

/** Whether `part` is a form that answers the step. */
const answers = (part: BroughtPart): boolean => part === 'gate' || part === 'answer' || part === 'continue';

const broughtPartSpec = spec<(facts: BroughtFacts) => BroughtPart>({
  ensures: {
    missingExactlyWithoutTheStep: {
      description: 'A step the run does not have is said missing, and only such a step',
      condition: ({ input: [facts], output }) => (output === 'missing') === !facts.found,
    },
    noFormWithoutAWait: {
      description: 'A form that answers is drawn only for a step the run’s page answers: at its gate, or offered an answer',
      condition: ({ input: [facts], output }) => !answers(output) || (facts.found && (facts.atGate || facts.offer !== null)),
    },
    gateAnswersItsGate: {
      description: 'A step waiting at its gate on the person is answered by its gate, as the inspector answers it',
      condition: ({ input: [facts], output }) => !(facts.found && facts.atGate) || output === 'gate',
    },
    continueForABlockedSession: {
      description: 'A session the harness blocked, at no gate, is answered by the banner’s Continue',
      condition: ({ input: [facts], output }) => !(facts.found && !facts.atGate && facts.offer === 'continue') || output === 'continue',
    },
    answerWhereThePageOffers: {
      description: 'A step at no gate that the Decide section offers an answer is answered by that row',
      condition: ({ input: [facts], output }) =>
        !(facts.found && !facts.atGate && facts.offer !== null && facts.offer !== 'continue') || output === 'answer',
    },
    askedSaysTheTry: {
      description: 'A step whose next try is asked already, and that nothing else is offered for, says that try and offers nothing',
      condition: ({ input: [facts], output }) => !(facts.found && !facts.atGate && facts.offer === null && facts.asked) || output === 'asked',
    },
    settledWaitsOnNobody: {
      description: 'A step that waits on nobody, answered elsewhere or never waiting, says its state and offers nothing',
      condition: ({ input: [facts], output }) =>
        !(facts.found && !facts.atGate && facts.offer === null && !facts.asked) || output === 'settled',
    },
  },
});
export type BroughtPartOf = Implementation<typeof broughtPartSpec>;
