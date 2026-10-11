/**
 * The side Grafana for building Nemia (`tools/observe/`): its compose file brings up one stack, its image pinned by digest, on the ports
 * the daemon exports to; its dashboards parse, point at the image's own datasources, and name only what the code emits.
 *
 * The names are read from the code, never listed by hand. The metrics are scanned from both `src` trees (`Metric.histogram`, `gauge`,
 * `counter`) and named as Prometheus shows them through the collector, as measured on the stack: dots become underscores, a histogram
 * gets `_bucket`, `_count` and `_sum`, a gauge `_ratio`, a counter that only grows `_total` and any other counter nothing. The spans,
 * their attributes and the logs' annotations come from a pass of the tick traced over the runtime's engine as the client builds it
 * (`engineOf`), the orchestrator's own `Effect.fn` names, the waits' spans (`WAIT_SPANS`) with their own keys (`WAIT_SPAN_KEYS`) and a
 * denied call's (`DENIED_SPAN`, `DENIED_SPAN_KEYS`), each with its step's attributes, and a finished run's timeline's (`TIMELINE_SPAN`,
 * `TIMELINE_SPAN_KEYS`), whose `of` and `part` a query may ask only for a value the code gives (`TIMELINE_OF`, `TIMELINE_PARTS`); the
 * labels from `STEP_ATTRIBUTE_KEYS` and the attributes each `Metric.withAttributes` gives. What a step's Claude Code session sends, its
 * spans and its log events, and what Tempo's span metrics write, are no code of ours: they are listed as measured, dated, and the span
 * metrics' dimensions and the collector's `command_head` and `test_scope` are read from `tempo.yaml` and `otelcol.yaml`.
 *
 * The fake telemetry a render shows the dashboards over (`tools/observe/render/seed.ts`) is held the same way: every name it sends is one
 * the code emits or a measured one (`seedUnknown`), and every panel is met by it, with two series where it draws series, or listed as
 * unseeded (`unmet`, `strayUnseeded`). Met is by name: no query is evaluated here, which the render itself does.
 *
 * `WF_ROOT` is set before the runner is imported, which reads it as the module loads. `WF_VERIFY_REST=1` judges in full every run a pass
 * answers from its memo, sessions enough are admitted for the one run, and no cap is set on runs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { Engine as RuntimeEngine, type Event, type Sighting } from 'agent-runtime';
import { Effect, Logger, Option, References, Tracer } from 'effect';
import { scratch } from './scratch.ts';
import { asyncOps, asyncStore, type AsyncJournal, type AsyncRunner } from './promised.ts';
import { testPlace } from '../place/memory/index.ts';
import { runGiven } from './placed.ts';
import { SEED, UNSEEDED, type ServiceSeed, type SpanSeed } from '../../../tools/observe/render/seed.ts';

const ROOT = scratch('wf-observe-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

process.env.WF_ROOT = ROOT;
process.env.WF_MAX_CONCURRENT = '10';
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_RUNS;
const { startRun } = await import('../src/runner.ts');
const place = testPlace();
const stand = () => place;
const runPlaced = runGiven(() => stand().layer);
const { tickRun } = await import('../src/tick/tick.verb.ts');
const { EngineService, engineOf } = await import('../src/runtime-client.ts');
const { DENIED_SPAN, DENIED_SPAN_KEYS, PASS_METRICS, STEP_METRICS, TIMELINE_SPAN, TIMELINE_SPAN_KEYS, WAIT_SPAN_KEYS, WAIT_SPANS } =
  await import('../src/meter/meter.verb.ts');
const { TIMELINE_OF, TIMELINE_PARTS } = await import('../src/timeline/index.ts');
const { STEP_ATTRIBUTE_KEYS } = await import('../src/meter/step.ts');
const { DEFAULT_SERVICE_NAME } = await import('../src/telemetry/telemetry.ts');
const { PHASES } = await import('../src/meter/meter.ts');

const REPO_ROOT = path.join(import.meta.dirname, '..', '..', '..');
const OBSERVE = path.join(REPO_ROOT, 'tools', 'observe');
const SOURCES = [path.join(REPO_ROOT, 'packages', 'agent-orchestrator', 'src'), path.join(REPO_ROOT, 'apps', 'api', 'src')];

/** The labels the collector and Prometheus add to every series, as measured: the service's, and a bucket's bound. */
const EXPORTER_LABELS = ['job', 'service_name', 'le'];

/** The stream label and the structured metadata the collector gives every log in Loki, as measured, beside the log's annotations. */
const LOKI_FIELDS = ['service_name', 'trace_id', 'span_id', 'severity_text', 'detected_level'];

/** The resource attribute a span is filed under. */
const RESOURCE_ATTRIBUTES = ['service.name'];

/** The datasources the image provisions, by uid. */
const DATASOURCES = ['prometheus', 'tempo', 'loki', 'pyroscope'];

/** Grafana's server-side expressions, which read a panel's other queries by their refId and are sent to no datasource of the image. */
const EXPRESSIONS = '__expr__';

/**
 * The spans a step's Claude Code session sends (as measured, `tools/observe/README.md`): a turn of a `-p` job, a model request, a tool
 * call, and a tool call's wait on a permission and its run.
 */
const CLAUDE_SPANS = [
  'claude_code.interaction',
  'claude_code.llm_request',
  'claude_code.tool',
  'claude_code.tool.blocked_on_user',
  'claude_code.tool.execution',
];

/**
 * The attributes of those spans a dashboard reads beside a step's own, as measured: a tool call's name, and the task a
 * session runs as, one of the labels it is started with and copies onto its spans. `command_head` and `test_scope` are the
 * collector's (`tools/observe/otelcol.yaml`).
 */
const CLAUDE_SPAN_ATTRIBUTES = ['tool_name', 'task'];

/** The service a step's Claude Code session files its spans and its log events under, as measured. */
const CLAUDE_SERVICE = 'claude-code';

/**
 * The fields of a session's log events in Loki a dashboard reads beside a run's and a step's, as measured (`tools/observe/README.md`,
 * *Counting a session's errors*): the event's name (`tool_result`), whether the tool succeeded, the tool and its parameters, and the
 * labels the session was started with. A failed skill load's skill is no field: it is read out of `tool_parameters`, a text.
 */
const CLAUDE_LOG_FIELDS = ['event_name', 'success', 'tool_name', 'tool_parameters', 'task', 'factory', 'workflow', 'agent'];

/** The series Tempo's span metrics write to Prometheus, as measured: latency in seconds. */
const SPAN_METRICS = [
  'traces_spanmetrics_calls_total',
  'traces_spanmetrics_latency_bucket',
  'traces_spanmetrics_latency_count',
  'traces_spanmetrics_latency_sum',
  'traces_spanmetrics_size_total',
];

/** The labels Tempo gives every span-metric series, as measured, beside the dimensions `tools/observe/tempo.yaml` keeps. */
const SPAN_METRIC_LABELS = ['service', 'span_name', 'span_kind', 'status_code'];

/** The dimensions the image's own Tempo config keeps, which no span of ours carries: `tempo.yaml` keeps them as the image has them. */
const IMAGE_DIMENSIONS = ['service_name', 'operation', 'status_code'];

/** The label Pyroscope files a profile under, as measured: the service, the profiler's `appName`. */
const PROFILE_LABELS = ['service_name'];

/**
 * The profile types the preload's profiler sends (`tools/observe/profile/`), as measured: wall time and its samples, the CPU time it
 * collects beside them, and the heap's objects and bytes in use.
 */
const PROFILE_TYPES = [
  'wall:wall:nanoseconds:wall:nanoseconds',
  'wall:samples:count:wall:nanoseconds',
  'wall:cpu:nanoseconds:wall:nanoseconds',
  'memory:inuse_objects:count:inuse_space:bytes',
  'memory:inuse_space:bytes:inuse_space:bytes',
];

/** Every name a dashboard may use, each kind its own set. */
type Known = {
  metrics: Set<string>;
  labels: Set<string>;
  spans: Set<string>;
  attributes: Set<string>;
  resources: Set<string>;
  logFields: Set<string>;
  profileLabels: Set<string>;
  profileTypes: Set<string>;
};

/** A dashboard's query, as the checker reads it: the datasource it is sent to, its text, and the profile type a Pyroscope query reads. */
type Query = { datasource: string; text: string; profileType?: string };

/**
 * A panel's query, as far as the checker reads it: PromQL in `expr`, TraceQL or LogQL in `query`, Pyroscope's in `labelSelector` and
 * `profileTypeId`, the rows a Tempo table shows in `tableType`: a row per span, or per trace when it is `traces` or missing; a
 * server-side expression's `expression`, which reads the panel's other queries by their `refId`; and of a Loki query its `queryType`,
 * `instant` or, when it is `range` or missing, a range, and the `legendFormat` its series are named by where Grafana draws one.
 */
type Target = {
  datasource?: { uid?: string };
  refId?: string;
  expression?: string;
  expr?: string;
  query?: string;
  labelSelector?: string;
  profileTypeId?: string;
  tableType?: string;
  queryType?: string;
  legendFormat?: string;
};

/**
 * A panel's transformation, as far as the checker reads it: a `sortBy`'s fields among its options, and a `renameByRegex`'s pattern and
 * what it renames a match to.
 */
type Transformation = { id: string; options?: { sort?: { field?: string }[]; regex?: string; renamePattern?: string } };

/**
 * A panel of a dashboard, as far as the checker reads it: of a bar gauge, in `reduceOptions`, whether it draws a bar for each row its
 * query answers (`values`) or one for each field, and how many rows at most (`limit`); where it writes a bar's name, `namePlacement`,
 * above the bar (`top`) or beside it; and the name it gives each bar, `displayName`.
 */
type Panel = {
  type: string;
  title?: string;
  datasource?: { uid?: string };
  targets?: Target[];
  panels?: Panel[];
  options?: { content?: string; namePlacement?: string; reduceOptions?: { values?: boolean; limit?: number } };
  fieldConfig?: { defaults?: { displayName?: string } };
  transformations?: Transformation[];
};

/** A dashboard's variable, as far as the checker reads it: what it asks, and whether it may hold every value or several. */
type Variable = {
  name: string;
  type: string;
  query?: unknown;
  current?: { value?: unknown };
  datasource?: { uid?: string };
  includeAll?: boolean;
  multi?: boolean;
};

