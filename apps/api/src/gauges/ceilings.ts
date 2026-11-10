/**
 * The cap on runs in flight, and the runs it counts and holds, and what the last pass cost: what the Factory says over its floor
 * (`GET /api/ceilings`, the server group). And the process's metrics as JSON (`GET /api/metrics`, `metricsOf`): each `{ name, type,
 * description, attributes }` and its value — a counter's `count`, a gauge's `value`, or a histogram's `count`, `sum`, `min`, `max` and
 * `buckets`, each the observations at most `le`, counted from the first bucket on (cumulative, as OpenTelemetry's are not). Its `type` is
 * Effect's own word for the kind; a kind the api keeps none of is answered with its name and kind alone.
 */
import type { Metric } from 'effect';
import { CEILINGS, lastCeilings, lastPassCost, slotWord } from 'agent-orchestrator';
import type { Ceilings, MetricRead } from 'objects';
import type { Served } from '../layer.ts';

export type { Ceilings, MetricRead };

/**
 * The cap on runs in flight, and the runs it counts and holds (objects' `Ceilings`), as the package judges them between passes
 * (`CEILINGS`, the table's entry whose handler is `slotsRead`) — every run read as a pass reads it, off one look at the harnesses — with
 * what the last pass ran with (`last`, `lastCeilings`: null before any pass wrote them) and cost (`pass`, `lastPassCost`). Read through
 * the request's engine; the cap, before any pass wrote one, is `WF_MAX_RUNS` of `s.env`, the app's environment. Over the app's informer
 * (`Informer`, in the request's services), a run it serves as ended at rest is left out unjudged (`slotsRead`); every run is judged where
 * the app keeps none, or under `WF_VERIFY_REST=1`. `inFlight` names the runs that count against the cap, oldest first, null with no cap;
 * `held` the runs it holds, each with `nemia ls`'s words on its roots (`slotWord`).
 */
export async function ceilingsOf(s: Served): Promise<Ceilings> {
  const { cap, inFlight, held } = await s.inRequest(CEILINGS.handler({}));
  return {
    last: lastCeilings() ?? null,
    cap,
    inFlight,
    held: [...held].map(([run, slot]) => ({ run, ...slot, word: slotWord(slot) })),
    pass: lastPassCost() ?? null,
  };
}

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
