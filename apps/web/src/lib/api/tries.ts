/**
 * A step's tries as `objects` says them (`StepTry`, `StepCloseout`, `StepCheck`, `StepAttempts`, read through the objects' client by
 * `steps.tries`), with the names the board's pages read their parts by.
 */
import type { StepCloseout } from 'objects';

export type { AttemptEnd, StepAttempts, StepCheck, StepCloseout, StepLog, StepTry, StepUnreadable } from 'objects';

/** How a session's attempt ended, in the engine's words. */
export type AttemptOutcome = import('objects').EngineOutcome;

/** A file a closeout handed on: its kind, its name, and its link. */
export type StepArtifact = StepCloseout['artifacts'][number];

/** The questions a closeout asked under one of its output's fields. */
type AskedQuestions = StepCloseout['questions'][number];

/** One question a closeout asked. */
export type Question = AskedQuestions['questions'][number];

/** A value a closeout handed on, by its name, and its link or null. */
export type StepValue = StepCloseout['values'][number];