/** A dashboard, as far as the checker reads it. */
type Dashboard = {
  uid: string;
  title: string;
  panels: Panel[];
  templating?: { list: Variable[] };
};

/** Every `.ts` file under `dir`, its tests left out. */
const sourcesUnder = (dir: string): string[] =>
  fs
    .readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => path.join(dir, f));

const SOURCE_TEXT = SOURCES.flatMap(sourcesUnder)
  .map((f) => fs.readFileSync(f, 'utf8'))
  .join('\n');

/** Each metric the sources define, by its id, with the names Prometheus shows for it. */
function scannedMetrics(text: string): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const [, kind, id, options] of text.matchAll(/Metric\.(histogram|gauge|counter)\(\s*'([^']+)'\s*,\s*\{([^}]*)\}/g)) {
    const base = id.replace(/\./g, '_');
    const forms =
      kind === 'histogram'
        ? [`${base}_bucket`, `${base}_count`, `${base}_sum`]
        : kind === 'gauge'
          ? [`${base}_ratio`]
          : /incremental:\s*true/.test(options)
            ? [`${base}_total`]
            : [base];
    found.set(id, forms);
  }
  return found;
}

const METRICS = scannedMetrics(SOURCE_TEXT);

/** The attribute keys each `Metric.withAttributes` in `text` gives in an object written there. */
const attributeKeys = (text: string): string[] =>
  [...text.matchAll(/Metric\.withAttributes\(\s*[\w.]+\s*,\s*\{([^}]*)\}/g)].flatMap(([, body]) =>
    [...body.matchAll(/([A-Za-z_]\w*)\s*(?::|,|$)/g)].map(([, key]) => key),
  );

const tasks = new Map<string, Event[]>();
const journal: AsyncJournal = {
  async append(taskId, event) {
    tasks.set(taskId, [...(tasks.get(taskId) ?? []), event]);
  },
  async read(taskId) {
    return [...(tasks.get(taskId) ?? [])];
  },
  async list() {
    return [...tasks.keys()].sort();
  },
  async feed() {
    return { entries: [], cursor: 0 };
  },
};
const sessions = new Map<string, Sighting>();
const runner: AsyncRunner = {
  async spawn(r) {
    sessions.set(r.name, { sessionId: `s-${sessions.size + 1}`, nativeId: `n-${sessions.size + 1}`, state: 'working', busy: true });
  },
  async observe() {
    return new Map(sessions);
  },
  async stop() {},
  async logs() {
    return '';
  },
};

/** The spans `span` sits under, its parent first. */
const ancestorsOf = (span: Tracer.AnySpan): Tracer.AnySpan[] =>
  span._tag === 'Span' && Option.isSome(span.parent) ? [span.parent.value, ...ancestorsOf(span.parent.value)] : [];

/**
 * The span names, span attribute keys and log annotation keys of one traced pass that files a run's first step, and the names it gives a
 * span under another of the same name: one name two layers both use, a query on which mixes them.
 */
async function tracedPass(): Promise<{ spans: Set<string>; attributes: Set<string>; annotations: Set<string>; shared: Set<string> }> {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stand().world.repository(repo, {});
  const folder = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(folder, 'work.md'), '---\nplace: git\nharness: codex\n---\nwork it\n');
  const e = engineOf(
    RuntimeEngine.layer({
      root: fs.mkdtempSync(path.join(ROOT, 'engine-')),
      journal: asyncStore(journal),
      harnesses: { claude: asyncOps(runner), codex: asyncOps(runner), check: asyncOps(runner) },
      defaultHarness: 'claude',
    }),
  );
  await runPlaced(startRun({ brief: 'one run', repo, workflowDir: folder }));
  const spans: Tracer.NativeSpan[] = [];
  const annotations = new Set<string>();
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options);
      spans.push(span);
      return span;
    },
  });
  const keeper = Logger.make(({ fiber }) => {
    for (const key of Object.keys(fiber.getRef(References.CurrentLogAnnotations))) annotations.add(key);
  });
  await runPlaced(
    tickRun({ repo: ROOT }).pipe(
      Effect.provide(EngineService.layer(e)),
      Effect.provide(Logger.layer([keeper])),
      Effect.provideService(References.MinimumLogLevel, 'Debug'),
      Effect.withTracer(tracer),
    ),
  );
  const shared = spans.filter((s) => ancestorsOf(s).some((a) => a._tag === 'Span' && a.name === s.name)).map((s) => s.name);
  return {
    spans: new Set(spans.map((s) => s.name)),
    attributes: new Set(spans.flatMap((s) => [...s.attributes.keys()])),
    annotations,
    shared: new Set(shared),
  };
}

const TRACED = await tracedPass();

/** The dimensions Tempo keeps span time by (`tools/observe/tempo.yaml`), each a label of the span metrics. */
const TEMPO_DIMENSIONS: string[] = (
  yaml.load(fs.readFileSync(path.join(OBSERVE, 'tempo.yaml'), 'utf8')) as {
    metrics_generator: { processor: { span_metrics: { dimensions: string[] } } };
  }
).metrics_generator.processor.span_metrics.dimensions;

/** The attribute the collector's transform writes (`tools/observe/otelcol.yaml`), read from its statements. */
const COLLECTOR_ATTRIBUTES: string[] = [
  ...new Set(
    [...fs.readFileSync(path.join(OBSERVE, 'otelcol.yaml'), 'utf8').matchAll(/set\(attributes\["(\w+)"\]/g)].map(([, key]) => key),
  ),
];

const KNOWN: Known = {
  metrics: new Set([...METRICS.values()].flat().concat(SPAN_METRICS)),
  labels: new Set([
    ...STEP_ATTRIBUTE_KEYS,
    ...attributeKeys(SOURCE_TEXT),
    ...EXPORTER_LABELS,
    ...SPAN_METRIC_LABELS,
    ...TEMPO_DIMENSIONS.filter((d) => !IMAGE_DIMENSIONS.includes(d)),
  ]),
  spans: new Set([
    ...TRACED.spans,
    ...Object.values(WAIT_SPANS),
    DENIED_SPAN,
    TIMELINE_SPAN,
    ...[...SOURCE_TEXT.matchAll(/Effect\.fn\(\s*'([^']+)'/g)].map(([, name]) => name),
    ...CLAUDE_SPANS,
  ]),
  attributes: new Set([
    ...TRACED.attributes,
    ...WAIT_SPAN_KEYS,
    ...DENIED_SPAN_KEYS,
    ...TIMELINE_SPAN_KEYS,
    ...STEP_ATTRIBUTE_KEYS,
    ...CLAUDE_SPAN_ATTRIBUTES,
    ...COLLECTOR_ATTRIBUTES,
  ]),
  resources: new Set(RESOURCE_ATTRIBUTES),
  logFields: new Set([...TRACED.annotations, ...LOKI_FIELDS, ...CLAUDE_LOG_FIELDS]),
  profileLabels: new Set(PROFILE_LABELS),
  profileTypes: new Set(PROFILE_TYPES),
};

/** PromQL's own words, which are not metrics: its functions, aggregations and keywords as the dashboards use them. */
const PROMQL_WORDS = new Set(
  [
    'sum avg max min count group topk by without on ignoring and or unless rate increase delta histogram_quantile vector',
    'label_values label_replace clamp_min',
  ]
    .join(' ')
    .split(' '),
);

/** The metric and label names a PromQL expression (or a `label_values` variable query) names. */
function promNames(expr: string): { metrics: string[]; labels: string[] } {
  const labels = [...expr.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map(([, l]) => l);
  let text = expr
    .replace(/\{\{\s*\w+\s*\}\}/g, ' ')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/\[[^\]]*\]/g, ' ');
  for (const [, body] of text.matchAll(/\{([^}]*)\}/g))
    labels.push(...[...body.matchAll(/([A-Za-z_]\w*)\s*(?:=~|!~|!=|=)/g)].map(([, l]) => l));
  text = text.replace(/\{[^}]*\}/g, ' ');
  for (const [, list] of text.matchAll(/\b(?:by|without|on|ignoring)\s*\(([^)]*)\)/g)) labels.push(...list.split(',').map((l) => l.trim()));
  text = text.replace(/\b(?:by|without|on|ignoring)\s*\([^)]*\)/g, ' ');
  const variable = /label_values\(\s*[\w:]*\s*,\s*(\w+)\s*\)/.exec(text);
  if (variable) {
    labels.push(variable[1]);
    text = text.replace(/,\s*\w+\s*\)/, ')');
  }
  const metrics = [...text.matchAll(/(?<![$\w.])([A-Za-z_:][\w:]*)/g)].map(([, m]) => m).filter((m) => !PROMQL_WORDS.has(m));
  return { metrics, labels: labels.filter(Boolean) };
}

/** The span names, `span.*` keys and `resource.*` keys a TraceQL query names. */
function traceNames(query: string): { spans: string[]; attributes: string[]; resources: string[] } {
  const spans = [...query.matchAll(/(?<![\w.])name\s*(=~|!=|=)\s*"([^"]*)"/g)].flatMap(([, op, v]) => (op === '=~' ? v.split('|') : [v]));
  const attributes = [...query.matchAll(/\bspan\.([\w.]+)/g)].map(([, a]) => a);
  const resources = [...query.matchAll(/\bresource\.([\w.]+)/g)].map(([, a]) => a);
  return { spans, attributes, resources };
}

/** The labels a LogQL query makes for itself, each with its template as written: one for each stage that formats a label. */
const templatesMade = (query: string): Map<string, string> =>
  new Map(
    [...query.matchAll(/\|\s*label_format\s+([A-Za-z_]\w*)\s*=\s*"((?:[^"\\]|\\.)*)"/g)].map(([, label, template]) => [label, template]),
  );

/**
 * The labels a LogQL query makes for itself (`templatesMade`), each with the fields its template names, a field being a `.word` inside
 * the template's double braces, as `{{.step}}` and `{{ if .workflow }}` both name one.
 */
function labelsMade(query: string): Map<string, string[]> {
  const made = new Map<string, string[]>();
  for (const [label, template] of templatesMade(query))
    made.set(
      label,
      [...template.matchAll(/\{\{((?:[^}]|\}(?!\}))*)\}\}/g)].flatMap(([, body]) =>
        [...body.matchAll(/(?<![\w.])\.([A-Za-z_]\w*)/g)].map(([, field]) => field),
      ),
    );
  return made;
}

