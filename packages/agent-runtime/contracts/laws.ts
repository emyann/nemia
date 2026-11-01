/**
 * The laws of a stop request, held against the runtime's Effect verb (`requestStop`, src/core/engine/filing.ts).
 * They speak of the outcome and of the calls made, never of how the program is written.
 */
import type { Outcome } from '@emyann/tsverify';
import { fold, type Event } from '../src/core/domain.ts';
import { stopRefusalOf } from '../src/core/engine/filing.ts';

type Failure = { readonly _tag: string };
export type StopOutcome = Outcome<void, Failure>;
export type StopCall =
  | { readonly op: 'read'; readonly args: readonly [string]; readonly outcome: Outcome<readonly Event[], Failure> }
  | { readonly op: 'append'; readonly args: readonly [string, Event, ...ReadonlyArray<unknown>]; readonly outcome: Outcome<void, Failure> };

/** The journal is read first, and for this task. */
export const readsFirst = (taskId: string, _out: StopOutcome, calls: ReadonlyArray<StopCall>): boolean => {
  const first = calls.at(0);
  return first !== undefined && first.op === 'read' && first.args[0] === taskId;
};

/** A read that fails ends the request with that failure, and nothing else is called. */
export const readFailurePassesThrough = (_taskId: string, out: StopOutcome, calls: ReadonlyArray<StopCall>): boolean => {
  const first = calls.at(0);
  if (first === undefined || first.outcome._tag !== 'Failure') return true;
  return calls.length === 1 && out._tag === 'Failure' && out.error._tag === first.outcome.error._tag;
};

/** A refused stop writes nothing. */
export const refusedWritesNothing = (_taskId: string, out: StopOutcome, calls: ReadonlyArray<StopCall>): boolean =>
  !(out._tag === 'Failure' && out.error._tag === 'StopRefused') || !calls.some((c) => c.op === 'append');

/** An accepted stop writes exactly one entry, last, to this task, of kind `stop-requested`. */
export const acceptedWritesOneStop = (taskId: string, out: StopOutcome, calls: ReadonlyArray<StopCall>): boolean => {
  if (out._tag !== 'Success') return true;
  const last = calls.at(-1);
  return (
    calls.filter((c) => c.op === 'append').length === 1 &&
    last !== undefined &&
    last.op === 'append' &&
    last.args[0] === taskId &&
    last.args[1].kind === 'stop-requested'
  );
};

/** The request is refused exactly when the guard, asked of the journal read, gives words. */
export const refusedExactlyWhenTheGuardSays = (taskId: string, out: StopOutcome, calls: ReadonlyArray<StopCall>): boolean => {
  const first = calls.at(0);
  if (first === undefined || first.op !== 'read' || first.outcome._tag !== 'Success') return true;
  const events = first.outcome.value;
  const refused = stopRefusalOf(taskId, events.length ? fold(taskId, events) : undefined) !== undefined;
  return refused === (out._tag === 'Failure' && out.error._tag === 'StopRefused');
};
