/**
 * What a daemon's process says and where it sends it, as data: whether its environment asks for an OTLP export, and to where
 * (`otlpOf`), and a log as the line `nemia up` prints (`lineOf`). The layer that acts on them is `telemetry.store.ts`'s.
 */

/** Where the process exports its traces, logs and metrics over OTLP: the collector's base `url`, and the service they are filed under. */
export type Otlp = { url: string; serviceName: string };

/** The service a process's spans, logs and metrics are filed under when `OTEL_SERVICE_NAME` names none. */
export const DEFAULT_SERVICE_NAME = 'nemia';

/**
 * The OTLP export `env` asks for: its endpoint, `OTEL_EXPORTER_OTLP_ENDPOINT`, without a trailing `/`, and its service,
 * `OTEL_SERVICE_NAME` or `nemia`. Answers undefined, no export, when the endpoint is unset or blank.
 */
export function otlpOf(env: Readonly<Record<string, string | undefined>>): Otlp | undefined {
  const url = env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim().replace(/\/+$/, '');
  if (!url) return undefined;
  return { url, serviceName: env.OTEL_SERVICE_NAME?.trim() || DEFAULT_SERVICE_NAME };
}

/** Where an OTLP collector at `otlp` takes traces. */
export const tracesUrl = (otlp: Otlp): string => `${otlp.url}/v1/traces`;

/** Where an OTLP collector at `otlp` takes logs. */
export const logsUrl = (otlp: Otlp): string => `${otlp.url}/v1/logs`;

/** Where an OTLP collector at `otlp` takes metrics. */
export const metricsUrl = (otlp: Otlp): string => `${otlp.url}/v1/metrics`;

/**
 * A log's `message` as `nemia up` prints it: the time of `date`, `HH:MM:SS` in UTC, two spaces, then the message — its parts joined by a
 * space when it was logged as several, each as it is when a string, else as JSON.
 */
export function lineOf(message: unknown, date: Date): string {
  const parts = Array.isArray(message) ? message : [message];
  const text = parts.map((part) => (typeof part === 'string' ? part : JSON.stringify(part))).join(' ');
  return `${date.toISOString().slice(11, 19)}  ${text}`;
}