/**
 * The stream labels and the fields a LogQL query names: those it filters on, those the templates of its made labels read, and those
 * it counts by, but a label the query makes for itself (`labelsMade`).
 */
function logNames(query: string): string[] {
  const made = labelsMade(query);
  const text = query.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  const stream = /\{([^}]*)\}/.exec(text);
  const labels = [...(stream?.[1] ?? '').matchAll(/([A-Za-z_]\w*)\s*(?:=~|!~|!=|=)/g)].map(([, l]) => l);
  const fields = [...text.slice(stream ? stream.index + stream[0].length : 0).matchAll(/\|\s*([A-Za-z_]\w*)\s*(?:=~|!~|!=|=|>|<)/g)];
  const grouped = [...text.matchAll(/\b(?:by|without)\s*\(([^)]*)\)/g)].flatMap(([, list]) => list.split(',').map((l) => l.trim()));
  return [...labels, ...fields.map(([, f]) => f), ...[...made.values()].flat(), ...grouped.filter((l) => l && !made.has(l))];
}

/** The labels a LogQL query counts by: its first, outermost `by (…)` list. */
const countedBy = (query: string): string[] =>
  (/\bby\s*\(([^)]*)\)/.exec(query.replace(/"(?:[^"\\]|\\.)*"/g, '""'))?.[1] ?? '')
    .split(',')
    .map((l) => l.trim())
    .filter(Boolean);

/**
 * What would draw one nameless bar where `dashboard` means a bar for each series, each said in a line that starts with its panel's
 * title, for every bar gauge whose query is sent to Loki (as measured, `tools/observe/README.md`, *Counting a session's errors*).
 * Grafana hands the gauge an instant query's answer as one table, a row for each series: a gauge that does not read each row
 * (`values`) reduces the table to one value; a count by several labels names a bar by every label's value; a `legendFormat` is never
 * drawn; a gauge with no `limit` draws only the first rows; a table of one row draws its bar with no name unless the gauge's
 * `displayName` reads the row's label; and a range query's last point is not the range's count.
 */
function lokiGaugeFaults(dashboard: Dashboard): string[] {
  const faults: string[] = [];
  for (const p of lokiGauges(dashboard)) {
    for (const t of lokiTargets(p)) {
      if (t.queryType !== 'instant') faults.push(`${p.title}: a range query, whose last point is not the range's count`);
      const by = countedBy(t.expr ?? '');
      if (by.length !== 1) faults.push(`${p.title}: counts by ${by.join(', ') || 'no label'}, not by one label`);
      if (t.legendFormat !== undefined) faults.push(`${p.title}: a legendFormat, which Grafana never draws here`);
    }
    if (p.options?.reduceOptions?.values !== true) faults.push(`${p.title}: reduces Loki's table to one value`);
    if (typeof p.options?.reduceOptions?.limit !== 'number') faults.push(`${p.title}: no limit on the rows it draws`);
    const labels = [...new Set(lokiTargets(p).flatMap((t) => countedBy(t.expr ?? '')))];
    if (!labels.some((l) => p.fieldConfig?.defaults?.displayName === `\${__data.fields.${l}}`))
      faults.push(`${p.title}: a bar not named by its row's label, nameless when the table has one row`);
  }
  return faults;
}

/** The labels a Pyroscope label selector names, each with the value it asks for. */
const profileLabelsOf = (selector: string): [string, string][] =>
  [...selector.matchAll(/([A-Za-z_]\w*)\s*(?:=~|!~|!=|=)\s*"([^"]*)"/g)].map(([, label, value]) => [label, value]);

/** Every panel of `panels`, a row's own among them. */
const allPanels = (panels: Panel[]): Panel[] => panels.flatMap((p) => [p, ...allPanels(p.panels ?? [])]);

/** The targets of `panel` sent to Loki: by their own datasource, else the panel's. */
const lokiTargets = (panel: Panel): Target[] =>
  (panel.targets ?? []).filter((t) => (t.datasource?.uid ?? panel.datasource?.uid) === 'loki');

/** The bar gauges of `dashboard` with a query sent to Loki, in the dashboard's order. */
const lokiGauges = (dashboard: Dashboard): Panel[] =>
  allPanels(dashboard.panels).filter((p) => p.type === 'bargauge' && lokiTargets(p).length > 0);

/** The bar gauges of `dashboard`, in the dashboard's order. */
const barGauges = (dashboard: Dashboard): Panel[] => allPanels(dashboard.panels).filter((p) => p.type === 'bargauge');

/**
 * The titles of the bar gauges of `dashboard` that do not write a bar's name above it (`namePlacement`): beside its bar a name gets a
 * share of the panel's width and is cut there (as measured, `tools/observe/README.md`, *Counting a session's errors*), and a gauge
 * that says nothing is left to Grafana's own choice, which may put it beside.
 */
const namesBeside = (dashboard: Dashboard): string[] =>
  barGauges(dashboard)
    .filter((p) => p.options?.namePlacement !== 'top')
    .map((p) => p.title ?? '');

/** The text a variable's query names: a PromQL query as written, a Tempo tag-values query as the `span.` key whose values it reads. */
const variableText = (query: unknown): string => {
  const label = (query as { label?: unknown } | undefined)?.label;
  return typeof query === 'string' ? query : typeof label === 'string' ? `span.${label}` : JSON.stringify(query);
};

/** Every query `dashboard` sends: each panel's targets, and each query variable's. */
function queriesOf(dashboard: Dashboard): Query[] {
  const targets = allPanels(dashboard.panels).flatMap((p) =>
    (p.targets ?? []).map((t) => ({
      datasource: t.datasource?.uid ?? p.datasource?.uid ?? '',
      text: t.expr ?? t.query ?? t.labelSelector ?? '',
      ...(t.profileTypeId === undefined ? {} : { profileType: t.profileTypeId }),
    })),
  );
  const variables = (dashboard.templating?.list ?? [])
    .filter((v) => v.type === 'query')
    .map((v) => ({ datasource: v.datasource?.uid ?? '', text: variableText(v.query) }));
  return [...targets, ...variables];
}

/** The PromQL metric names `dashboard` queries. */
const promMetricsOf = (dashboard: Dashboard): Set<string> =>
  new Set(queriesOf(dashboard).flatMap((q) => (q.datasource === 'prometheus' ? promNames(q.text).metrics : [])));

/** Every name `dashboard`'s queries use that `known` does not hold, each once. */
function unknownNames(dashboard: Dashboard, known: Known): string[] {
  const unknown = new Set<string>();
  const check = (names: string[], set: Set<string>) => names.filter((n) => !set.has(n)).forEach((n) => unknown.add(n));
  for (const q of queriesOf(dashboard)) {
    if (q.datasource === 'prometheus') {
      const { metrics, labels } = promNames(q.text);
      check(metrics, known.metrics);
      check(labels, known.labels);
    } else if (q.datasource === 'tempo') {
      const { spans, attributes, resources } = traceNames(q.text);
      check(spans, known.spans);
      check(attributes, known.attributes);
      check(resources, known.resources);
    } else if (q.datasource === 'loki') check(logNames(q.text), known.logFields);
    else if (q.datasource === 'pyroscope') {
      check(
        profileLabelsOf(q.text).map(([label]) => label),
        known.profileLabels,
      );
      check([q.profileType ?? ''], known.profileTypes);
    }
  }
  return [...unknown];
}

/** Each `refId` a panel's server-side expressions read that is none of the panel's queries, said with its panel's title. */
function strayRefs(dashboard: Dashboard): string[] {
  return allPanels(dashboard.panels).flatMap((p) => {
    const refs = new Set((p.targets ?? []).map((t) => t.refId));
    return (p.targets ?? [])
      .filter((t) => t.datasource?.uid === EXPRESSIONS)
      .flatMap((t) => [...(t.expression ?? '').matchAll(/^\s*(\w+)\s*$|\$(\w+)/g)].map(([, bare, ref]) => bare ?? ref))
      .filter((ref) => !refs.has(ref))
      .map((ref) => `${p.title}: ${ref}`);
  });
}

/** Each span name in `shared` that `dashboard`'s Tempo queries name, each once. */
const sharedSpansOf = (dashboard: Dashboard, shared: Set<string>): string[] => [
  ...new Set(queriesOf(dashboard).flatMap((q) => (q.datasource === 'tempo' ? traceNames(q.text).spans.filter((n) => shared.has(n)) : []))),
];

/**
 * What would show a trace's length where `dashboard` means a span's, each said in a line: a Tempo table naming a span whose target is
 * not `tableType: "spans"` (Grafana's default, a missing one, is a row per trace, its Duration the trace's), or that sorts on any
 * field but its span's `Duration`.
 */
function spanTableFaults(dashboard: Dashboard): string[] {
  const faults: string[] = [];
  for (const p of allPanels(dashboard.panels).filter((p) => p.type === 'table')) {
    const targets = (p.targets ?? []).filter(
      (t) => (t.datasource?.uid ?? p.datasource?.uid) === 'tempo' && traceNames(t.query ?? '').spans.length > 0,
    );
    if (targets.length === 0) continue;
    for (const t of targets) if (t.tableType !== 'spans') faults.push(`${p.title}: a table of ${t.tableType ?? 'traces'}, not spans`);
    const sorts = (p.transformations ?? []).filter((x) => x.id === 'sortBy').flatMap((x) => x.options?.sort ?? []);
    for (const { field } of sorts) if (field !== 'Duration') faults.push(`${p.title}: sorted on ${field}, not its span's Duration`);
  }
  return faults;
}

/** Each metric `METRICS` holds that none of `dashboard`'s queries names in any of its forms, by its id. */
const unchartedMetrics = (dashboard: Dashboard): string[] => {
  const named = promMetricsOf(dashboard);
  return [...METRICS].filter(([, forms]) => !forms.some((f) => named.has(f))).map(([id]) => id);
};

