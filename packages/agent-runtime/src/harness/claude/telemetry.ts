/**
 * A session's telemetry as Claude Code reads it: its own switch, OpenTelemetry's exporter variables, its tools' details when asked, and
 * the W3C trace context (`claudeTelemetryEnv`), handed to a job in its environment and to a background session in its `--settings` (`telemeteredFlags`),
 * since a background session is run by Claude Code's own service and carries none of the environment it was asked from.
 */
import type { SpawnRequest } from '../seam.ts';
import { settingsObject, type ClaudeFlags } from './vocabulary.ts';

/**
 * `resource` as OpenTelemetry's `OTEL_RESOURCE_ATTRIBUTES`: `key=value` pairs, by key, joined by commas, each value percent-encoded so
 * that a `,`, a `=` or a `%` in it is read back as itself.
 */
export const resourceAttributes = (resource: Record<string, string>): string =>
  Object.entries(resource)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join(',');

/**
 * The variables a Claude Code session exports its telemetry under, to the collector `r.telemetry` names, or none when it names none:
 * metrics, events and spans, each over OTLP/HTTP as JSON; its resource the spawn's (`r.resource`); and the trace context it joins
 * (`r.traceparent`), which a job reads and a background session does not. The prompts' and their contents' words stay off, and so do
 * the tools' inputs — a command's text, a file's path, an error's words — unless the collector asks for them (`toolDetails`).
 */
export const claudeTelemetryEnv = (r: SpawnRequest): Record<string, string> => {
  if (!r.telemetry) return {};
  return {
    CLAUDE_CODE_ENABLE_TELEMETRY: '1',
    CLAUDE_CODE_ENHANCED_TELEMETRY_BETA: '1',
    OTEL_METRICS_EXPORTER: 'otlp',
    OTEL_LOGS_EXPORTER: 'otlp',
    OTEL_TRACES_EXPORTER: 'otlp',
    OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json',
    OTEL_EXPORTER_OTLP_ENDPOINT: r.telemetry.endpoint,
    ...(r.telemetry.toolDetails === true ? { OTEL_LOG_TOOL_DETAILS: '1' } : {}),
    ...(r.resource ? { OTEL_RESOURCE_ATTRIBUTES: resourceAttributes(r.resource) } : {}),
    ...(r.traceparent ? { TRACEPARENT: r.traceparent } : {}),
  };
};

/**
 * `flags` with the session's telemetry (`claudeTelemetryEnv`) laid over the `env` of their `settings`: what a background session is
 * given. The flags as given when `r` exports nothing, and when their settings are a file's path, which the runtime does not rewrite:
 * such a session exports nothing.
 */
export const telemeteredFlags = (flags: ClaudeFlags | undefined, r: SpawnRequest): ClaudeFlags | undefined => {
  const telemetry = claudeTelemetryEnv(r);
  if (!Object.keys(telemetry).length) return flags;
  const settings = settingsObject(flags?.settings ?? '{}');
  if (settings === undefined) return flags;
  const env = typeof settings.env === 'object' && settings.env !== null ? settings.env : {};
  return { ...flags, settings: JSON.stringify({ ...settings, env: { ...env, ...telemetry } }) };
};
