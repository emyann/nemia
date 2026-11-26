/**
 * Who has a run in hand (agent-orchestrator, src/assignee/assignee.ts): `assignStop`, what of the run itself refuses an assignee (`nemia
 * assign`), and `assigneeStanding`, whether an assignee that was put still stands, has run out, or ended with its run. An assignee is
 * a tracker's assignee and a Kubernetes Lease's holder at once: everything the run asks of a person is theirs to answer until they give it
 * back (`nemia assign <run> --off`), the run is over, or an ask goes unanswered past the assignee's time (`forMs`, an hour unless another
 * is given), as a Lease its holder did not renew is lost. Nothing is refused because of it: it only says who answers.
 *
 * Both are judged from the record, the run's waits and the clock on each pass and each read (level-triggered): the tick ends an assignee
 * `assigneeStanding` says is no longer `stands`, and the run's judgement serves none for it, so a read never waits on the tick.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * What of a run an assignee is judged from, read before anything is written (`assign`, src/assignee/assignee.verb.ts). `cancelled`,
 * `pruned`: the run was cancelled, or pruned (`Run.cancelledAt`, `Run.pruned`). `inPlay`: the run's phase is still in play
 * (`RUN_PHASE_IN_PLAY`, phase/phase.ts): it has not succeeded, failed, stopped or been cancelled. `assigned`: an assignee already stands
 * on it (`Run.assignee`, as `assigneeStanding` reads it now).
 */
export type AssignPut = { cancelled: boolean; pruned: boolean; inPlay: boolean; assigned: boolean };

/** What of the run refuses an assignee, in the order the refusal says it: the first that is so is the one said. */
export type AssignStop = 'cancelled' | 'pruned' | 'over' | 'assigned';

/** Nothing of the run stops an assignee: it is neither cancelled, pruned, over, nor in someone's hands already. */
const open = (p: AssignPut) => !p.cancelled && !p.pruned && p.inPlay && !p.assigned;

const assignStopSpec = spec<(p: AssignPut) => AssignStop | null>({
  ensures: {
    takenExactlyWhenNothingOfTheRunStopsIt: {
      description:
        'A run is assigned exactly when it is neither cancelled, pruned nor over, and nobody has it in hand already, whether or not it asks anything yet',
      condition: ({ input: [p], output }) => (output === null) === open(p),
    },
    cancelledIsSaidFirst: {
      description: 'A cancelled run is refused as cancelled, whatever else is so of it',
      condition: ({ input: [p], output }) => !p.cancelled || output === 'cancelled',
    },
    prunedIsSaidNext: {
      description: 'A pruned run nobody cancelled is refused as pruned',
      condition: ({ input: [p], output }) => p.cancelled || !p.pruned || output === 'pruned',
    },
    overIsSaidNext: {
      description: 'A run over, neither cancelled nor pruned, is refused as over: nothing of it will be asked again',
      condition: ({ input: [p], output }) => p.cancelled || p.pruned || p.inPlay || output === 'over',
    },
    oneAssigneeAtATime: {
      description: 'A run still in play that someone already has in hand is refused as assigned: one assignee at a time',
      condition: ({ input: [p], output }) => p.cancelled || p.pruned || !p.inPlay || !p.assigned || output === 'assigned',
    },
  },
});
export type AssignStopOf = Implementation<typeof assignStopSpec>;

/** The latest instant a JavaScript date holds, in epoch milliseconds: every instant below is one of the record's or the clock's. */
const LAST_INSTANT = 8_640_000_000_000_000;

/** The longest an assignee's time may be, in milliseconds: 23 hours, the bound `--for` shares with a pause's `--timeout`. */
const MAX_FOR_MS = 23 * 3_600_000;

/** An instant the record or the clock can say, in whole epoch milliseconds. */
const instant = (ms: number) => Number.isSafeInteger(ms) && ms >= 0 && ms <= LAST_INSTANT;

/**
 * What an assignee's standing is judged from, every instant in epoch milliseconds. `at`: when the run was assigned. `forMs`: how long an
 * ask may go unanswered before the assignee is lost (`--for`, an hour unless another was given). `asksSince`: when the run's present ask
 * of a person began — the earliest open wait on a person, as `waitingSinceOf` dates it (timeline/clock.ts), or `at` where the record dates
 * none of what asks — and null while the run asks nothing of a person (`asksOfAPerson`, waits-on-you.contract.ts): at work, waiting on a
 * thing, or under a hold that asks nothing. `inPlay`: the run's phase is still in play. `now`: the instant of the pass or the read.
 */
export type AssigneeClock = { at: number; forMs: number; asksSince: number | null; inPlay: boolean; now: number };

/**
 * Where an assignee stands: it `stands`, and comes back to the person at `comesBackAt` if the ask is not answered by then (null while the
 * run asks nothing, so nothing is timed); it `lapsed` at `at`, the instant its time ran out; or it `ended` with its run.
 */
export type AssigneeStanding =
  | { kind: 'stands'; comesBackAt: number | null }
  | { kind: 'lapsed'; at: number }
  | { kind: 'ended' };

/** The instant an ask unanswered takes the run back to the person: its time, counted from the later of the ask and the assignment. */
const dueOf = (c: AssigneeClock, asksSince: number) => (c.at > asksSince ? c.at : asksSince) + c.forMs;

const assigneeStandingSpec = spec<(c: AssigneeClock) => AssigneeStanding>({
  requires: ({ input: [c] }) =>
    instant(c.at) &&
    instant(c.now) &&
    (c.asksSince === null || instant(c.asksSince)) &&
    Number.isSafeInteger(c.forMs) &&
    c.forMs >= 1_000 &&
    c.forMs <= MAX_FOR_MS,
  ensures: {
    endsWithItsRun: {
      description: 'An assignee ends when its run is over, whatever its clock says',
      condition: ({ input: [c], output }) => c.inPlay || output.kind === 'ended',
    },
    aRunThatAsksNothingIsNeverTimed: {
      description: 'While its run asks nothing of a person, at work or waiting on a thing, an assignee stands and is not timed',
      condition: ({ input: [c], output }) =>
        !c.inPlay || c.asksSince !== null || (output.kind === 'stands' && output.comesBackAt === null),
    },
    standsUntilItsTimeIsOut: {
      description:
        'While the run asks something, the assignee stands until its time has passed since the later of when the ask began and when the run was assigned, and says when that is',
      condition: ({ input: [c], output }) =>
        !c.inPlay ||
        c.asksSince === null ||
        c.now >= dueOf(c, c.asksSince) ||
        (output.kind === 'stands' && output.comesBackAt === dueOf(c, c.asksSince)),
    },
    lapsesOnceItsTimeIsOut: {
      description:
        'An ask left unanswered for the assignee’s whole time ends it, at the instant its time ran out: the run is the person’s move again',
      condition: ({ input: [c], output }) =>
        !c.inPlay ||
        c.asksSince === null ||
        c.now < dueOf(c, c.asksSince) ||
        (output.kind === 'lapsed' && output.at === dueOf(c, c.asksSince)),
    },
  },
});
export type AssigneeStandingOf = Implementation<typeof assigneeStandingSpec>;
