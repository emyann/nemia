/**
 * The version a watch compares a run at in the list the board reads (`runWatchVersion`), and which runs' frame says time measured to the
 * read (`measuredToNow`). Pure. The rules of a run's state are `run-state/run-state.ts`'s, a selection's labels `labels/selected.ts`'s.
 */
import { RUN_STATES, type RunState, type WatchedObject } from 'objects';
import type { MeasuredToNow } from '../../contracts/measured-to-now.contract.ts';

/**
 * Whether the frame of a run in `state` (its status's `state`, undefined where the status carries no frame) has its `wallMs` and `clock`
 * measured to the instant its list was read at: a run still going, as `clockUntilOf` reads it to `now`. A finished run's stand still.
 */
export const measuredToNow: MeasuredToNow = (state) => state === 'waiting' || state === 'inFlight';

/** Whether `v` is an object of JSON, not an array. */
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** `word` as a run's state, or undefined where it is none. */
const runStateOf = (word: unknown): RunState | undefined => RUN_STATES.find((s) => s === word);

/**
 * The version a watch compares a run at (`Versioned`): its JSON as served, its status's `wallMs` and `clock` left out where they are
 * measured to the read (`measuredToNow`), so time passing alone is no change of the run. Any other object is its JSON as is.
 */
export const runWatchVersion = (object: WatchedObject): string => {
  const status = object['status'];
  if (!isObject(status) || !measuredToNow(runStateOf(status['state']))) return JSON.stringify(object);
  const { wallMs: _wallMs, clock: _clock, ...still } = status;
  return JSON.stringify({ ...object, status: still });
};
