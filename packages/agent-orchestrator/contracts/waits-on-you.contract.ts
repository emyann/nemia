/**
 * The one decider of whether a run waits on a person, and the list's state built on it (agent-orchestrator, src/phase/phase.ts and
 * src/run-state/run-state.ts): `asksOfAPerson`, whether anything of the run is a person's to answer; `waitsOnYou`, whether that is the
 * person's own move — something is asked and nobody has the run in hand (`assignee`); and `kindOf`, the state the board's list, `nemia
 * ls` and the bell read. An ask someone has in hand leaves "waiting on you" and is listed in flight; it is still asked, and anyone who could
 * answer it still can.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { RunState } from 'objects';

/**
 * What a run says of who it waits on: when it was called off, the steps a person has to act on (`waitingOnYou`), whether a run its roots
 * wait on never lands without a person (`waiting`), whether a hold on it only a person ends (`holding`), and who has it in hand
 * (`assignee`), null where nobody does or the assignee no longer stands (`assigneeStanding`, assignee.contract.ts).
 */
export type WaitFacts = {
  readonly cancelledAt: string | null | undefined;
  readonly waitingOnYou: readonly string[];
  readonly waiting: { readonly waitingOnYou: boolean } | null;
  readonly holding: { readonly waitingOnYou: boolean } | null;
  readonly assignee: { readonly at: string } | null;
};

/** What the list's state reads of a run besides its waits: the status `assess` says, and whether anything of it moves. */
export type StateFacts = WaitFacts & { readonly status: string; readonly moving: boolean };

/** Something of the run is a person's to answer, whoever has it in hand: a step, a run waited on that never lands, a hold. */
const asks = (run: WaitFacts) =>
  !run.cancelledAt &&
  (run.waitingOnYou.length > 0 || run.waiting?.waitingOnYou === true || run.holding?.waitingOnYou === true);

/** The run's ask is the person's own move: asked, and nobody has the run in hand. */
const yours = (run: WaitFacts) => asks(run) && run.assignee === null;

const asksOfAPersonSpec = spec<(run: WaitFacts) => boolean>({
  ensures: {
    asksExactlyWhenSomethingIsAPersonsToAnswer: {
      description:
        'A run asks of a person exactly when nobody called it off and a step of it waits on one, a run it waits on never lands without one, or a hold on it only a person ends',
      condition: ({ input: [run], output }) => output === asks(run),
    },
  },
});
export type AsksOfAPerson = Implementation<typeof asksOfAPersonSpec>;

const waitsOnYouSpec = spec<(run: WaitFacts) => boolean>({
  ensures: {
    anAssignedRunNeverWaitsOnYou: {
      description: 'A run someone has in hand never waits on you, whatever it asks',
      condition: ({ input: [run], output }) => run.assignee === null || output === false,
    },
    yoursExactlyWhenAskedAndNobodyHasIt: {
      description: 'A run waits on you exactly when it asks something of a person and nobody has it in hand',
      condition: ({ input: [run], output }) => output === yours(run),
    },
  },
});
export type WaitsOnYou = Implementation<typeof waitsOnYouSpec>;

const kindOfSpec = spec<(run: StateFacts) => RunState>({
  ensures: {
    waitingExactlyWhenItWaitsOnYou: {
      description: 'A run is listed waiting exactly when it waits on you',
      condition: ({ input: [run], output }) => (output === 'waiting') === yours(run),
    },
    anAskInHandIsInFlight: {
      description: 'A run that asks something someone has in hand is listed in flight, never waiting nor finished',
      condition: ({ input: [run], output }) => !asks(run) || run.assignee === null || output === 'inFlight',
    },
    whatMovesIsNeverFinished: {
      description: 'A run something of which moves is never listed finished',
      condition: ({ input: [run], output }) => !run.moving || output !== 'finished',
    },
    finishedOnlyWhenNothingAsksOrMoves: {
      description: 'A run is listed finished only when it asks nothing of a person and nothing of it moves',
      condition: ({ input: [run], output }) => output !== 'finished' || (!asks(run) && !run.moving),
    },
    whatNeitherAsksMovesNorRunsIsFinished: {
      description: 'A run that asks nothing of a person, of which nothing moves, and that is not running is listed finished',
      condition: ({ input: [run], output }) => asks(run) || run.moving || run.status === 'running' || output === 'finished',
    },
    aRunningRunCalledOffIsInFlightUntilItsWaitNeedsAPerson: {
      description:
        'A running run called off, nothing of which moves, is listed in flight while neither a run it waits on nor its hold needs a person, and finished once one does: a called-off run asks nothing, so such a wait never lands',
      condition: ({ input: [run], output }) =>
        run.status !== 'running' ||
        !run.cancelledAt ||
        run.moving ||
        output === (run.waiting?.waitingOnYou === true || run.holding?.waitingOnYou === true ? 'finished' : 'inFlight'),
    },
    aRunningRunThatAsksNothingIsInFlight: {
      description: 'A running run nobody called off that asks nothing of a person is listed in flight',
      condition: ({ input: [run], output }) => run.status !== 'running' || Boolean(run.cancelledAt) || asks(run) || output === 'inFlight',
    },
  },
});
export type KindOf = Implementation<typeof kindOfSpec>;