/** The shipped dashboards, by file name. */
const DASHBOARDS: Map<string, Dashboard> = new Map(
  fs
    .readdirSync(path.join(OBSERVE, 'dashboards'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => [f, JSON.parse(fs.readFileSync(path.join(OBSERVE, 'dashboards', f), 'utf8')) as Dashboard]),
);

/** The shipped dashboard titled `title`, as a fresh copy a test may change. */
const dashboardTitled = (title: string): Dashboard => {
  const found = [...DASHBOARDS.values()].find((d) => d.title === title);
  assert.ok(found, `no dashboard titled ${title} among ${[...DASHBOARDS.values()].map((d) => d.title).join(', ')}`);
  return structuredClone(found);
};

/** A compose service, as far as the checker reads it. */
type Service = { image?: string; container_name?: string; ports?: string[]; volumes?: string[]; environment?: Record<string, string> };

/** The ports the daemon's collector and Grafana are reached on, each published on the same host port. */
const PORTS = [3000, 4317, 4318, 4040];

/** What is wrong with `compose`'s one service, each said in a line. */
function composeFaults(compose: { services?: Record<string, Service> }): string[] {
  const services = Object.values(compose.services ?? {});
  if (services.length !== 1) return [`${services.length} services, not one`];
  const [s] = services as [Service];
  const faults: string[] = [];
  if (!/^grafana\/otel-lgtm@sha256:[0-9a-f]{64}$/.test(s.image ?? '')) faults.push(`image ${s.image} is not pinned by a digest`);
  if (s.container_name !== 'nemia-lgtm') faults.push(`container_name ${s.container_name} is not nemia-lgtm`);
  for (const port of PORTS)
    if (!(s.ports ?? []).some((p) => new RegExp(`^(?:[\\d.]+:)?${port}:${port}$`).test(p))) faults.push(`port ${port} is not published`);
  return faults;
}

const COMPOSE = yaml.load(fs.readFileSync(path.join(OBSERVE, 'compose.yaml'), 'utf8')) as { services: Record<string, Service> };
const PROVIDER = yaml.load(fs.readFileSync(path.join(OBSERVE, 'provisioning', 'nemia.yaml'), 'utf8')) as {
  providers: { options: { path: string } }[];
};

test('the compose file brings up one stack, its image pinned by digest, on the ports the daemon exports to', () => {
  assert.deepEqual(composeFaults(COMPOSE), []);
  const [service] = Object.values(COMPOSE.services) as [Service];
  const mount = (from: string) => (service.volumes ?? []).find((v) => v.startsWith(`${from}:`))?.split(':')[1];
  assert.equal(mount('./provisioning/nemia.yaml'), '/otel-lgtm/grafana/conf/provisioning/dashboards/nemia.yaml');
  const dashboards = mount('./dashboards');
  assert.equal(dashboards, PROVIDER.providers[0]?.options.path, 'the provider reads the folder the dashboards are mounted at');
  const home = service.environment?.GF_DASHBOARDS_DEFAULT_HOME_DASHBOARD_PATH ?? '';
  assert.equal(path.dirname(home), dashboards);
  assert.equal(DASHBOARDS.get(path.basename(home))?.title, 'System', 'a person lands on System');
});

test('REFUSED: an image by tag, a short digest, and a port the daemon exports to left out', () => {
  const [service] = Object.values(COMPOSE.services) as [Service];
  const changed = (more: Service) => composeFaults({ services: { lgtm: { ...service, ...more } } });
  assert.deepEqual(changed({ image: 'grafana/otel-lgtm:latest' }), ['image grafana/otel-lgtm:latest is not pinned by a digest']);
  assert.deepEqual(changed({ image: 'grafana/otel-lgtm@sha256:2de1094c' }), [
    'image grafana/otel-lgtm@sha256:2de1094c is not pinned by a digest',
  ]);
  assert.deepEqual(changed({ ports: (service.ports ?? []).filter((p) => !p.endsWith(':4318')) }), ['port 4318 is not published']);
  assert.deepEqual(changed({ ports: (service.ports ?? []).filter((p) => !p.endsWith(':4040')) }), ['port 4040 is not published']);
});

test("each dashboard parses, has its own uid, and points at the image's datasources", () => {
  assert.deepEqual([...DASHBOARDS.values()].map((d) => d.title).sort(), ['A run', 'Passes', 'Steps', 'System', 'Time', 'Timeline']);
  assert.equal(new Set([...DASHBOARDS.values()].map((d) => d.uid)).size, DASHBOARDS.size);
  for (const [file, d] of DASHBOARDS) {
    assert.equal(
      fs.readFileSync(path.join(OBSERVE, 'dashboards', file), 'utf8').includes('${DS_'),
      false,
      `${file}: an export's placeholder`,
    );
    for (const p of allPanels(d.panels).filter((p) => p.type !== 'text' && p.type !== 'row'))
      assert.ok(DATASOURCES.includes(p.datasource?.uid ?? ''), `${file}: ${p.title} reads ${p.datasource?.uid}`);
    for (const q of queriesOf(d))
      assert.ok([...DATASOURCES, EXPRESSIONS].includes(q.datasource), `${file}: a query sent to ${q.datasource}`);
    assert.deepEqual(strayRefs(d), [], `${file}: an expression reading a query its panel has not`);
  }
});

test('REFUSED: an expression reading a query its panel has not', () => {
  const time = dashboardTitled('Time');
  const other = allPanels(time.panels)
    .flatMap((p) => p.targets ?? [])
    .find((t) => t.datasource?.uid === EXPRESSIONS && (t.expression ?? '').includes('$WN'));
  assert.ok(other, "Time's Other is an expression over WN");
  other.expression = other.expression!.replace('$WN', '$WX');
  assert.deepEqual(strayRefs(time), ['Where its time went: WX']);
});

test("the scan reads the code's metrics, and the traced pass the spans the dashboards query", () => {
  const ids = [...Object.values(PASS_METRICS), ...Object.values(STEP_METRICS)].map((m) => m.id);
  assert.deepEqual(
    [...ids, 'api.poll.reads'].filter((id) => !METRICS.has(id)),
    [],
  );
  assert.deepEqual(METRICS.get('step.cost'), ['step_cost_total']);
  assert.deepEqual(METRICS.get('machine.load'), ['machine_load_ratio']);
  assert.deepEqual(METRICS.get('subscription.wakes'), ['subscription_wakes'], 'a counter that is not incremental is a gauge, no suffix');
  for (const span of ['tick', 'pass', 'advancePass', 'fileReady', 'file', 'append']) assert.ok(TRACED.spans.has(span), span);
  assert.deepEqual([...TRACED.shared], ['tick'], "the orchestrator's tick, and the runtime engine's inside it");
  for (const key of ['run', 'step', 'task', 'kind']) assert.ok(TRACED.attributes.has(key), key);
  for (const key of ['run', 'step']) assert.ok(TRACED.annotations.has(key), key);
  assert.deepEqual([...KNOWN.labels].filter((l) => ['phase', 'route'].includes(l)).sort(), ['phase', 'route']);
});

test('the dashboards name only what the code emits', () => {
  for (const [file, d] of DASHBOARDS) assert.deepEqual(unknownNames(d, KNOWN), [], file);
  for (const d of DASHBOARDS.values()) {
    const service = d.templating?.list.find((v) => v.name === 'service');
    if (service) assert.equal(service.query, DEFAULT_SERVICE_NAME, `${d.title}: the service a daemon files under by default`);
  }
  const profiles = queriesOf(dashboardTitled('System')).filter((q) => q.datasource === 'pyroscope');
  assert.deepEqual(
    new Set(profiles.map((q) => q.profileType)),
    new Set(PROFILE_TYPES.filter((t) => t.startsWith('wall:cpu') || t.startsWith('memory:inuse_space'))),
    'System draws the CPU and the heap in use',
  );
  for (const q of profiles) assert.deepEqual(profileLabelsOf(q.text), [['service_name', '$service']], q.text);
});

test('a bar gauge over Loki reads each row of an instant query, named by one label', () => {
  for (const [file, d] of DASHBOARDS) assert.deepEqual(lokiGaugeFaults(d), [], file);
  assert.deepEqual(
    lokiGauges(dashboardTitled('Steps')).map((p) => p.title),
    [
      'Tool errors',
      'Failed skill loads',
      'Bash: exited non-zero',
      'Tool errors, across runs',
      'Failed skill loads, across runs',
      'Bash: exited non-zero, across runs',
    ],
  );
});

test("REFUSED: a bar gauge that reduces Loki's table to one value, counts by several labels, keeps a legendFormat, reads a range, sets no limit, or names no row", () => {
  const TITLE = 'Tool errors, across runs';
  const faultsWith = (change: (panel: Panel, target: Target) => void): string[] => {
    const steps = dashboardTitled('Steps');
    const panel = lokiGauges(steps).find((p) => p.title === TITLE);
    const target = panel?.targets?.[0];
    assert.ok(panel?.options?.reduceOptions && panel.fieldConfig?.defaults && target?.expr, `Steps has no ${TITLE}`);
    change(panel, target);
    return lokiGaugeFaults(steps);
  };
  const ONE_VALUE = `${TITLE}: reduces Loki's table to one value`;
  const SEVERAL = `${TITLE}: counts by workflow, name, not by one label`;
  const LEGEND = `${TITLE}: a legendFormat, which Grafana never draws here`;
  const RANGE = `${TITLE}: a range query, whose last point is not the range's count`;
  const NO_LIMIT = `${TITLE}: no limit on the rows it draws`;
  const NAMELESS = `${TITLE}: a bar not named by its row's label, nameless when the table has one row`;
  assert.deepEqual(
    faultsWith(() => {}),
    [],
  );
  assert.deepEqual(
    faultsWith((p) => (p.options!.reduceOptions!.values = false)),
    [ONE_VALUE],
  );
  assert.deepEqual(
    faultsWith((p) => delete p.options!.reduceOptions!.values),
    [ONE_VALUE],
  );
  assert.deepEqual(
    faultsWith((_, t) => (t.expr = t.expr!.replace('sum by (name)', 'sum by (workflow, name)'))),
    [SEVERAL],
  );
  assert.deepEqual(
    faultsWith((_, t) => (t.expr = t.expr!.replace('sum by (name) ', 'sum '))),
    [`${TITLE}: counts by no label, not by one label`, NAMELESS],
  );
  assert.deepEqual(
    faultsWith((_, t) => (t.legendFormat = '{{name}}')),
    [LEGEND],
  );
  assert.deepEqual(
    faultsWith((_, t) => (t.queryType = 'range')),
    [RANGE],
  );
  assert.deepEqual(
    faultsWith((_, t) => delete t.queryType),
    [RANGE],
  );
  assert.deepEqual(
    faultsWith((p) => delete p.options!.reduceOptions!.limit),
    [NO_LIMIT],
  );
  assert.deepEqual(
    faultsWith((p) => delete p.fieldConfig!.defaults!.displayName),
    [NAMELESS],
  );
  assert.deepEqual(
    faultsWith((p) => (p.fieldConfig!.defaults!.displayName = '${__data.fields.step}')),
    [NAMELESS],
  );
  const shipped = faultsWith((p, t) => {
    t.expr = t.expr!.replace('sum by (name)', 'sum by (factory, workflow, step, agent, tool_name)');
    t.legendFormat = '{{workflow}} / {{step}} · {{agent}} · {{tool_name}}';
    p.options!.reduceOptions = { values: false };
    delete p.fieldConfig!.defaults!.displayName;
  });
  assert.deepEqual(shipped, [
    `${TITLE}: counts by factory, workflow, step, agent, tool_name, not by one label`,
    LEGEND,
    ONE_VALUE,
    NO_LIMIT,
    NAMELESS,
  ]);
});

/** The values a dashboard's PromQL queries ask of the pass's `phase` label, each alternative of a regex its own. */
const phasesAsked = (dashboard: Dashboard): string[] =>
  queriesOf(dashboard)
    .filter((q) => q.datasource === 'prometheus')
    .flatMap((q) => [...q.text.matchAll(/\bphase\s*(?:=~|!~|!=|=)\s*"([^"]*)"/g)].flatMap(([, v]) => v.split('|')));

/** The phases a dashboard asks for that the meter has none of (`PHASES`). */
const strangePhases = (dashboard: Dashboard): string[] => phasesAsked(dashboard).filter((p) => !(PHASES as readonly string[]).includes(p));

test("the dashboards ask the pass's phase label only for a phase the meter has", () => {
  for (const [file, d] of DASHBOARDS) assert.deepEqual(strangePhases(d), [], file);
});

/** The fields of a target that hold what it asks for. */
const TARGET_FIELDS = ['expr', 'query', 'labelSelector', 'profileTypeId'] as const;

/** `dashboard` with the first query sent to `datasource` holding `from` holding `to` in its place. */
function withQuery(dashboard: Dashboard, datasource: string, from: string, to: string): Dashboard {
  const found = allPanels(dashboard.panels)
    .flatMap((p) => (p.targets ?? []).map((t) => ({ t, uid: t.datasource?.uid ?? p.datasource?.uid })))
    .flatMap(({ t, uid }) => (uid === datasource ? TARGET_FIELDS.map((field) => ({ t, field })) : []))
    .find(({ t, field }) => (t[field] ?? '').includes(from));
  assert.ok(found, `no ${datasource} query of ${dashboard.title} holds ${from}`);
  found.t[found.field] = found.t[found.field]!.replace(from, to);
  return dashboard;
}

test('REFUSED: a renamed metric, span or attribute, an unbounded label, a log field the code does not annotate, and a profile not sent', () => {
  const cases: [string, string, string, string, string][] = [
    ['System', 'prometheus', 'pass_duration_bucket', 'pass_durations_bucket', 'pass_durations_bucket'],
    ['Passes', 'tempo', 'name="pass"', 'name="passes"', 'passes'],
    ['A run', 'tempo', 'span.run', 'span.runid', 'runid'],
    ['System', 'prometheus', 'by (factory, workflow, step, agent)', 'by (run)', 'run'],
    ['A run', 'loki', '| run=', '| runid=', 'runid'],
    ['System', 'pyroscope', 'wall:cpu:nanoseconds', 'process_cpu:cpu:nanoseconds', 'process_cpu:cpu:nanoseconds:wall:nanoseconds'],
    ['System', 'pyroscope', 'service_name=', 'service=', 'service'],
    ['Time', 'tempo', 'name="claude_code.llm_request"', 'name="claude_code.llm_call"', 'claude_code.llm_call'],
    ['Time', 'tempo', 'span.command_head', 'span.bash_head', 'bash_head'],
    ['Time', 'prometheus', 'sum by (command_head)', 'sum by (run)', 'run'],
    ['Time', 'tempo', 'span.test_scope', 'span.bash_scope', 'bash_scope'],
    ['Time', 'prometheus', 'sum by (test_scope)', 'sum by (bash_scope)', 'bash_scope'],
    ['Time', 'prometheus', 'traces_spanmetrics_latency_sum', 'traces_spanmetrics_duration_sum', 'traces_spanmetrics_duration_sum'],
    ['Steps', 'tempo', `name="${DENIED_SPAN}"`, 'name="step.denid"', 'step.denid'],
    ['Steps', 'tempo', 'span.tool', 'span.tol', 'tol'],
    ['Steps', 'tempo', 'span.call', 'span.text', 'text'],
    ['System', 'tempo', 'span.tool', 'span.tol', 'tol'],
    ['Steps', 'loki', '| success=', '| succeeded=', 'succeeded'],
    ['Steps', 'loki', '{{.tool_name}}', '{{.tool}}', 'tool'],
    ['Steps', 'loki', '{{ if .workflow }}', '{{ if .workflows }}', 'workflows'],
    ['Steps', 'loki', 'sum by (name)', 'sum by (named)', 'named'],
    ['Timeline', 'tempo', `name="${TIMELINE_SPAN}"`, 'name="run.timelines"', 'run.timelines'],
    ['Timeline', 'tempo', 'by (span.row)', 'by (span.rows)', 'rows'],
  ];
  for (const [title, datasource, from, to, named] of cases)
    assert.deepEqual(unknownNames(withQuery(dashboardTitled(title), datasource, from, to), KNOWN), [named], `${title}: ${to}`);
  const run = dashboardTitled('A run');
  const variable = run.templating?.list.find((v) => v.name === 'run');
  assert.ok(variable, 'A run picks its run');
  variable.query = { ...(variable.query as object), label: 'runid' };
  assert.deepEqual(unknownNames(run, KNOWN), ['runid'], 'A run: a variable reading the tag runid');
});

test("REFUSED: a dashboard asking for the pass's former git phase", () => {
  const system = withQuery(dashboardTitled('System'), 'prometheus', 'pass_phase_duration_sum{', 'pass_phase_duration_sum{phase="git", ');
  assert.deepEqual(strangePhases(system), ['git']);
});

test("a table of spans shows each span's own duration, and no query names a span two layers emit", () => {
  for (const [file, d] of DASHBOARDS) {
    assert.deepEqual(spanTableFaults(d), [], file);
    assert.deepEqual(sharedSpansOf(d, TRACED.shared), [], file);
  }
});

test("REFUSED: a table of a span's traces, a table left to Grafana's default, one sorted off the span, and a query on tick", () => {
  const passes = () => dashboardTitled('Passes');
  const target = (d: Dashboard, title: string): Target => {
    const found = allPanels(d.panels).find((p) => p.title === title)?.targets?.[0];
    assert.ok(found, `Passes has no ${title}`);
    return found;
  };
  const traces = passes();
  target(traces, 'Slowest passes').tableType = 'traces';
  assert.deepEqual(spanTableFaults(traces), ['Slowest passes: a table of traces, not spans']);
  const bare = passes();
  delete target(bare, 'Slowest passes').tableType;
  assert.deepEqual(spanTableFaults(bare), ['Slowest passes: a table of traces, not spans']);
  const sorted = passes();
  const runs = allPanels(sorted.panels).find((p) => p.title === 'Slowest runs in a pass');
  const sort = runs?.transformations?.find((x) => x.id === 'sortBy')?.options?.sort?.[0];
  assert.ok(sort, 'Slowest runs in a pass sorts');
  sort.field = 'Start time';
  assert.deepEqual(spanTableFaults(sorted), ["Slowest runs in a pass: sorted on Start time, not its span's Duration"]);
  const tick = withQuery(passes(), 'tempo', 'name="pass"', 'name="tick"');
  assert.deepEqual(unknownNames(tick, KNOWN), [], 'tick is a name the code emits');
  assert.deepEqual(sharedSpansOf(tick, TRACED.shared), ['tick']);
});

test('System charts every metric the code exports', () => {
  assert.deepEqual(unchartedMetrics(dashboardTitled('System')), []);
  const system = dashboardTitled('System');
  const keep = (panels: Panel[]): Panel[] =>
    panels
      .filter((p) => !(p.targets ?? []).some((t) => (t.expr ?? '').includes('step_rounds_total')))
      .map((p) => ({ ...p, panels: keep(p.panels ?? []) }));
  system.panels = keep(system.panels);
  assert.deepEqual(unchartedMetrics(system), ['step.rounds']);
  assert.equal(METRICS.has(DENIED_SPAN), false, 'a denied call is a span, and no metric to chart');
});

/** The values a TraceQL query asks of the span attribute `key`, each alternative of a regex its own. */
const askedOf = (query: string, key: string): string[] =>
  [...query.matchAll(new RegExp(`\\bspan\\.${key}\\s*(?:=~|!~|!=|=)\\s*"([^"]*)"`, 'g'))].flatMap(([, v]) => v.split('|'));

/**
 * What would make `dashboard` read a finished run's timeline (`TIMELINE_SPAN`) wrong, each said in a line: a query of it asking its `of`
 * or its `part` for a value the code gives none of (`TIMELINE_OF`, `TIMELINE_PARTS`), which would draw nothing and say so nowhere; a
 * query not held to the one factory and the one workflow picked, whose rows would be averaged with those of another workflow, or of a
 * workflow of the same name in another factory; and a `factory` or a `workflow` choice that may hold more than one.
 */
function timelineFaults(dashboard: Dashboard): string[] {
  const queries = queriesOf(dashboard).filter((q) => q.datasource === 'tempo' && traceNames(q.text).spans.includes(TIMELINE_SPAN));
  if (queries.length === 0) return [];
  const strange = (key: string, known: readonly string[]) =>
    queries.flatMap((q) =>
      askedOf(q.text, key)
        .filter((v) => !known.includes(v))
        .map((v) => `span.${key}="${v}" is no ${key} of a timeline`),
    );
  const one = ['factory', 'workflow'];
  const loose = one.flatMap((name) =>
    queries.filter((q) => !q.text.includes(`span.${name}="$${name}"`)).map((q) => `not held to one ${name}: ${q.text}`),
  );
  const picks = one.flatMap((name) => {
    const pick = dashboard.templating?.list.find((v) => v.name === name);
    return pick?.includeAll === false && pick.multi === false ? [] : [`its ${name} choice may hold more than one ${name}`];
  });
  return [...new Set([...strange('of', TIMELINE_OF), ...strange('part', TIMELINE_PARTS), ...loose, ...picks])];
}

test("Timeline reads a finished run's timeline by the values the code gives, for one workflow of one factory at a time", () => {
  for (const [file, d] of DASHBOARDS) assert.deepEqual(timelineFaults(d), [], file);
  const queries = queriesOf(dashboardTitled('Timeline')).filter((q) => q.datasource === 'tempo');
  assert.ok(queries.length > 0 && queries.every((q) => traceNames(q.text).spans.includes(TIMELINE_SPAN)), 'every panel reads the span');
  const asked = (key: string) => [...new Set(queries.flatMap((q) => askedOf(q.text, key)))].sort();
  assert.deepEqual(asked('of'), [...TIMELINE_OF].sort(), 'each kind of row is drawn');
  assert.deepEqual(
    asked('part'),
    ['cost', 'queued', 'ran', 'tries', 'wall'],
    "the run's check, gate and answer are drawn by its part, unasked",
  );
});

/** The parts a run's own rows have, as the code names them: every part but a session's time at work, its cost and a step's tries. */
const RUN_PARTS = TIMELINE_PARTS.filter((part) => part !== 'ran' && part !== 'cost' && part !== 'tries');

/**
 * The name the panel titled `title` of `dashboard` draws each of a run's parts under: the series Tempo answers for it, by its part,
 * through the panel's `renameByRegex` transformations, in their order.
 */
function runBarNames(dashboard: Dashboard, title: string): Record<string, string> {
  const renames = (dashboard.panels.find((p) => p.title === title)?.transformations ?? []).filter((x) => x.id === 'renameByRegex');
  const named = (series: string) =>
    renames.reduce((name, x) => name.replace(new RegExp(x.options?.regex ?? '$^'), x.options?.renamePattern ?? ''), series);
  return Object.fromEntries(RUN_PARTS.map((part) => [part, named(`{span.part="${part}"}`)]));
}

test('A run: wall and waiting names each part of a run the code gives that is a wait as waiting, and a part it leaves out is refused', () => {
  const names = runBarNames(dashboardTitled('Timeline'), 'A run: wall and waiting');
  assert.deepEqual(names, {
    wall: 'wall',
    queued: 'waiting: queue',
    check: 'waiting: check',
    gate: 'waiting: gate',
    answer: 'waiting: answer',
  });
  assert.deepEqual(Object.keys(names).sort(), [...RUN_PARTS].sort(), "every part of a run's rows is named");
  const without = dashboardTitled('Timeline');
  const rename = without.panels
    .find((p) => p.title === 'A run: wall and waiting')
    ?.transformations?.find((x) => x.options?.regex?.includes('answer'));
  assert.ok(rename?.options?.regex, 'a rename that names the answer');
  rename.options.regex = rename.options.regex.replace('|answer', '');
  assert.equal(runBarNames(without, 'A run: wall and waiting').answer, 'answer', 'REFUSED: a rename without it draws a bare answer');
});

test('REFUSED: a Timeline query for a part or a kind the code gives none of, one of every workflow or factory, and a choice of several', () => {
  const timeline = () => dashboardTitled('Timeline');
  assert.deepEqual(timelineFaults(withQuery(timeline(), 'tempo', 'span.part="ran"', 'span.part="run"')), [
    'span.part="run" is no part of a timeline',
  ]);
  assert.deepEqual(timelineFaults(withQuery(timeline(), 'tempo', 'span.of=~"try|check"', 'span.of=~"try|checks"')), [
    'span.of="checks" is no of of a timeline',
  ]);
  const every = withQuery(timeline(), 'tempo', 'span.workflow="$workflow"', 'span.workflow=~".*"');
  assert.equal(timelineFaults(every).length, 1);
  assert.match(timelineFaults(every)[0], /^not held to one workflow: /);
  const allFactories = withQuery(timeline(), 'tempo', 'span.factory="$factory"', 'span.factory=~"$factory"');
  assert.equal(timelineFaults(allFactories).length, 1);
  assert.match(timelineFaults(allFactories)[0], /^not held to one factory: /);
  for (const name of ['factory', 'workflow']) {
    for (const key of ['includeAll', 'multi'] as const) {
      const several = timeline();
      const pick = several.templating?.list.find((v) => v.name === name);
      assert.ok(pick, `Timeline picks a ${name}`);
      pick[key] = true;
      assert.deepEqual(timelineFaults(several), [`its ${name} choice may hold more than one ${name}`], `${name}: ${key} alone`);
    }
  }
});

/** The four choices a step is picked by across runs, each a variable of the dashboards and a label of a session. */
const STEP_PICKS = ['factory', 'workflow', 'step', 'agent'];

/**
 * What one counting query of a dashboard counts of a step's sessions, read off its text: the calls they were denied (the daemon's
 * `DENIED_SPAN`), their tool errors (the sessions' failed `tool_result` events) or, of those, their failed skill loads or the `Bash`
 * tool's alone, a command that exited non-zero; whether a count of tool errors leaves the `Bash` tool's out (`apart`); for what —
 * the run and session picked (`run`), the steps picked across runs (`across`), or neither, which is `unscoped`; and whether it says the
 * tool, by counting by it, or by a label made from it (`labelsMade`), or, for a skill load, by asking for the `Skill` tool alone; and
 * whether a skill load says its skill, by counting by a label whose template (`templatesMade`) reads `SKILL_KEY` out of the tool's
 * parameters, and not by the parameters' raw text.
 */
type Counted = {
  what: 'denied' | 'errors' | 'skills' | 'bash';
  scope: 'run' | 'across' | 'unscoped';
  tool: boolean;
  skill: boolean;
  apart: boolean;
};

/** Whether the LogQL query `text` keeps, of its lines, only those whose `tool_name` is (`=`) or is not (`!=`) `tool`. */
const asksTool = (text: string, op: '=' | '!=', tool: string): boolean => new RegExp(`\\|\\s*tool_name\\s*${op}\\s*"${tool}"`).test(text);

/** The key of a `Skill` call's parameters that holds the skill's name, as measured (`{"skill_name":"…"}`). */
const SKILL_KEY = 'skill_name';

/** Each query of `dashboard` that counts denied calls, tool errors or failed skill loads (`Counted`), in the dashboard's order. */
function countedOf(dashboard: Dashboard): Counted[] {
  return queriesOf(dashboard).flatMap((q): Counted[] => {
    if (!q.text.includes('count_over_time')) return [];
    const denied = q.datasource === 'tempo' && traceNames(q.text).spans.includes(DENIED_SPAN);
    const errors = q.datasource === 'loki' && /\|\s*event_name\s*=\s*"tool_result"\s*\|\s*success\s*=\s*"false"/.test(q.text);
    if (!denied && !errors) return [];
    if (errors && !q.text.includes(`{service_name="${CLAUDE_SERVICE}"}`)) return [];
    const filter = (name: string, op: string, value: string) =>
      new RegExp(denied ? `\\bspan\\.${name}\\s*${op}\\s*"\\$${value}"` : `\\|\\s*${name}\\s*${op}\\s*"\\$${value}"`).test(q.text);
    const scope =
      filter('run', '=', 'run') && filter('task', '=~', 'session')
        ? 'run'
        : STEP_PICKS.every((name) => filter(name, '=~', name))
          ? 'across'
          : 'unscoped';
    const skills = errors && asksTool(q.text, '=', 'Skill');
    const bash = errors && asksTool(q.text, '=', 'Bash');
    const made = labelsMade(q.text);
    const tool =
      skills ||
      (denied ? /\bby\s*\([^)]*span\.tool\b/.test(q.text) : countedBy(q.text).some((l) => (made.get(l) ?? [l]).includes('tool_name')));
    const skill =
      skills &&
      countedBy(q.text)
        .map((l) => templatesMade(q.text).get(l) ?? '')
        .some((template) => /\.tool_parameters\b/.test(template) && template.includes(SKILL_KEY));
    const what = denied ? 'denied' : skills ? 'skills' : bash ? 'bash' : 'errors';
    return [{ what, scope, tool, skill, apart: what !== 'errors' || asksTool(q.text, '!=', 'Bash') }];
  });
}

/** `Counted`, each in a word, sorted: a count of tool errors that does not leave the `Bash` tool's out says so. */
const countedWords = (dashboard: Dashboard): string[] =>
  countedOf(dashboard)
    .map((c) => `${c.what} ${c.scope}${c.skill ? ' by skill' : c.tool ? ' by tool' : ''}${c.apart ? '' : ', Bash among them'}`)
    .sort();

const STEPS_COUNTED = [
  'bash across',
  'bash run',
  'denied across by tool',
  'denied run by tool',
  'errors across by tool',
  'errors run by tool',
  'skills across by skill',
  'skills run by skill',
];

/** The reading of a skill's name out of a `Skill` call's parameters, as Steps' template holds it. */
const SKILL_READ = '{{ regexReplaceAll \\"^.*skill_name[^a-zA-Z0-9_]+([-a-zA-Z0-9_:./]+).*$\\" .tool_parameters \\"${1}\\" }}';

test("Steps counts denied calls and tool errors by tool, and failed skill loads by skill, for one run's session and across runs", () => {
  assert.deepEqual(countedWords(dashboardTitled('Steps')), STEPS_COUNTED);
  assert.deepEqual(countedWords(dashboardTitled('System')), ['denied across by tool'], "System's Denied calls reads the same spans");
  for (const d of [dashboardTitled('Steps'), dashboardTitled('System')])
    for (const q of queriesOf(d).filter((q) => q.datasource === 'prometheus'))
      assert.equal(q.text.includes('denied'), false, `${d.title}: no counter of denied calls is read: ${q.text}`);
});

test('REFUSED: a count that drops its session, one of its four choices, its tool, or its skill', () => {
  const changed = (datasource: string, from: string, to: string) => countedWords(withQuery(dashboardTitled('Steps'), datasource, from, to));
  const without = (word: string, instead: string) => [...STEPS_COUNTED.filter((w) => w !== word), instead].sort();
  assert.deepEqual(changed('tempo', ' && span.task=~"$session"', ''), without('denied run by tool', 'denied unscoped by tool'));
  assert.deepEqual(changed('tempo', 'span.run="$run"', 'span.run=~".+"'), without('denied run by tool', 'denied unscoped by tool'));
  assert.deepEqual(changed('loki', ' | task=~"$session"', ''), without('errors run by tool', 'errors unscoped by tool'));
  assert.deepEqual(changed('tempo', ' && span.agent=~"$agent"', ''), without('denied across by tool', 'denied unscoped by tool'));
  assert.deepEqual(changed('loki', ' | workflow=~"$workflow"', ''), without('errors across by tool', 'errors unscoped by tool'));
  assert.deepEqual(changed('tempo', 'by (span.tool, span.call)', 'by (span.call)'), without('denied run by tool', 'denied run'));
  assert.deepEqual(changed('loki', ' · {{.tool_name}}', ''), without('errors run by tool', 'errors run'));
  assert.deepEqual(changed('loki', SKILL_READ, '{{.tool_parameters}}'), without('skills run by skill', 'skills run by tool'));
  assert.deepEqual(changed('loki', `${SKILL_READ}" [`, '{{.step}}" ['), without('skills run by skill', 'skills run by tool'));
});

test('REFUSED: a count of tool errors that lets Bash back in, and a count of Bash that drops its tool, its session or one of its four choices', () => {
  const changed = (from: string, to: string) => countedWords(withQuery(dashboardTitled('Steps'), 'loki', from, to));
  const without = (word: string, instead: string) => [...STEPS_COUNTED.filter((w) => w !== word), instead].sort();
  const BASH = ' | tool_name="Bash"';
  const RUN = `${BASH} | run="$run"`;
  const ACROSS = `${BASH} | factory=~"$factory"`;
  assert.deepEqual(
    changed(' | tool_name!="Bash" | run="$run"', ' | run="$run"'),
    without('errors run by tool', 'errors run by tool, Bash among them'),
  );
  assert.deepEqual(
    changed(' | tool_name!="Bash" | factory=~"$factory"', ' | factory=~"$factory"'),
    without('errors across by tool', 'errors across by tool, Bash among them'),
  );
  assert.deepEqual(changed(RUN, ' | run="$run"'), without('bash run', 'errors run, Bash among them'));
  assert.deepEqual(changed(`${RUN} | task=~"$session"`, RUN), without('bash run', 'bash unscoped'));
  assert.deepEqual(changed(ACROSS, ' | factory=~"$factory"'), without('bash across', 'errors across, Bash among them'));
  assert.deepEqual(changed(`${ACROSS} | workflow=~"$workflow"`, ACROSS), without('bash across', 'bash unscoped'));
});

const STEPS_BARS = [
  'Input tokens',
  'Output tokens',
  'Denied calls',
  'Tool errors',
  'Failed skill loads',
  'Bash: exited non-zero',
  'Denied calls, across runs',
  'Tool errors, across runs',
  'Failed skill loads, across runs',
  'Bash: exited non-zero, across runs',
];

test('Steps names each bar above it', () => {
  assert.deepEqual(
    barGauges(dashboardTitled('Steps')).map((p) => p.title),
    STEPS_BARS,
  );
  assert.deepEqual(namesBeside(dashboardTitled('Steps')), []);
});

test("REFUSED: a bar of Steps named beside it, or left to Grafana's choice", () => {
  const TITLE = 'Failed skill loads';
  const besideWith = (change: (panel: Panel) => void): string[] => {
    const steps = dashboardTitled('Steps');
    const panel = barGauges(steps).find((p) => p.title === TITLE);
    assert.ok(panel?.options, `Steps has no ${TITLE}`);
    change(panel);
    return namesBeside(steps);
  };
  assert.deepEqual(
    besideWith((p) => (p.options!.namePlacement = 'left')),
    [TITLE],
  );
  assert.deepEqual(
    besideWith((p) => (p.options!.namePlacement = 'auto')),
    [TITLE],
  );
  assert.deepEqual(
    besideWith((p) => delete p.options!.namePlacement),
    [TITLE],
  );
});

/** The tag each of a dashboard's `run` and `session` variables reads its values from, and what the session's All stands for. */
const picksOf = (dashboard: Dashboard): unknown[] =>
  ['run', 'session'].map((name) => {
    const variable = dashboard.templating?.list.find((v) => v.name === name) as
      | { query?: { label?: string }; allValue?: string }
      | undefined;
    return [name, variable?.query?.label, variable?.allValue];
  });

test("Steps picks a run and a session as Time does: the run's tag, and the runtime's task", () => {
  assert.deepEqual(picksOf(dashboardTitled('Steps')), [
    ['run', 'run', undefined],
    ['session', 'task', '.*'],
  ]);
  assert.deepEqual(picksOf(dashboardTitled('Steps')), picksOf(dashboardTitled('Time')));
  const steps = dashboardTitled('Steps');
  const session = steps.templating?.list.find((v) => v.name === 'session');
  assert.ok(session, 'Steps picks a session');
  session.query = { ...(session.query as object), label: 'session' };
  assert.deepEqual(unknownNames(steps, KNOWN), ['session'], 'REFUSED: a session read from a tag no span carries');
  assert.notDeepEqual(picksOf(steps), picksOf(dashboardTitled('Time')));
});

/** A dashboard's links, as far as the checker reads them. */
type Link = { type: string; url?: string; title?: string };

test('Steps and A run link to Time, with their own choices', () => {
  const texts = allPanels(dashboardTitled('Steps').panels).filter((p) => p.type === 'text');
  const steps = texts.map((p) => p.options?.content ?? '').find((c) => c.includes('/d/nemia-time?'));
  assert.ok(steps, "Steps' note links to Time");
  for (const name of ['factory', 'workflow', 'step', 'agent']) assert.ok(steps.includes(`\${${name}:queryparam}`), name);
  assert.ok(steps.includes('${__url_time_range}'), "Steps' range");
  const links = (dashboardTitled('A run') as Dashboard & { links?: Link[] }).links ?? [];
  assert.ok(
    links.some((l) => l.type === 'link' && (l.url ?? '').startsWith('/d/nemia-time?') && (l.url ?? '').includes('var-run=${run}')),
    'A run links to Time for its run',
  );
});

/** The span attribute the collector's transforms read, as measured, which a session sends only under `NEMIA_TOOL_DETAILS=1`. */
const COLLECTOR_READS = ['full_command'];

/** The attribute of a seeded span a label is drawn from: the collector's own are derived from the command it reads. */
const seededKey = (label: string): string => (COLLECTOR_ATTRIBUTES.includes(label) ? COLLECTOR_READS[0] : label);

/** Every span of `spans`, those under each among them. */
const spansUnder = (spans: readonly SpanSeed[]): SpanSeed[] => spans.flatMap((span) => [span, ...spansUnder(span.children ?? [])]);

/** A log field as Loki shows a log attribute: its dots underscores. */
const lokiField = (key: string): string => key.replace(/\./g, '_');

/** The form Prometheus shows of a seeded metric of `kind`, among the forms of the code's metric. */
const formOf = (forms: readonly string[], kind: string): string | undefined =>
  forms.find((form) =>
    kind === 'histogram'
      ? form.endsWith('_bucket')
      : kind === 'gauge'
        ? form.endsWith('_ratio')
        : form.endsWith('_total') === (kind === 'total'),
  );

/** Every name `seed` sends that `known` does not hold or the code gives another kind, each once. */
function seedUnknown(seed: readonly ServiceSeed[], known: Known): string[] {
  const unknown = new Set<string>();
  const check = (names: string[], set: Set<string>) => names.filter((n) => !set.has(n)).forEach((n) => unknown.add(n));
  for (const said of seed) {
    check([said.service], new Set([DEFAULT_SERVICE_NAME, CLAUDE_SERVICE]));
    for (const metric of said.metrics) {
      if (formOf(METRICS.get(metric.name) ?? [], metric.kind) === undefined) unknown.add(metric.name);
      check(
        metric.series.flatMap(([attributes]) => Object.keys(attributes)),
        known.labels,
      );
    }
    for (const span of spansUnder(said.spans)) {
      check([span.name], known.spans);
      check(Object.keys(span.attributes), new Set([...known.attributes, ...COLLECTOR_READS]));
    }
    check(
      said.logs.flatMap((log) => Object.keys(log.attributes).map(lokiField)),
      known.logFields,
    );
  }
  return [...unknown];
}

/** How many series rows of attributes make when kept by `labels`: the distinct tuples of their values, a missing one its own. */
const seriesBy = (rows: readonly Record<string, string | number>[], labels: readonly string[]): number =>
  new Set(rows.map((row) => labels.map((label) => row[seededKey(label)] ?? '').join('\u0000'))).size;

/** The labels each `by (…)` of `text` keeps, `strip` taken off the front of each, a bucket's bound and any without it left out. */
const keptBy = (text: string, strip = ''): string[][] =>
  [...text.matchAll(/\bby\s*\(([^)]*)\)/g)]
    .map(([, list]) => list.split(',').map((label) => label.trim()))
    .map((labels) => labels.filter((label) => label.startsWith(strip) && label !== 'le').map((label) => label.slice(strip.length)))
    .filter((labels) => labels.length > 0);

/** The labels a LogQL query makes by formatting one, each with the fields its template reads. */
const madeLabels = (text: string): Map<string, string[]> =>
  new Map(
    [...text.matchAll(/label_format\s+(\w+)="((?:[^"\\]|\\.)*)"/g)].map(([, label, template]) => [
      label,
      [...new Set([...template.matchAll(/\.(\w+)/g)].map(([, field]) => field))],
    ]),
  );

