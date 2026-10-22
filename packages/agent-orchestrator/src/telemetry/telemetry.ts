/**
 * What a daemon's process says and where it sends it, as data: whether its environment asks for an OTLP export, and to where
 * (`otlpOf`), what the sessions it starts export (`sessionTelemetryOf`, `toolDetailsRefusalOf`), what a step's task says it is for
 * (`stepLabels`), and a log as the line `nemia up` prints (`lineOf`). The layer that acts on them is `telemetry.store.ts`'s.
 */
import type { Run } from '../record/record.ts';
import type { Workflow } from '../step/step.ts';
import { runKeys, stepKeys, type StepKeys } from '../meter/index.ts';

/**
 * Where the process exports its traces, logs and metrics over OTLP: the collector's base `url`, the service they are filed under, and
 * how often each signal is posted where the environment says (`EXPORT_INTERVALS`), in ms, else the exporter's own.
 */
export type Otlp = { url: string; serviceName: string; every: { traces?: number; logs?: number; metrics?: number } };

/**
 * The standard OTel variables that say how often each signal is posted, in whole milliseconds: the span batch's delay, the log
 * batch's, and the metric reader's interval. Effect's own exporters built from config read the first the same way.
 */
export const EXPORT_INTERVALS = {
  traces: 'OTEL_BSP_SCHEDULE_DELAY',
  logs: 'OTEL_BLRP_SCHEDULE_DELAY',
  metrics: 'OTEL_METRIC_EXPORT_INTERVAL',
} as const;

/** The interval `env` gives under `name`: unset or blank none, a whole number of ms from 1 that number, anything else wrong. */
const intervalOf = (env: Readonly<Record<string, string | undefined>>, name: string): number | undefined | { wrong: string } => {
  const value = env[name]?.trim();
  if (!value) return undefined;
  return /^[1-9]\d*$/.test(value) ? Number(value) : { wrong: value };
};

/** The service a process's spans, logs and metrics are filed under when `OTEL_SERVICE_NAME` names none. */
export const DEFAULT_SERVICE_NAME = 'nemia';

/**
 * The OTLP export `env` asks for: its endpoint, `OTEL_EXPORTER_OTLP_ENDPOINT`, without a trailing `/`, its service,
 * `OTEL_SERVICE_NAME` or `nemia`, and each signal's interval its `EXPORT_INTERVALS` variable gives; one that is no whole number of ms
 * from 1 is left to the exporter, and said by `exportIntervalRefusalOf`. Answers undefined, no export, when the endpoint is unset or blank.
 */
export function otlpOf(env: Readonly<Record<string, string | undefined>>): Otlp | undefined {
  const url = env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim().replace(/\/+$/, '');
  if (!url) return undefined;
  const every: Otlp['every'] = {};
  for (const [signal, name] of Object.entries(EXPORT_INTERVALS) as [keyof Otlp['every'], string][]) {
    const ms = intervalOf(env, name);
    if (typeof ms === 'number') every[signal] = ms;
  }
  return { url, serviceName: env.OTEL_SERVICE_NAME?.trim() || DEFAULT_SERVICE_NAME, every };
}

/** Why an `EXPORT_INTERVALS` variable of `env` is not read, in a sentence that names the fix, or `undefined` when each is read or unset. */
export function exportIntervalRefusalOf(env: Readonly<Record<string, string | undefined>>): string | undefined {
  for (const name of Object.values(EXPORT_INTERVALS)) {
    const ms = intervalOf(env, name);
    if (ms !== undefined && typeof ms !== 'number')
      return `${name} is ${JSON.stringify(ms.wrong)}, which is no interval: set it to a whole number of milliseconds from 1, or unset it. The exporter's own interval is kept.`;
  }
  return undefined;
}

/** The variable that asks each session the daemon starts to export its tools' inputs too: `1` asks, unset, blank or `0` does not. */
const TOOL_DETAILS = 'NEMIA_TOOL_DETAILS';

/**
 * Where the sessions the engine starts export, as the runtime takes it: the collector `env` names (`otlpOf`), and `toolDetails` when
 * `NEMIA_TOOL_DETAILS` is `1`, for each session to export its tools' inputs too (a command's text, a file's path, an error's words).
 * Answers undefined, no export, without a collector, whatever `NEMIA_TOOL_DETAILS` says; any value but `1` leaves the inputs off.
 */
export function sessionTelemetryOf(
  env: Readonly<Record<string, string | undefined>>,
): { endpoint: string; toolDetails?: true } | undefined {
  const otlp = otlpOf(env);
  if (!otlp) return undefined;
  return env[TOOL_DETAILS]?.trim() === '1' ? { endpoint: otlp.url, toolDetails: true } : { endpoint: otlp.url };
}

/** Why `env`'s `NEMIA_TOOL_DETAILS` asks nothing, in a sentence that names the fix, or `undefined` when it is unset, blank, `0` or `1`. */
export function toolDetailsRefusalOf(env: Readonly<Record<string, string | undefined>>): string | undefined {
  const value = env[TOOL_DETAILS];
  if (value === undefined || ['', '0', '1'].includes(value.trim())) return undefined;
  return `${TOOL_DETAILS} is ${JSON.stringify(value)}, which asks nothing: set it to 1 for each session to export its tools' inputs, or unset it. Their tools' details are left off.`;
}

/**
 * The labels a step's task is filed with and its spans and logs say: the run `run`, and the step's own (`stepKeys`): its factory, its
 * workflow, the step and its agent, the same its metrics are kept by. Its sessions' telemetry says them beside the runtime's own task.
 */
export const stepLabels = (run: Pick<Run, 'id' | 'factory' | 'workflowDir'>, step: Workflow): StepLabels => ({
  run: run.id,
  ...stepKeys(run, step),
});

/** What `stepLabels` answers: a run's id beside the step's own labels. */
export type StepLabels = StepKeys & { run: string };

/**
 * The labels a run is known by whatever the step, from the same source as a step's (`runKeys`): its id, its factory and its workflow.
 * What a line of the feed about the run itself carries.
 */
export const runLabels = (run: Pick<Run, 'id' | 'factory' | 'workflowDir'>): Pick<StepLabels, 'run' | 'factory' | 'workflow'> => ({
  run: run.id,
  ...runKeys(run),
});

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
