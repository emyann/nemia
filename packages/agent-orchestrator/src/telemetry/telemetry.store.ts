/**
 * The daemon's process's telemetry, one layer that process provides around what it runs (`telemetryLayer`): each log printed as `nemia up`
 * prints its lines, and, only when its environment names an OTLP collector, its spans, its logs and its metrics exported there too. And
 * what a pass's work on one step says of itself, the run and the step, on the spans and logs under it (`forStep`).
 */
import { Effect, Layer, Logger, LogLevel } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { OtlpLogger, OtlpMetrics, OtlpSerialization, OtlpTracer, type OtlpExporter } from 'effect/observability';
import { lineOf, logsUrl, metricsUrl, otlpOf, stepLabels, tracesUrl } from './telemetry.ts';

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

/**
 * `filing`, a pass's work on the step `step` of the run `run`, with its spans and its logs annotated with both: the runtime's spans
 * under it, and the journal it writes, say which they were for, beside the runtime's own task.
 */
export const forStep =
  (run: string, step: string) =>
  <A, E, R>(filing: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    filing.pipe(Effect.annotateLogs(stepLabels(run, step)), Effect.annotateSpans(stepLabels(run, step)));