/** What `seed` holds, as a query would find it: its metrics by the name Prometheus shows, its spans by name, its logs by service. */
function seeded(seed: readonly ServiceSeed[]) {
  const spans = seed.flatMap((said) => spansUnder(said.spans));
  const metrics = new Map<string, Record<string, string | number>[]>();
  for (const metric of seed.flatMap((said) => said.metrics)) {
    const base = formOf(METRICS.get(metric.name) ?? [], metric.kind)?.replace(/_bucket$/, '') ?? metric.name;
    const forms = metric.kind === 'histogram' ? [`${base}_bucket`, `${base}_count`, `${base}_sum`] : [base];
    for (const form of forms)
      metrics.set(
        form,
        metric.series.map(([attributes]) => attributes),
      );
  }
  const sessions = spans.filter((span) => CLAUDE_SPANS.includes(span.name)).map((span) => span.attributes);
  for (const form of sessions.length ? SPAN_METRICS : []) metrics.set(form, sessions);
  const logs = (service: string) =>
    seed.filter((said) => said.service === service).flatMap((said) => said.logs.map((log) => log.attributes));
  return { spans, metrics, logs };
}

/**
 * The rows of `rows` a LogQL query's filters keep, as far as `text` says them with a literal: each `| <field>="<value>"` and
 * `| <field>!="<value>"` after its stream selector, a field a row does not carry read as the empty string. A value that reads a
 * variable (`$`) keeps every row, and so does a filter by a pattern (`=~`, `!~`).
 */
