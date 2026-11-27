/**
 * A card's phase (agent-orchestrator, src/inbox/card-phase.ts, `cardPhase`): where a card stands as a person sorts cards, a simple,
 * high-level summary of its finer `state`, as Kubernetes' Pod `status.phase` is of its containers' states. Seven words, four open and
 * three closed: `notStarted` (filed, nobody started it), `blocked` (started, and held by cards of its `after:` that have not succeeded),
 * `waiting` (it waits on a person: its run waits on one, its queued start was refused, or a card it waits on can only be released by
 * one), `working` (started and at work, or queued for room to run), `done`, `failed` and `cancelled` (its run ended; a run stopped by a
 * person reads `cancelled`). Open exactly when the card is in play. Pure.
 */
import type { CardPhase, CardState } from 'objects';
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * The cards of a card's `after:` that have not succeeded, as its phase reads them: `none`, it waits on none; `held`, it waits on some and
 * none of those waits is stalled; `stalled`, one of them only a person can release (a missing card, a cycle, a card whose run ended
 * without succeeding or whose start was refused: `CardWait`'s `stalled`).
 */
export type CardWaits = 'none' | 'held' | 'stalled';

/** What a card's phase is worked out from: its state, and the waits of its `after:`. */
export type PhaseRead = { readonly state: CardState; readonly waits: CardWaits };

/** Whether `state` says the card's run has ended. */
const ended = (state: CardState) => state === 'succeeded' || state === 'failed' || state === 'stopped' || state === 'cancelled';

/** Whether `phase` is one of the three closed words. */
const closed = (phase: CardPhase) => phase === 'done' || phase === 'failed' || phase === 'cancelled';

const cardPhaseSpec = spec<(read: PhaseRead) => CardPhase>({
  ensures: {
    closedExactlyWhenEnded: {
      description: "A card's phase is closed (done, failed, cancelled) exactly when its run has ended",
      condition: ({ input: [read], output }) => closed(output) === ended(read.state),
    },
    succeededIsDone: {
      description: 'A card whose run succeeded is done',
      condition: ({ input: [read], output }) => read.state !== 'succeeded' || output === 'done',
    },
    failedIsFailed: {
      description: 'A card whose run failed has failed',
      condition: ({ input: [read], output }) => read.state !== 'failed' || output === 'failed',
    },
    stoppedIsCancelled: {
      description: 'A card whose run was stopped or cancelled is cancelled',
      condition: ({ input: [read], output }) => !(read.state === 'stopped' || read.state === 'cancelled') || output === 'cancelled',
    },
    runAtWorkIsWorking: {
      description: 'A card whose run is pending or running is working',
      condition: ({ input: [read], output }) => !(read.state === 'pending' || read.state === 'running') || output === 'working',
    },
    personsTurnIsWaiting: {
      description:
        'A card waits on a person when its run waits on one, when its queued start was refused, or when it is queued and a card it waits on is stalled',
      condition: ({ input: [read], output }) =>
        !(read.state === 'waiting' || read.state === 'refused' || (read.state === 'queued' && read.waits === 'stalled')) ||
        output === 'waiting',
    },
    heldIsBlocked: {
      description: 'A queued card held by cards of its after: that have not succeeded, none stalled, is blocked',
      condition: ({ input: [read], output }) => !(read.state === 'queued' && read.waits === 'held') || output === 'blocked',
    },
    queuedFreeIsWorking: {
      description: 'A queued card that waits on no card is working: it waits only for room to run',
      condition: ({ input: [read], output }) => !(read.state === 'queued' && read.waits === 'none') || output === 'working',
    },
    filedIsNotStarted: {
      description: 'A card filed and not queued is not started, whatever its after: waits on',
      condition: ({ input: [read], output }) => read.state !== 'filed' || output === 'notStarted',
    },
  },
});

/** `cardPhase`'s type, which `src/inbox/card-phase.ts` takes: the phase of the card `read` describes. */
export type CardPhaseOf = Implementation<typeof cardPhaseSpec>;
