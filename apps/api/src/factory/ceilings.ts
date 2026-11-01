/**
 * The cap on runs in flight, and the runs it counts and holds, and what the last pass cost: what the Factory says over its floor
 * (`GET /api/ceilings`, app.ts). And the process's metrics as JSON (`GET /api/metrics`, `metricsOf`).
 */
import type { Metric } from 'effect';
import {
  lastCeilings,
  lastPassCost,
  type PassCostRead,
  type PassesRead,
  type SeriesMemo,
  type SeriesRead,
  type Slots,
  slotWord,
} from 'agent-orchestrator';
import type { Engine } from '../store.ts';
import { commandNamed, runPlaced } from '../store.ts';
import type { PlaceService } from 'agent-orchestrator';

/**
 * The cap on runs in flight, as the board says it over the Factory: `2 of 4 run slots taken`, or `no cap`.
 *
 * `last` is what the daemon's last pass ran with (`lastCeilings`, `$WF_ROOT/tick.json`): sessions at work per pool (`WF_MAX_CONCURRENT`)
 * and runs in flight (`WF_MAX_RUNS`, 0 for no cap) — null before any pass has written them. `cap` is the cap a run is judged by, as `nemia
 * ls` and `nemia decide` judge it (`slotsOf`): the last pass's, and before any, the api's own `WF_MAX_RUNS`; 0 for none.
 *
 * `inFlight` names the runs that count against it, oldest first, as a pass counts them (`slotNeed`): a task of the run filed and not
 * settled, or a started run nobody called off with something due. Not the Factory's own count of runs in flight, which also has a run
 * waiting on runs, or held for a slot, whose roots the tick will file. Null with no cap, when nothing is read.
 * `held` are the runs the cap holds, in the order a pass admits them, each with the count it is held at and `nemia ls`'s words on its roots
 * (`heldRuns`, `slotWord`).
 *
 * `pass` is what the last pass cost, phase by phase, as it wrote it (`lastPassCost`, `$WF_ROOT/tick-stats.json`) — what `nemia up --stats`
 * prints, with what it saw (`runs`, `tasks`, `queued`, `admitted`), absent from a file an older tick wrote; null before any pass has
 * written it, or when the file does not read as one.
 */
export type Ceilings = {
  last: { sessions: number; runs: number } | null;
  cap: number;
  inFlight: string[] | null;
  held: Array<{ run: string; inFlight: number; cap: number; word: string }>;
  pass: PassCostRead | null;
};

/** The package's run slots (`slotsOf`), through its entry of the command table, served on the api alone. */
const CEILINGS = commandNamed('ceilings');

/**
 * The cap on runs in flight, and the runs it counts and holds (`Ceilings`), as the package judges them between passes (`CEILINGS`, the
 * table's entry whose handler is `slotsOf`) — every run read as a pass reads it, off one look at the harnesses — with what the last pass
 * ran with and cost. Read through `e`; the cap, before any pass wrote one, is `WF_MAX_RUNS` of `env`, the app's environment.
 */
export async function ceilingsOf(e: Engine['Service'], placeService: PlaceService['Service'], env: NodeJS.ProcessEnv): Promise<Ceilings> {
  const { cap, inFlight, held } = (await runPlaced(placeService, e, CEILINGS.handler({}, env))) as Slots;
  return {
    last: lastCeilings() ?? null,
    cap,
    inFlight,
    held: [...held].map(([run, slot]) => ({ run, ...slot, word: slotWord(slot) })),
    pass: lastPassCost() ?? null,
  };
}

/** The recent passes' entry of the command table, served on both sides. */
const PASSES = commandNamed('passes');

/**
 * What the recent passes of the tick cost (`PassesRead`), as `nemia passes --json` prints it (`PASSES`): the last `last` of them, or
 * every one kept; refused as `Invalid` for a `last` that is not a whole number from 1.
 */
export const passesOf = async (
  e: Engine['Service'],
  placeService: PlaceService['Service'],
  last: string | undefined,
): Promise<PassesRead> => (await runPlaced(placeService, e, PASSES.handler(last === undefined ? {} : { last }))) as PassesRead;

/** The series' entry of the command table, served on both sides. */
const SERIES = commandNamed('series');

/**
 * The system's series over `range` (`SeriesRead`), as `nemia series --json` prints it (`SERIES`), a past day read off `memo` while its
 * file has not moved; refused as `Invalid` for a range that is not 24h, 7d, 30d or all.
 */
export const seriesOf = async (
  e: Engine['Service'],
  placeService: PlaceService['Service'],
  range: string | undefined,
  memo: SeriesMemo,
): Promise<SeriesRead> =>
  (await runPlaced(
    placeService,
    e,
    SERIES.handler(range === undefined ? {} : { range }, undefined, undefined, { series: memo }),
  )) as SeriesRead;

/**
 * One metric as `GET /api/metrics` answers it: its name, kind, description and attributes, and its value — a counter's `count`, a gauge's
 * `value`, or a histogram's `count`, `sum`, `min`, `max` and `buckets`, each the observations at most `le`, counted from the first bucket
 * on (cumulative, as OpenTelemetry's are not). A kind the api keeps none of is answered with its name and kind alone.
 */
export type MetricRead = {
  name: string;
  type: string;
  description: string | null;
  attributes: Readonly<Record<string, string>>;
  count?: number;
  value?: number;
  sum?: number;
  min?: number;
  max?: number;
  buckets?: Array<{ le: number; count: number }>;
};

/** The metrics of a registry's snapshot (`Metric.snapshot`) as JSON (`MetricRead`), by name and then attributes. */
export const metricsOf = (snapshot: ReadonlyArray<Metric.Metric.Snapshot>): MetricRead[] =>
  snapshot
    .map((m): MetricRead => {
      const head = { name: m.id, type: m.type, description: m.description ?? null, attributes: { ...m.attributes } };
      switch (m.type) {
        case 'Counter':
          return { ...head, count: Number(m.state.count) };
        case 'Gauge':
          return { ...head, value: Number(m.state.value) };
        case 'Histogram': {
          const { count, sum, min, max, buckets } = m.state;
          return { ...head, count, sum, min, max, buckets: buckets.map(([le, n]) => ({ le, count: n })) };
        }
        default:
          return head;
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name) || JSON.stringify(a.attributes).localeCompare(JSON.stringify(b.attributes)));
