/**
 * A run's observed status as a record of the keyspace (`/registry/runstatus/<id>`): what the daemon's pass writes of each run it judges,
 * and what the runs' lists serve it from. The record holds the run's `spec` and its `status` as the pass judged them, the frame's parts of
 * the status (`framePartsOf`) laid at the pass's instant, and, for a run still going, an `anchor`: the instant they were measured at and
 * the one part of the clock that grows while nothing else moves (`growing`). The times measured to the read are left out of what the
 * pass compares (`comparedText`), so time passing alone writes nothing; a read lays them to its own instant (`clockNow`). A plain list
 * leaves the frame off the status (`servedStatus`), the list asked by state lays it. Pure; the pieces of the record's life are
 * `run-status.store.ts` (kept) and `run-status.verb.ts` (observed).
 */
import { isObject } from 'effect/Predicate';
import { RUN_STATES, type Run as RunObject, type RunClock } from 'objects';
import type { MeasuredToNow } from '../../contracts/measured-to-now.contract.ts';
import type { ClockNow, ClockPart } from '../../contracts/run-clock.contract.ts';

/**
 * A going run's clock as measured at `at` (epoch ms), and the part of it that grows while nothing else of the status moves: what a read
 * lays to its own instant.
 */
type ClockAnchor = { readonly at: number; readonly growing: ClockPart };

/** A run's observed status as the keyspace holds it: its spec and status, and the anchor of a run whose clock is measured to the read. */
export type StatusRecord = {
  readonly spec: RunObject['spec'];
  readonly status: RunObject['status'];
  readonly anchor?: ClockAnchor;
};

/**
 * Whether the frame of a run in `state` (its status's `state`, undefined where the status carries no frame) has its `wallMs` and `clock`
 * measured to the instant its list was read at: a run still going, as `clockUntilOf` reads it to `now`. A finished run's stand still.
 * @param state The run's state, as its status says it, or undefined where the status carries no frame.
 * @public
 */
export const measuredToNow: MeasuredToNow = (state) => state === 'waiting' || state === 'inFlight';

/**
 * A going run's clock laid to the instant of a read: the time passed since the record was written goes to the growing part and to the wall
 * time, every other part stands still.
 * @param recorded The clock the record holds, measured at `at`.
 * @param growing The part of the clock that grows.
 * @param at The instant the record's clock was measured at, in epoch ms.
 * @param now The instant of the read, in epoch ms; a read before `at` gains nothing.
 */
export const clockNow: ClockNow = (recorded, growing, at, now) => {
  const passed = now > at ? now - at : 0;
  return {
    wallMs: recorded.wallMs + passed,
    sessionsMs: recorded.sessionsMs + (growing === 'sessionsMs' ? passed : 0),
    checksMs: recorded.checksMs + (growing === 'checksMs' ? passed : 0),
    personMs: recorded.personMs + (growing === 'personMs' ? passed : 0),
    slotMs: recorded.slotMs + (growing === 'slotMs' ? passed : 0),
    restMs: recorded.restMs + (growing === 'restMs' ? passed : 0),
  };
};

/** `word` as a run's state, or undefined where it is none. */
const runStateOf = (word: unknown) => RUN_STATES.find((s) => s === word);

/**
 * The record of a run's observed status: the object a list serves of it, its status framed at `at`, with the anchor of its clock where
 * that is measured to the read.
 * @param object The run's listed object with the frame's parts laid on its status, measured at `at`.
 * @param at The instant the frame was measured at, in epoch ms.
 * @param growing The part of the run's clock that grows at `at`.
 */
export const observedRecordOf = (object: RunObject, at: number, growing: ClockPart) => {
  const { spec, status } = object;
  const going = measuredToNow(runStateOf(status.state)) && status.clock !== null && status.clock !== undefined;
  return { spec, status, ...(going ? { anchor: { at, growing } } : {}) } satisfies StatusRecord;
};

/** `value` as text with every object's keys sorted and its undefined members left out, so two equal values are one text. */
// oxlint-disable-next-line landmines-types/no-explicit-return-types -- a recursive function's type is not inferred
const sortedText = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map((item) => sortedText(item === undefined ? null : item)).join(',')}]`;
  if (!isObject(value)) return JSON.stringify(value) ?? 'null';
  const members = Object.keys(value)
    .sort()
    .flatMap((key) => {
      const member = value[key];
      return member === undefined ? [] : [`${JSON.stringify(key)}:${sortedText(member)}`];
    });
  return `{${members.join(',')}}`;
};

/**
 * The text two records are compared by (`recordDue`): the record's JSON, keys sorted, leaving out what is measured to the read — where the
 * record holds an anchor, the instant of it and the status's `wallMs` and `clock`. A change of which part grows is a change of the record.
 * @param record A record's value, as the keyspace holds it or as the pass makes it.
 */
export const comparedText = (record: unknown) => {
  if (!isObject(record) || !isObject(record['anchor'])) return sortedText(record);
  const { anchor, status, ...rest } = record;
  const { at: _at, ...kept } = anchor as Record<string, unknown>;
  const { wallMs: _wallMs, clock: _clock, ...still } = isObject(status) ? status : {};
  return sortedText({ ...rest, anchor: kept, status: still });
};

/**
 * The status a record serves. A plain list leaves the frame's seven parts off (`asOf` undefined); a list asked by state lays them, a
 * going run's wall time and clock laid to `asOf` (`clockNow`), every other as the pass measured it.
 * @param record The run's observed status.
 * @param asOf The instant the list is read at, in epoch ms, or undefined for a plain list.
 */
export const servedStatus = (record: StatusRecord, asOf: number | undefined) => {
  const { status, anchor } = record;
  if (asOf === undefined) {
    const {
      state: _state,
      wallMs: _wallMs,
      clock: _clock,
      stepCosts: _stepCosts,
      waitingSince: _waitingSince,
      finishedAt: _finishedAt,
      outcome: _outcome,
      ...bare
    } = status;
    return bare satisfies RunObject['status'] as RunObject['status'];
  }
  if (anchor === undefined || status.clock === null || status.clock === undefined) return status;
  const clock: RunClock = clockNow(status.clock, anchor.growing, anchor.at, asOf);
  return { ...status, wallMs: clock.wallMs, clock } satisfies RunObject['status'];
};

/**
 * The state a record's run is in, as its status says it, or undefined where it says none.
 * @param record The run's observed status.
 */
export const stateOfRecord = (record: StatusRecord) => runStateOf(record.status.state);