function keptRows(text: string, rows: readonly Record<string, string | number>[]): Record<string, string | number>[] {
  const filters = [...text.slice(text.indexOf('}') + 1).matchAll(/\|\s*([A-Za-z_]\w*)\s*(!=|=)\s*"((?:[^"\\]|\\.)*)"/g)]
    .map(([, field, op, value]) => ({ field, op, value }))
    .filter(({ value }) => !value.includes('$'));
  return rows.filter((row) => filters.every(({ field, op, value }) => (String(row[field] ?? '') === value) === (op === '=')));
}

/**
 * Why `seed` does not meet the query `text` sent to `datasource`: a name it does not hold, or one series where the query keeps several,
 * counted for a LogQL query over the rows its literal filters keep (`keptRows`).
 */
function unmetQuery(datasource: string, text: string, seed: readonly ServiceSeed[]): string[] {
  const has = seeded(seed);
  if (datasource === 'prometheus') {
    const named = promNames(text).metrics;
    const rows = named.flatMap((metric) => has.metrics.get(metric) ?? []);
    const few = keptBy(text).filter((labels) => seriesBy(rows, labels) < 2);
    return [...named.filter((metric) => !has.metrics.has(metric)), ...few.map((labels) => `one series by ${labels.join(', ')}`)];
  }
  if (datasource === 'tempo') {
    const named = traceNames(text).spans;
    const rows = has.spans.filter((span) => named.includes(span.name)).map((span) => span.attributes);
    const few = keptBy(text, 'span.').filter((labels) => seriesBy(rows, labels) < 2);
    return [
      ...named.filter((name) => !has.spans.some((span) => span.name === name)),
      ...few.map((labels) => `one series by ${labels.join(', ')}`),
    ];
  }
  if (datasource !== 'loki') return [`nothing sent to ${datasource}`];
  const service = /service_name="([^"]*)"/.exec(text)?.[1].replace('$service', DEFAULT_SERVICE_NAME) ?? '';
  const rows = has.logs(service).map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [lokiField(key), value])));
  const fields = new Set([...rows.flatMap((row) => Object.keys(row)), ...LOKI_FIELDS]);
  const made = madeLabels(text);
  const kept = keptRows(text, rows);
  const few = keptBy(text)
    .map((labels) => labels.flatMap((label) => made.get(label) ?? [label]))
    .filter((labels) => seriesBy(kept, labels) < 2);
  return [...logNames(text).filter((field) => !fields.has(field)), ...few.map((labels) => `one series by ${labels.join(', ')}`)];
}

