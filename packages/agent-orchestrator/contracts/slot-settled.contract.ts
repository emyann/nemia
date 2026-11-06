/**
 * Whether the cap on runs in flight may leave a run out of its count without judging it again (agent-orchestrator, src/cap/cap.ts,
 * `slotSettled`): the board's ceilings read (`slotsRead`) is handed, for each run, the judgement the app's informer serves of it — none
 * where the informer judges it again (`informedOf`) — and a run whose served judgement says it ended and nothing of it moves takes no
 * run slot and waits for none, so it is neither in flight nor held (`slotNeed`). Every other run is judged as a pass judges it. A cache
 * of a pure function: under `WF_VERIFY_REST=1` the read hands no judgement, so every run is judged afresh.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { RunStatusWord } from 'objects';

/** What the cap reads of a run's judgement as the informer serves it: the run in one word, and whether anything of it moves or is due. */
export type SlotKept = {
  /** The run in one word (`assess`'s status). */
  readonly status: RunStatusWord;
  /** Something of it is in flight, or something a tick would still file (`Judged.moving`). */
  readonly moving: boolean;
};

/** The words of a run that ended: it succeeded, a step of it broke, or a person called it off. */
const ended = (status: RunStatusWord): boolean => status === 'succeeded' || status === 'failed' || status === 'cancelled';

const slotSettledSpec = spec<(kept: SlotKept | undefined) => boolean>({
  ensures: {
    unservedJudged: {
      description: 'A run the informer serves no judgement of is judged, as a pass judges it',
      condition: ({ input: [kept], output }) => kept !== undefined || output === false,
    },
    movingJudged: {
      description: 'A run something of which is in flight or due is judged: it may hold a run slot',
      condition: ({ input: [kept], output }) => kept === undefined || !kept.moving || output === false,
    },
    openJudged: {
      description: 'A run still running, or stopped on a person, is judged: a word or a lift sends it on',
      condition: ({ input: [kept], output }) => kept === undefined || ended(kept.status) || output === false,
    },
    endedAtRestSettled: {
      description: 'A run whose served judgement says it ended and nothing of it moves is left out of the count unjudged',
      condition: ({ input: [kept], output }) => kept === undefined || kept.moving || !ended(kept.status) || output === true,
    },
  },
});

export type SlotSettled = Implementation<typeof slotSettledSpec>;
