/**
 * What a harness's check turn came to (`turnCheckOf`, src/harness-turn/harness-turn.ts): the one tiny real turn the server files on the
 * engine as a job of the harness, read off its task as the engine answers it. It passes only on an answer — the harness ended the turn
 * itself, under no limit, having said something — and a turn that has not settled is still running. Pure: the task's view is read and
 * handed in.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** How the turn's one attempt ended, in the engine's words (`EndReason`): absent while none has ended. */
export type TurnEnd = 'harness' | 'lost' | 'unstartable' | 'operator' | 'deadline';

/**
 * The turn's task as the engine answers it: whether it has settled, how its last attempt ended (`end`), whether the harness ended it at a
 * limit its configuration set (`budget`, the spend cap), and the statement it gave, untouched (`answer`, absent where it gave none).
 */
export type TurnSeen = {
  readonly settled: boolean;
  readonly end?: TurnEnd;
  readonly budget: boolean;
  readonly answer?: string;
};

/** Where a check stands. objects' `HARNESS_CHECK_STATES` holds the same words. */
export type TurnState = 'running' | 'passed' | 'failed';

/**
 * Why a turn failed, said apart so the board offers the fix that answers it. objects' `TURN_FAILURES` holds the same words: the turn ran
 * past its deadline (`deadline`); it reached its spend cap (`budget`); it never started, or the engine lost it (`unstarted`); a person
 * stopped it (`stopped`); the harness ended it with nothing said, in its own words a refusal such as a lapsed sign-in (`unanswered`).
 */
export type TurnFailure = 'deadline' | 'budget' | 'unstarted' | 'stopped' | 'unanswered';

/** The check a turn came to: its state, and why where it failed. */
export type TurnVerdict = { readonly state: TurnState; readonly failure?: TurnFailure };

/** Whether `s` is an answer: ended by the harness itself, under no limit, with something said. */
const answered = (s: TurnSeen): boolean =>
  s.settled && s.end === 'harness' && !s.budget && s.answer !== undefined && s.answer.trim() !== '';

const turnCheckOfSpec = spec<(seen: TurnSeen) => TurnVerdict>({
  ensures: {
    runningUntilSettled: {
      description: 'A turn the engine has not settled is still running, and neither passes nor fails',
      condition: ({ input: [s], output }) => s.settled === (output.state !== 'running'),
    },
    passesOnlyOnAnAnswer: {
      description: 'The check passes exactly when the harness answered: it ended the turn itself, under no limit, having said something',
      condition: ({ input: [s], output }) => (output.state === 'passed') === answered(s),
    },
    aFailureSaysWhy: {
      description: 'A failed check says why, and a check that did not fail names no failure',
      condition: ({ output }) => (output.state === 'failed') === (output.failure !== undefined),
    },
    pastTheDeadlineIsDeadline: {
      description: 'A turn stopped at its deadline failed for its deadline',
      condition: ({ input: [s], output }) => !(s.settled && s.end === 'deadline') || output.failure === 'deadline',
    },
    atTheCapIsBudget: {
      description: 'A turn the harness ended at its spend cap failed for its budget',
      condition: ({ input: [s], output }) => !(s.settled && s.end === 'harness' && s.budget) || output.failure === 'budget',
    },
    neverStartedIsUnstarted: {
      description: 'A turn that never started, or that the engine lost, failed unstarted',
      condition: ({ input: [s], output }) =>
        !(s.settled && (s.end === undefined || s.end === 'unstartable' || s.end === 'lost')) || output.failure === 'unstarted',
    },
    stoppedIsStopped: {
      description: 'A turn a person stopped failed stopped',
      condition: ({ input: [s], output }) => !(s.settled && s.end === 'operator') || output.failure === 'stopped',
    },
    silentIsUnanswered: {
      description: 'A turn the harness ended under no limit with nothing said failed unanswered: its own words say why',
      condition: ({ input: [s], output }) =>
        !(s.settled && s.end === 'harness' && !s.budget && !answered(s)) || output.failure === 'unanswered',
    },
  },
});

/** `turnCheckOf`'s type, which src/harness-turn/harness-turn.ts takes. */
export type TurnCheckOf = Implementation<typeof turnCheckOfSpec>;
