/**
 * The daemon's process's telemetry, one layer that process provides around what it runs (`telemetryLayer`): each log printed as `nemia up`
 * prints its lines, and, only when its environment names an OTLP collector, its spans, its logs and its metrics exported there too. And
 * what a pass's work on one step says of itself, the run and the step, on the spans and logs under it (`forStep`). And the export of
 * what the process holds, asked for now and waited for within a bound (`exportedNow`), its series first born at zero where asked
 * (`seriesBorn`).
 */
import { Effect, Layer, Logger, LogLevel, Metric, Option } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { OtlpExporter, OtlpLogger, OtlpMetrics, OtlpSerialization, OtlpTracer } from 'effect/observability';
import { lineOf, logsUrl, metricsUrl, otlpOf, stepLabels, tracesUrl } from './telemetry.ts';
import type { Run } from '../record/record.ts';
import type { Workflow } from '../step/step.ts';

/** Prints each log as its line (`lineOf`), its annotations unprinted: Info and below on stdout, Warn and above on stderr. */
export const lineLogger = Logger.make<unknown, void>(({ message, logLevel, date }) => {
  const line = lineOf(message, date);
  if (LogLevel.isGreaterThanOrEqualTo(logLevel, 'Warn')) console.error(line);
  else console.log(line);
});

/**
 * The telemetry of a process run in `env`: the line logger (`lineLogger`) in place of Effect's own; and, when `env` names a collector
 * (`otlpOf`), the OTLP tracer and an OTLP logger beside the line logger, each posting JSON to the collector's `/v1/traces` and `/v1/logs`,
 * and every metric of the process's registry posted to its `/v1/metrics`, cumulative, every 10 s and once more as the process ends. A
 * collector that does not answer costs a post, never the program. A process provides it once, around its program, never a verb; an
 * export gives the exporter's `Flusher` besides.
 */
export function telemetryLayer(env: Readonly<Record<string, string | undefined>>): Layer.Layer<never> | Layer.Layer<OtlpExporter.Flusher> {
  const lines = Logger.layer([lineLogger]);
  const otlp = otlpOf(env);
  if (!otlp) return lines;
  const resource = { serviceName: otlp.serviceName };
  const exported = Layer.mergeAll(
    OtlpTracer.layer({ url: tracesUrl(otlp), resource }),
    OtlpLogger.layer({ url: logsUrl(otlp), resource, mergeWithExisting: true }).pipe(Layer.provide(lines)),
    OtlpMetrics.layer({ url: metricsUrl(otlp), resource }),
  );
  return exported.pipe(Layer.provide(OtlpSerialization.layerJson), Layer.provide(FetchHttpClient.layer));
}

/** How long `exportedNow` waits for the collector, in ms: a healthy post on loopback takes a few, and a pass must not hang on one. */
export const EXPORT_BOUND_MS = 2_000;

/**
 * Everything the process's exporters hold, posted now and waited for: the registry's metrics as they stand, and the spans and logs
 * buffered, through the `Flusher` the process's `telemetryLayer` gave. Nothing where the process exports nothing, which gives none. Waits
 * `EXPORT_BOUND_MS` at most and never fails: a collector that does not answer costs the wait, and an exporter left off after a failed
 * post is not asked.
 */
export const exportedNow: Effect.Effect<void> = Effect.serviceOption(OtlpExporter.Flusher).pipe(
  Effect.flatMap(
    Option.match({
      onNone: () => Effect.void,
      onSome: (flusher) => Effect.asVoid(Effect.timeoutOption(flusher.flush, EXPORT_BOUND_MS)),
    }),
  ),
);

/**
 * Each of `series` born in the process's registry at zero, with nothing counted or measured (a read of it makes it), then exported so
 * (`exportedNow`): a collector that reads a counter or a histogram by its increase counts nothing for a series first seen at a value,
 * and reads a series a process started again brings back as a reset only once it has seen it lower. A series that is there already is
 * born for nothing; none given asks for no export.
 */
export const seriesBorn = Effect.fn('seriesBorn')(function* (series: ReadonlyArray<Metric.Metric<never, unknown>>) {
  if (!series.length) return;
  for (const one of series) yield* Metric.value(one);
  yield* exportedNow;
});

/**
 * `filing`, a pass's work on the step `step` of the run `run`, with its spans and its logs annotated with their labels (`stepLabels`):
 * the runtime's spans under it, and the journal it writes, say which they were for, beside the runtime's own task.
 */
export const forStep =
  (run: Pick<Run, 'id' | 'factory' | 'workflowDir'>, step: Workflow) =>
  <A, E, R>(filing: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    filing.pipe(Effect.annotateLogs(stepLabels(run, step)), Effect.annotateSpans(stepLabels(run, step)));
