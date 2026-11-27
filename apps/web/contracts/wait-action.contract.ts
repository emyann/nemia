/**
 * Which button a waiting card holds beside `Open the run` (apps/web, src/lib/waitAction.ts): `waitActionOf`, from the run's wait on a
 * person (`waitOf`, src/lib/runWords.ts). A run that waits at an approval's gate holds Approve, and one whose step signed off blocked on a
 * person's answer holds Answer; each names its step to a screen reader and on hover, and opens that step's part in a modal that holds
 * the gate or the answer. Every other wait — out of rounds, past budget, a refused call, no sign-off, a check, a hold, an `after` — and a
 * run that waits on nobody keep `Open the run` alone, and their words.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { WaitKind } from '../src/lib/runWords.ts';

/** A run's wait on a person as the card reads it: its kind, and the step that waits, null for a wait of the run's own. */
export type CardWait = { kind: WaitKind; step: string | null };

/** What a waiting card's button does: approve a step at its gate, or answer a step that waits on a person's answer. */
export type WaitVerb = 'approve' | 'answer';

/** A waiting card's button: what it does, and the step it does it to. */
export type WaitAction = { verb: WaitVerb; step: string };

const waitActionSpec = spec<(wait: CardWait | null) => WaitAction | null>({
  ensures: {
    approvesTheGatedStep: {
      description: "A run that waits at an approval's gate holds Approve, naming the gated step",
      condition: ({ input: [wait], output }) =>
        !(wait !== null && wait.kind === 'approve' && wait.step !== null) ||
        (output !== null && output.verb === 'approve' && output.step === wait.step),
    },
    answersTheBlockedStep: {
      description: "A run whose step waits on a person's answer holds Answer, naming that step",
      condition: ({ input: [wait], output }) =>
        !(wait !== null && wait.kind === 'answer' && wait.step !== null) ||
        (output !== null && output.verb === 'answer' && output.step === wait.step),
    },
    noButtonForAnyOtherWait: {
      description:
        'A run that waits on nobody, or on a person for anything but an approval or an answer, holds no button: its card keeps Open the run alone',
      condition: ({ input: [wait], output }) => !(wait === null || (wait.kind !== 'approve' && wait.kind !== 'answer')) || output === null,
    },
    noButtonForAWaitOfNoStep: {
      description: 'A wait that names no step holds no button: there is no step to approve or answer',
      condition: ({ input: [wait], output }) => !(wait !== null && wait.step === null) || output === null,
    },
  },
});
export type WaitActionOf = Implementation<typeof waitActionSpec>;
