/**
 * The parts of a run's status the board's row of a run reads (`runRowOf`, runs.ts), as `objects` says them (`RunStatus`, `RunStepStatus`),
 * by the names the board's pages read them by.
 */
import type { RunStatus as RunStatusAnswer, RunStatusWord, RunStepStatus } from 'objects';

export type { PlaceKind, RunHolding, RunWaiting, Spent } from 'objects';

/** A run's status word, as the package judges it. */
export type RunStatus = RunStatusWord;

/** What a run waits on a person to decide: a step's approval at its gate, or its result. */
export type RunToDecide = NonNullable<RunStatusAnswer['toDecide']>;

/** How long a run's sessions were at work, since when, and when the last ended. */
export type AtWork = NonNullable<RunStatusAnswer['atWork']>;

/** What a run's sessions read and wrote, in tokens, and the sentence that says it. */
export type RunTokens = NonNullable<RunStatusAnswer['tokens']>;

/** What a step needs of a person: its needs, what it waits for, its approval, a denial, and a session it could not read. */
export type StepNeeds = Pick<RunStepStatus, 'needs' | 'waitingFor' | 'approve' | 'denied' | 'sessionUnread'>;