/** An entry of the render's unseeded panels. */
type Unseeded = (typeof UNSEEDED)[number];

/** Each panel of the dashboard in the file `name` that `seed` does not meet and `unseeded` does not list, as `<title>: <why>`. */
function unmet(dashboard: Dashboard, name: string, seed: readonly ServiceSeed[], unseeded: readonly Unseeded[] = UNSEEDED): string[] {
  const listed = (panel: Panel) => unseeded.some((entry) => entry.dashboard === name && entry.panel === panel.title);
  return allPanels(dashboard.panels)
    .filter((panel) => !listed(panel))
    .flatMap((panel) =>
      (panel.targets ?? [])
        .filter((target) => target.datasource?.uid !== EXPRESSIONS)
        .flatMap((target) =>
          unmetQuery(
            target.datasource?.uid ?? panel.datasource?.uid ?? '',
            target.expr ?? target.query ?? target.labelSelector ?? '',
            seed,
          ),
        )
        .map((why) => `${panel.title}: ${why}`),
    );
}

/** Each entry of `unseeded` that names no panel of the shipped dashboards, as `<dashboard>: <panel>`. */
const strayUnseeded = (unseeded: readonly Unseeded[]): string[] =>
  unseeded
    .filter((entry) => !allPanels(DASHBOARDS.get(`${entry.dashboard}.json`)?.panels ?? []).some((panel) => panel.title === entry.panel))
    .map((entry) => `${entry.dashboard}: ${entry.panel}`);

