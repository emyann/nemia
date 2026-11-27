/**
 * Where a wait on a run stands (agent-orchestrator, src/wait/wait.ts, `waitStanding`): what `--after`, `nemia hold --until` and a card's
 * `after:` read of the run they wait on, on every pass, carried nowhere. A wait is released once that run has succeeded, as `nemia ls`
 * says its status, or once a person released its waiters by hand (`nemia release <run>`); never by git, whose branches it does not read.
 *
 * A run that has not succeeded and that nobody released either waits on a person, when nothing the tick does makes it succeed — the store
 * has no such run, it was called off, or it failed — or waits on the run itself: still at work, at a gate, asking its own person, or its
 * workflow not read on this pass.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { RunStatusWord } from 'objects';

/**
 * A run another waits on, as the wait reads it: whether the store has it (`known`); its status as `nemia ls` says it (`status`), null
 * where its workflow did not load on this pass; and whether a person released its waiters by hand (`released`, `nemia release`).
 */
export type WaitedRunRead = { readonly known: boolean; readonly status: RunStatusWord | null; readonly released: boolean };

/**
 * Where a wait on that run stands: `released`, by its success or by a person's hand; `waiting` on the run itself, at the status it is
 * in, or `unread` where its workflow did not load; or `yours`, a run that never succeeds without a person — missing, failed or cancelled.
 */
export type WaitStanding =
  | { readonly kind: 'released'; readonly by: 'succeeded' | 'hand' }
  | { readonly kind: 'waiting'; readonly on: 'running' | 'awaiting approval' | 'waiting' | 'unread' }
  | { readonly kind: 'yours'; readonly why: 'missing' | 'failed' | 'cancelled' };

/** A known run whose waiters nobody released. */
const unreleased = (run: WaitedRunRead) => run.known && !run.released;

/** A status from which the tick never makes the run succeed on its own. */
const endedUnsucceeded = (status: RunStatusWord | null) => status === 'failed' || status === 'cancelled';

const waitStandingSpec = spec<(run: WaitedRunRead) => WaitStanding>({
  ensures: {
    aRunTheStoreLacksIsYours: {
      description: 'A wait on a run the store does not have is yours, as missing: no pass will ever find it',
      condition: ({ input: [run], output }) => run.known || (output.kind === 'yours' && output.why === 'missing'),
    },
    successReleases: {
      description: 'A wait on a run that has succeeded is released by its success, whatever git says of its branches',
      condition: ({ input: [run], output }) =>
        !(run.known && run.status === 'succeeded') || (output.kind === 'released' && output.by === 'succeeded'),
    },
    aPersonReleases: {
      description: 'A wait on a run whose waiters a person released, and that has not succeeded, is released by hand',
      condition: ({ input: [run], output }) =>
        !(run.known && run.released && run.status !== 'succeeded') || (output.kind === 'released' && output.by === 'hand'),
    },
    releasedOnlyBySuccessOrHand: {
      description: 'A wait is released only on a known run that has succeeded, or whose waiters a person released',
      condition: ({ input: [run], output }) => output.kind !== 'released' || (run.known && (run.status === 'succeeded' || run.released)),
    },
    aFailedOrCancelledRunIsYours: {
      description: 'A wait on a run that failed or was called off, and that nobody released, is yours, saying which',
      condition: ({ input: [run], output }) =>
        !(unreleased(run) && endedUnsucceeded(run.status)) || (output.kind === 'yours' && output.why === run.status),
    },
    otherwiseItWaitsOnTheRun: {
      description:
        'A wait on a run still at work, at a gate, asking its own person, or not read, that nobody released, waits on that run as it stands',
      condition: ({ input: [run], output }) =>
        !(unreleased(run) && run.status !== 'succeeded' && !endedUnsucceeded(run.status)) ||
        (output.kind === 'waiting' && output.on === (run.status ?? 'unread')),
    },
  },
});

/** `waitStanding`'s type, which src/wait/wait.ts takes: where a wait on one run stands. */
export type WaitStandingOf = Implementation<typeof waitStandingSpec>;
