/**
 * The rules of a run's state in the list the board reads (a RunList asked by `?fieldSelector=status.state…`): what state a listed run is
 * in — it waits on a person, it is in flight, or it is finished (`kindOf`) — when a finished run finished, a run's wall time, a finished
 * run's outcome, the factory a read keeps, which runs' frame says time measured to the read (`measuredToNow`), and the version a watch
 * compares a run at (`runWatchVersion`).
 *
 * Pure: a run's summary in, as the whole list answers it, and a word or a time out. Each rule reads the fields it names
 * (`Listed`), so the list's own summary is handed as it is.
 */
import path from 'node:path';
import { RUN_STATES, type RunOutcome, type RunState, type WatchedObject } from 'objects';
import type { MeasuredToNow } from '../../contracts/measured-to-now.contract.ts';
import { DEFAULT_FACTORY } from '../factory/factory.ts';
import { labelsText, metadataLabels, type Labels } from '../labels/labels.ts';
import type { Run } from '../record/record.ts';
import { selectsLabels, type Selectors } from '../watch/selector.ts';

/** What the rules read of a run's summary, as the whole list answers it. */
export type Listed = {
  id: string;
  factory: string | null;
  createdAt: string;
  cancelledAt: string | null;
  status: string;
  moving: boolean;
  waitingOnYou: readonly string[];
  waiting: { waitingOnYou: boolean } | null;
  holding: { waitingOnYou: boolean } | null;
  atWork: { endedAt: string | null } | null;
  toDecide: { kind: string } | null;
};

/**
 * Whether a run waits on a person: nobody called it off, and a step of it waits on one, or a run it waits on never lands without one,
 * or a hold on it only a person lifts.
 */
const waitsOnPerson = (run: Listed): boolean =>
  !run.cancelledAt && (run.waitingOnYou.length > 0 || Boolean(run.waiting?.waitingOnYou) || Boolean(run.holding?.waitingOnYou));

/**
 * The kind of a listed run, asked in this order so each run has one: `waiting`, it waits on a person, though something of it may still
 * move; else `inFlight`, something of it moves, or it is running and waits on nobody; else `finished`.
 */
export const kindOf = (run: Listed): RunState => {
  if (waitsOnPerson(run)) return 'waiting';
  if (run.moving || (run.status === 'running' && !run.waiting?.waitingOnYou && !run.holding?.waitingOnYou)) return 'inFlight';
  return 'finished';
};

/**
 * When a finished run's work stopped: the later of the end of its last session or check and its cancellation; its creation for a run
 * that ran nothing and nobody cancelled.
 */
export const finishedAtOf = (run: Pick<Listed, 'atWork' | 'cancelledAt' | 'createdAt'>): string => {
  const ends = [run.atWork?.endedAt ?? null, run.cancelledAt].filter((at): at is string => at !== null);
  return ends.sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? run.createdAt;
};

/**
 * The instant a run's clock is read at, in epoch milliseconds: when its work stopped (`finishedAtOf`) for a finished run, so that a
 * finished run's breakdown is frozen where its work ended; `now` for a run still going. `wallMsOf` measures to this same instant, so a
 * clock's `wallMs` and the row's own are one number, which is what makes a breakdown's rows add up to the row.
 */
export const clockUntilOf = (run: Listed, now: number): number => (kindOf(run) === 'finished' ? Date.parse(finishedAtOf(run)) : now);

/**
 * A run's wall time in ms, never negative: from its creation until its work stopped (`finishedAtOf`), or until `now` for one not
 * finished (`clockUntilOf`).
 */
export const wallMsOf = (run: Listed, now: number): number => Math.max(0, clockUntilOf(run, now) - Date.parse(run.createdAt));

/** How a finished run ended (`RunOutcome`). */
export const outcomeOf = (run: Pick<Listed, 'cancelledAt' | 'toDecide' | 'status'>): RunOutcome => {
  if (run.cancelledAt) return 'cancelled';
  if (run.toDecide?.kind === 'result') return 'undecided';
  return run.status === 'succeeded' ? 'succeeded' : 'failed';
};

/** Whether a run is of `factory`, a run whose record names none being of the default one; every run where `factory` is undefined. */
export const inFactory =
  (factory: string | undefined) =>
  (run: Pick<Listed, 'factory'>): boolean =>
    factory === undefined || (run.factory ?? DEFAULT_FACTORY) === factory;

/**
 * The run's whole map, as a selector reads it and a list's row carries it: the person's keys, `workflow`, and `factory` (`default` for the
 * default one).
 */
export const runLabelMap = (run: Pick<Run, 'workflowDir' | 'factory' | 'labels'>): Labels =>
  metadataLabels({ workflow: path.basename(run.workflowDir), factory: run.factory ?? DEFAULT_FACTORY, labels: run.labels });

/**
 * The runs of `runs` whose whole map `selectors` takes (`selectsLabels`), in their order: every one where none is given. The lists select
 * off the composed record before they judge a run (`runsSummarized`, `runsListed`), and the stats before they sum a run's facts.
 */
export const selectedRuns = <R extends Pick<Run, 'workflowDir' | 'factory' | 'labels'>>(
  runs: readonly R[],
  selectors: Selectors = [],
): readonly R[] => (selectors.length ? runs.filter((run) => selectsLabels(selectors, runLabelMap(run))) : runs);

/**
 * What a printer appends to a line of `map`'s, as `nemia ls` its runs' head lines and `nemia inbox` its cards': with `--show-labels`,
 * `  labels: <the map>` (`labelsText`); then, for each `-L <key>` in the order given, `  <key>: <its value>`, `<none>` where the map has
 * none. Nothing with neither, so the line is as it was. Pure.
 */
export const labelSegments = (map: Labels, shown: { readonly all: boolean; readonly columns: readonly string[] }): string =>
  `${shown.all ? `  labels: ${labelsText(map)}` : ''}${shown.columns.map((key) => `  ${key}: ${map[key] ?? '<none>'}`).join('')}`;

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