test("the render's seed sends only names the code emits, or the measured ones", () => {
  assert.deepEqual(seedUnknown(SEED, KNOWN), []);
  assert.ok(
    seeded(SEED).spans.some((span) => span.name === DENIED_SPAN),
    'the seed holds denied calls',
  );
  const nameless = seeded(SEED)
    .logs(CLAUDE_SERVICE)
    .filter((log) => log.success === 'false' && log.tool_name === undefined);
  assert.equal(nameless.length, 1, 'one failed tool result with its tool label missing');
  const failedIn = (bash: boolean) =>
    new Set(
      seeded(SEED)
        .logs(CLAUDE_SERVICE)
        .filter((log) => log['event.name'] === 'tool_result' && log.success === 'false' && (log.tool_name === 'Bash') === bash)
        .map((log) => log.step),
    ).size;
  assert.deepEqual([failedIn(true), failedIn(false)], [2, 2], 'failed results of Bash in two steps, and of another tool in two steps');
});

/** `seed` with every span named `from` named `to`. */
const renamed = (seed: readonly ServiceSeed[], from: string, to: string): ServiceSeed[] => {
  const again = (span: SpanSeed): SpanSeed => ({ ...span, name: span.name === from ? to : span.name, children: span.children?.map(again) });
  return seed.map((said) => ({ ...said, spans: said.spans.map(again) }));
};

test('REFUSED: a seed with a renamed span, a metric of another kind, an attribute or a log field the code does not send', () => {
  assert.deepEqual(seedUnknown(renamed(SEED, DENIED_SPAN, 'step.denid'), KNOWN), ['step.denid']);
  const [daemon, ...sessions] = SEED;
  const asGauge = daemon.metrics.map((metric) => (metric.name === 'step.cost' ? { ...metric, kind: 'gauge' as const } : metric));
  assert.deepEqual(seedUnknown([{ ...daemon, metrics: asGauge }], KNOWN), ['step.cost']);
  const loose = { name: 'step.tries', kind: 'total' as const, series: [[{ run: 'r-1' }, 1] as [Record<string, string>, number]] };
  assert.deepEqual(seedUnknown([{ ...daemon, spans: [], logs: [], metrics: [loose] }], KNOWN), ['run']);
  const odd = { ...sessions[0], logs: [{ body: 'x', ago: 0, attributes: { 'tool.title': 'Bash' } }] };
  assert.deepEqual(seedUnknown([odd], KNOWN), ['tool_title']);
});

test('the seed meets every panel of every dashboard, with two series where a panel draws series, or the panel is listed unseeded', () => {
  for (const [file, d] of DASHBOARDS) assert.deepEqual(unmet(d, file.replace(/\.json$/, ''), SEED), [], file);
  assert.deepEqual(strayUnseeded(UNSEEDED), []);
  assert.ok(UNSEEDED.length > 0 && UNSEEDED.every((entry) => entry.why.length > 0), 'each unseeded panel says why');
});

test('REFUSED: a query the seed does not meet, a panel left with one series, an unlisted profile panel, and an unseeded entry naming no panel', () => {
  const steps = withQuery(dashboardTitled('Steps'), 'prometheus', 'step_tokens_input_total', 'step_tokens_cached_total');
  assert.deepEqual(unmet(steps, 'steps', SEED), [
    'Input tokens: step_tokens_cached_total',
    'Input tokens: one series by factory, workflow, step, agent',
  ]);
  const spanless = withQuery(dashboardTitled('Steps'), 'tempo', `name="${DENIED_SPAN}"`, 'name="step.refused"');
  assert.deepEqual(unmet(spanless, 'steps', SEED).slice(0, 1), ['Denied calls: step.refused']);
  const oneStep = SEED.map((said) => ({
    ...said,
    logs: said.logs.filter((log) => log.attributes.step !== 'review' && log.attributes.tool_name === 'Bash'),
  }));
  const few = unmet(dashboardTitled('Steps'), 'steps', oneStep).filter((why) => why.startsWith('Tool errors: one series by '));
  assert.equal(few.length, 1, 'one step and one tool leave Tool errors one series');
  const toolsKept = (keep: (tool: unknown) => boolean) =>
    SEED.map((said) => ({ ...said, logs: said.logs.filter((log) => keep(log.attributes.tool_name)) }));
  assert.deepEqual(
    unmet(
      dashboardTitled('Steps'),
      'steps',
      toolsKept((tool) => tool !== 'Bash'),
    ),
    ['Bash: exited non-zero: one series by step', 'Bash: exited non-zero, across runs: one series by workflow, step, agent'],
    'a seed with no failed Bash',
  );
  assert.deepEqual(
    unmet(
      dashboardTitled('Steps'),
      'steps',
      toolsKept((tool) => tool === 'Bash'),
    )
      .filter((why) => why.includes(': one series by '))
      .map((why) => why.replace(/: one series by .*$/, '')),
    ['Tool errors', 'Failed skill loads', 'Tool errors, across runs', 'Failed skill loads, across runs'],
    'a seed with only failed Bash',
  );
  assert.deepEqual(unmet(dashboardTitled('System'), 'system', SEED, []), [
    'CPU, over the range: nothing sent to pyroscope',
    'Heap in use, over the range: nothing sent to pyroscope',
  ]);
  assert.deepEqual(strayUnseeded([...UNSEEDED, { dashboard: 'system', panel: 'Wall time', why: 'x' }]), ['system: Wall time']);
});
