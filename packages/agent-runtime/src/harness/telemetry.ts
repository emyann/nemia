/**
 * What every harness shares of a session's telemetry: the collector a process hands the engine (`Telemetry`), the variables no child
 * inherits from that process (`withoutTelemetry`), the trace context of the span that filed a task (`traceparentOf`), and the runner that
 * tells each spawn where to export (`telemetered`). How a harness says them to its session is the harness's own (`claude/telemetry.ts`).
 */
import type { RunnerOps } from './seam.ts';

/**
 * Where the sessions an engine starts export their telemetry over OTLP/HTTP: the collector's base URL, as the process was given it; and
 * `toolDetails`, present and `true` only when each session is to export its tools' inputs too (a command's text, a file's path, an
 * error's words), which a harness that can say them is told and one that cannot ignores. Absent, no session exports them.
 */
export type Telemetry = { endpoint: string; toolDetails?: true };

/** The variables of a process's telemetry: OpenTelemetry's own, the W3C trace context, and the switches a harness reads. */
const TELEMETRY_VARIABLE = /^(OTEL_.*|TRACEPARENT|TRACESTATE|CLAUDE_CODE_ENABLE_TELEMETRY|CLAUDE_CODE_ENHANCED_TELEMETRY_BETA)$/;

/**
 * `env` without the variables of a process's telemetry (`TELEMETRY_VARIABLE`): what a child is spawned with, so that it exports only
 * what its runner hands it, and a command run for a task exports nothing as the process that runs the engine.
 * @param env The environment a child would be spawned with.
 */
export const withoutTelemetry = (env: NodeJS.ProcessEnv) =>
  Object.fromEntries(Object.entries(env).filter(([name]) => !TELEMETRY_VARIABLE.test(name)));

/**
 * Why `telemetry` is no collector to export to, or `undefined`: anything but an object whose `endpoint` is an absolute http(s) URL, and
 * one whose `toolDetails` is there and not `true`.
 * @param telemetry The task's `telemetry` as filed, of any shape; undefined where it is left out, which is no refusal.
 */
export const telemetryRefusalOf = (telemetry: unknown) => {
  if (telemetry === undefined) return undefined;
  const given = typeof telemetry === 'object' && telemetry !== null ? (telemetry as { endpoint?: unknown; toolDetails?: unknown }) : {};
  const { endpoint } = given;
  if (!(typeof endpoint === 'string' && URL.canParse(endpoint) && /^https?:$/.test(new URL(endpoint).protocol)))
    return `\`telemetry: ${JSON.stringify(telemetry)}\` names no collector. Give \`{ endpoint }\`, the absolute http(s) URL of an OTLP/HTTP collector, like http://localhost:4318, or leave it out for no export.`;
  if (Object.hasOwn(given, 'toolDetails') && given.toolDetails !== true)
    return `\`telemetry: ${JSON.stringify(telemetry)}\` asks for its tools' details with ${JSON.stringify(given.toolDetails)}. Give \`toolDetails: true\` for a session to export its tools' inputs, or leave it out.`;
  return undefined;
};

/** A trace's id and a span's, as W3C trace context writes them: 32 and 16 lowercase hex digits, neither all zeros. */
const TRACE_ID = /^(?!0+$)[0-9a-f]{32}$/;
const SPAN_ID = /^(?!0+$)[0-9a-f]{16}$/;

/**
 * The W3C `traceparent` of `span`, `00-<trace id>-<span id>-<flags>`, sampled `01` or not `00`; `undefined` for a span whose ids are
 * not trace context's, which a session could not join.
 * @param span The span's trace id and span id, in hex, and whether it is sampled.
 */
export const traceparentOf = (span: { traceId: string; spanId: string; sampled: boolean }) =>
  TRACE_ID.test(span.traceId) && SPAN_ID.test(span.spanId) ? `00-${span.traceId}-${span.spanId}-${span.sampled ? '01' : '00'}` : undefined;

/**
 * `ops`, with every spawn told where to export (`SpawnRequest.telemetry`): what an engine given `telemetry` runs each harness through.
 * @param ops The runner of a harness.
 * @param telemetry The collector every spawn is told to export to.
 */
export const telemetered = (ops: RunnerOps, telemetry: Telemetry) =>
  ({
    ...ops,
    spawn: (r) => ops.spawn({ ...r, telemetry }),
  }) satisfies RunnerOps;
