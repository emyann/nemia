/**
 * What every harness shares of a session's telemetry: the collector a process hands the engine (`Telemetry`), the variables no child
 * inherits from that process (`withoutTelemetry`), the trace context of the span that filed a task (`traceparentOf`), and the runner that
 * tells each spawn where to export (`telemetered`). How a harness says them to its session is the harness's own (`claude/telemetry.ts`).
 */
import type { RunnerOps } from './seam.ts';

/** Where the sessions an engine starts export their telemetry over OTLP/HTTP: the collector's base URL, as the process was given it. */
export type Telemetry = { endpoint: string };

/** The variables of a process's telemetry: OpenTelemetry's own, the W3C trace context, and the switches a harness reads. */
const TELEMETRY_VARIABLE = /^(OTEL_.*|TRACEPARENT|TRACESTATE|CLAUDE_CODE_ENABLE_TELEMETRY|CLAUDE_CODE_ENHANCED_TELEMETRY_BETA)$/;

/**
 * `env` without the variables of a process's telemetry (`TELEMETRY_VARIABLE`): what a child is spawned with, so that it exports only
 * what its runner hands it, and a command run for a task exports nothing as the process that runs the engine.
 */
export const withoutTelemetry = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv =>
  Object.fromEntries(Object.entries(env).filter(([name]) => !TELEMETRY_VARIABLE.test(name)));

/** Why `telemetry` is no collector to export to, or `undefined`: anything but an object whose `endpoint` is an absolute http(s) URL. */
export const telemetryRefusalOf = (telemetry: unknown): string | undefined => {
  if (telemetry === undefined) return undefined;
  const endpoint = typeof telemetry === 'object' && telemetry !== null ? (telemetry as { endpoint?: unknown }).endpoint : undefined;
  if (typeof endpoint === 'string' && URL.canParse(endpoint) && /^https?:$/.test(new URL(endpoint).protocol)) return undefined;
  return `\`telemetry: ${JSON.stringify(telemetry)}\` names no collector. Give \`{ endpoint }\`, the absolute http(s) URL of an OTLP/HTTP collector, like http://localhost:4318, or leave it out for no export.`;
};

/** A trace's id and a span's, as W3C trace context writes them: 32 and 16 lowercase hex digits, neither all zeros. */
const TRACE_ID = /^(?!0+$)[0-9a-f]{32}$/;
const SPAN_ID = /^(?!0+$)[0-9a-f]{16}$/;

/**
 * The W3C `traceparent` of `span`, `00-<trace id>-<span id>-<flags>`, sampled `01` or not `00`; `undefined` for a span whose ids are
 * not trace context's, which a session could not join.
 */
export const traceparentOf = (span: { traceId: string; spanId: string; sampled: boolean }): string | undefined =>
  TRACE_ID.test(span.traceId) && SPAN_ID.test(span.spanId) ? `00-${span.traceId}-${span.spanId}-${span.sampled ? '01' : '00'}` : undefined;

/** `ops`, with every spawn told where to export (`SpawnRequest.telemetry`): what an engine given `telemetry` runs each harness through. */
export const telemetered = (ops: RunnerOps, telemetry: Telemetry): RunnerOps => ({
  ...ops,
  spawn: (r) => ops.spawn({ ...r, telemetry }),
});
