/**
 * Which step a waiting card's approval button names (apps/web, src/lib/waitAction.ts): `approveStepOf`, from the run's wait on a person
 * (`waitOf`, src/lib/runWords.ts). A run that waits at an approval's gate shows `Approve <step>` beside `Open the run`, and the button
 * opens that step's part in a modal that ends in Approve and Send back; every other wait — a question, out of rounds, past budget, a
 * hold, a check — and a run that waits on nobody keep `Open the run` alone.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { WaitKind } from '../src/lib/runWords.ts';

/** A run's wait on a person as the card reads it: its kind, and the step that waits, null for a wait of the run's own. */
export type CardWait = { kind: WaitKind; step: string | null };

const approveStepSpec = spec<(wait: CardWait | null) => string | null>({
  ensures: {
    namesTheGatedStepAtAnApproval: {
      description: "A run that waits at an approval's gate names the gated step, the one its button approves",
      condition: ({ input: [wait], output }) => !(wait !== null && wait.kind === 'approve' && wait.step !== null) || output === wait.step,
    },
    noButtonWithoutAnApproval: {
      description:
        'A run that waits on nobody, or on a person for anything but an approval, names no step: its card keeps Open the run alone',
      condition: ({ input: [wait], output }) => !(wait === null || wait.kind !== 'approve') || output === null,
    },
    noButtonForAnApprovalOfNoStep: {
      description: 'An approval that names no step names none: there is no gate to approve',
      condition: ({ input: [wait], output }) => !(wait !== null && wait.step === null) || output === null,
    },
  },
});
export type ApproveStepOf = Implementation<typeof approveStepSpec>;
