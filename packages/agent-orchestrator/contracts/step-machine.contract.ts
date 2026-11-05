/**
 * A step's lifecycle in a run, as a machine (agent-orchestrator, src/step-machine/step-machine.ts): whether a step reading `from` on one
 * pass and `to` on the next made a move the machine draws (`stepMove`). `ownStatus` and `standing` (status.ts) work the word out
 * afresh on every pass, from facts, and keep doing so: the machine decides nothing a pass does. It is the drawing of what they may
 * do, held to them by a replay of their scenarios (`step-machine.test.ts`), whose every consecutive pair of words must be a move
 * this answers `edge` or `stays`.
 *
 * The laws say what a step's words mean, not the table: a step in flight is never unfiled, nothing is satisfied before it ran,
 * and a step judged by a check never reads as one with none.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { StepStatus } from '../src/record/record.ts';
import type { StepTransition } from '../src/step-machine/step-machine.ts';

/** The words only a step judged by a check reads: `verified` needs a passed check, and `checking` and `failed (check)` one filed. */
const CHECKED: ReadonlySet<StepStatus> = new Set<StepStatus>(['checking', 'verified', 'failed (check)']);

const stepMoveSpec = spec<(from: StepStatus, to: StepStatus) => StepTransition>({
  /**
   * Which move between two different words is drawn and which refused is the table's, held to `stepStatus` by the replay
   * (`step-machine.test.ts`), not a law: the laws say only the moves no table may draw.
   */
  open: ['output.kind'],
  ensures: {
    stayingIsNoMove: {
      description: 'A step that reads the same word on two passes made no move, and two different words are always a move',
      condition: ({ input: [from, to], output }) => (from === to) === (output.kind === 'stays'),
    },
    nothingInFlightIsUnfiled: {
      description:
        'A step in flight — its session running, its check or its landing pending — is never unfiled: a filed step reads pending again only once it stopped or signed off, where a round, a send-back or an ending’s gate leaves it',
      condition: ({ input: [from, to], output }) =>
        (from !== 'running' && from !== 'checking') || to !== 'pending' || output.kind === 'refused',
    },
    satisfiedOnlyAfterItRan: {
      description: 'A step not yet filed is never verified or unverified on the next pass: it is satisfied by work it did',
      condition: ({ input: [from, to], output }) =>
        from !== 'pending' || (to !== 'verified' && to !== 'unverified') || output.kind === 'refused',
    },
    aCheckedStepNeverReadsUnchecked: {
      description:
        'A step judged by a check never reads unverified, nor one with no check verified, checking or failed (check): its check is frozen with it',
      condition: ({ input: [from, to], output }) =>
        !((CHECKED.has(from) && to === 'unverified') || (from === 'unverified' && CHECKED.has(to))) || output.kind === 'refused',
    },
    anEdgeNamesItsEvent: {
      description: 'A move the machine draws says what made it',
      condition: ({ output }) => output.kind !== 'edge' || output.event.trim() !== '',
    },
  },
});

/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type StepMove = Implementation<typeof stepMoveSpec>;
