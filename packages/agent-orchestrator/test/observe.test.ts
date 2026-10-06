/**
 * The side Grafana for building Nemia (`tools/observe/`): its compose file brings up one stack, its image pinned by digest, on the ports
 * the daemon exports to; its dashboards parse, point at the image's own datasources, and name only what the code emits.
 *
 * The names are read from the code, never listed by hand. The metrics are scanned from both `src` trees (`Metric.histogram`, `gauge`,
 * `counter`) and named as Prometheus shows them through the collector, as measured on the stack: dots become underscores, a histogram
 * gets `_bucket`, `_count` and `_sum`, a gauge `_ratio`, a counter that only grows `_total` and any other counter nothing. The spans,
 * their attributes and the logs' annotations come from a pass of the tick traced over the runtime's engine as the client builds it
 * (`engineOf`), and the orchestrator's own `Effect.fn` names; the labels from `STEP_ATTRIBUTE_KEYS` and the attributes each
 * `Metric.withAttributes` gives.
 *
 * `WF_ROOT` is set before the runner is imported, which reads it as the module loads. `WF_VERIFY_REST=1` judges in full every run a pass
 * answers from its memo, sessions enough are admitted for the one run, and no cap is set on runs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';
import { Engine as RuntimeEngine, type Event, type Sighting } from 'agent-runtime';
import { Effect, Logger, References, Tracer } from 'effect';
import { scratch } from './scratch.ts';
import { asyncOps, asyncStore, type AsyncJournal, type AsyncRunner } from './promised.ts';

const ROOT = scratch('wf-observe-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

process.env.WF_ROOT = ROOT;
process.env.WF_MAX_CONCURRENT = '10';
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_RUNS;
const { startRun } = await import('../src/runner.ts');
const { tickRun } = await import('../src/tick/tick.verb.ts');
const { EngineService, engineOf } = await import('../src/runtime-client.ts');
const { PASS_METRICS, STEP_METRICS } = await import('../src/meter/meter.verb.ts');
const { STEP_ATTRIBUTE_KEYS } = await import('../src/meter/step.ts');
const { DEFAULT_SERVICE_NAME } = await import('../src/telemetry/telemetry.ts');

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
const DATASOURCES = ['prometheus', 'tempo', 'loki'];

/** Every name a dashboard may use, each kind its own set. */
type Known = {
  metrics: Set<string>;
  labels: Set<string>;
  spans: Set<string>;
  attributes: Set<string>;
  resources: Set<string>;
  logFields: Set<string>;
};

/** A dashboard's query, as the checker reads it: the datasource it is sent to, and its text. */
type Query = { datasource: string; text: string };

/** A panel of a dashboard, as far as the checker reads it. */
type Panel = {
  type: string;
  title?: string;
  datasource?: { uid?: string };
  targets?: { datasource?: { uid?: string }; expr?: string; query?: string }[];
  panels?: Panel[];
  options?: { content?: string };
};

/** A dashboard, as far as the checker reads it. */
type Dashboard = {
  uid: string;
  title: string;
  panels: Panel[];
  templating?: { list: { name: string; type: string; query?: unknown; current?: { value?: unknown }; datasource?: { uid?: string } }[] };
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

/** The span names, span attribute keys and log annotation keys of one traced pass that files a run's first step. */
async function tracedPass(): Promise<{ spans: Set<string>; attributes: Set<string>; annotations: Set<string> }> {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo });
  git('init', '-q');
  git('commit', '-q', '--allow-empty', '-m', 'base');
  const folder = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(folder, 'work.md'), '---\nharness: codex\n---\nwork it\n');
  const e = engineOf(
    RuntimeEngine.layer({
      root: fs.mkdtempSync(path.join(ROOT, 'engine-')),
      journal: asyncStore(journal),
      harnesses: { claude: asyncOps(runner), codex: asyncOps(runner), check: asyncOps(runner) },
      defaultHarness: 'claude',
    }),
  );
  await Effect.runPromise(startRun({ brief: 'one run', repo, workflowDir: folder }));
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
  await Effect.runPromise(
    tickRun({ repo: ROOT }).pipe(
      Effect.provide(EngineService.layer(e)),
      Effect.provide(Logger.layer([keeper])),
      Effect.provideService(References.MinimumLogLevel, 'Debug'),
      Effect.withTracer(tracer),
    ),
  );
  return { spans: new Set(spans.map((s) => s.name)), attributes: new Set(spans.flatMap((s) => [...s.attributes.keys()])), annotations };
}

const TRACED = await tracedPass();

const KNOWN: Known = {
  metrics: new Set([...METRICS.values()].flat()),
  labels: new Set([...STEP_ATTRIBUTE_KEYS, ...attributeKeys(SOURCE_TEXT), ...EXPORTER_LABELS]),
  spans: new Set([...TRACED.spans, ...[...SOURCE_TEXT.matchAll(/Effect\.fn\(\s*'([^']+)'/g)].map(([, name]) => name)]),
  attributes: TRACED.attributes,
  resources: new Set(RESOURCE_ATTRIBUTES),
  logFields: new Set([...TRACED.annotations, ...LOKI_FIELDS]),
};

/** PromQL's own words, which are not metrics: its functions, aggregations and keywords as the dashboards use them. */
const PROMQL_WORDS = new Set(
  'sum avg max min count topk by without on ignoring and or unless rate increase delta histogram_quantile vector label_values'.split(' '),
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

/** The stream labels and the fields a LogQL query names. */
function logNames(query: string): string[] {
  const text = query.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  const stream = /\{([^}]*)\}/.exec(text);
  const labels = [...(stream?.[1] ?? '').matchAll(/([A-Za-z_]\w*)\s*(?:=~|!~|!=|=)/g)].map(([, l]) => l);
  const fields = [...text.slice(stream ? stream.index + stream[0].length : 0).matchAll(/\|\s*([A-Za-z_]\w*)\s*(?:=~|!~|!=|=|>|<)/g)];
  return [...labels, ...fields.map(([, f]) => f)];
}

/** Every panel of `panels`, a row's own among them. */
const allPanels = (panels: Panel[]): Panel[] => panels.flatMap((p) => [p, ...allPanels(p.panels ?? [])]);

/** Every query `dashboard` sends: each panel's targets, and each query variable's. */
function queriesOf(dashboard: Dashboard): Query[] {
  const targets = allPanels(dashboard.panels).flatMap((p) =>
    (p.targets ?? []).map((t) => ({ datasource: t.datasource?.uid ?? p.datasource?.uid ?? '', text: t.expr ?? t.query ?? '' })),
  );
  const variables = (dashboard.templating?.list ?? [])
    .filter((v) => v.type === 'query')
    .map((v) => ({ datasource: v.datasource?.uid ?? '', text: typeof v.query === 'string' ? v.query : JSON.stringify(v.query) }));
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
  }
  return [...unknown];
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
const PORTS = [3000, 4317, 4318];

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
});

test("each dashboard parses, has its own uid, and points at the image's datasources", () => {
  assert.deepEqual([...DASHBOARDS.values()].map((d) => d.title).sort(), ['A run', 'Passes', 'Steps', 'System']);
  assert.equal(new Set([...DASHBOARDS.values()].map((d) => d.uid)).size, DASHBOARDS.size);
  for (const [file, d] of DASHBOARDS) {
    assert.equal(
      fs.readFileSync(path.join(OBSERVE, 'dashboards', file), 'utf8').includes('${DS_'),
      false,
      `${file}: an export's placeholder`,
    );
    for (const p of allPanels(d.panels).filter((p) => p.type !== 'text' && p.type !== 'row'))
      assert.ok(DATASOURCES.includes(p.datasource?.uid ?? ''), `${file}: ${p.title} reads ${p.datasource?.uid}`);
    for (const q of queriesOf(d)) assert.ok(DATASOURCES.includes(q.datasource), `${file}: a query sent to ${q.datasource}`);
  }
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
});

/** `dashboard` with the first query sent to `datasource` holding `from` holding `to` in its place. */
function withQuery(dashboard: Dashboard, datasource: string, from: string, to: string): Dashboard {
  const target = allPanels(dashboard.panels)
    .flatMap((p) => (p.targets ?? []).map((t) => ({ t, uid: t.datasource?.uid ?? p.datasource?.uid })))
    .find(({ t, uid }) => uid === datasource && (t.expr ?? t.query ?? '').includes(from));
  assert.ok(target, `no ${datasource} query of ${dashboard.title} holds ${from}`);
  if (target.t.expr !== undefined) target.t.expr = target.t.expr.replace(from, to);
  else target.t.query = target.t.query!.replace(from, to);
  return dashboard;
}

test('REFUSED: a renamed metric, span or attribute, an unbounded label, and a log field the code does not annotate', () => {
  const cases: [string, string, string, string, string][] = [
    ['System', 'prometheus', 'pass_duration_bucket', 'pass_durations_bucket', 'pass_durations_bucket'],
    ['Passes', 'tempo', 'name="pass"', 'name="passes"', 'passes'],
    ['A run', 'tempo', 'span.run', 'span.runid', 'runid'],
    ['System', 'prometheus', 'by (factory, workflow, step, agent)', 'by (run)', 'run'],
    ['A run', 'loki', '| run=', '| runid=', 'runid'],
  ];
  for (const [title, datasource, from, to, named] of cases)
    assert.deepEqual(unknownNames(withQuery(dashboardTitled(title), datasource, from, to), KNOWN), [named], `${title}: ${to}`);
});

test('System charts every metric the code exports', () => {
  assert.deepEqual(unchartedMetrics(dashboardTitled('System')), []);
  const system = dashboardTitled('System');
  const keep = (panels: Panel[]): Panel[] =>
    panels
      .filter((p) => !(p.targets ?? []).some((t) => (t.expr ?? '').includes('step_denied_total')))
      .map((p) => ({ ...p, panels: keep(p.panels ?? []) }));
  system.panels = keep(system.panels);
  assert.deepEqual(unchartedMetrics(system), ['step.denied']);
});

test('Steps says what its turns and tool calls wait on', () => {
  const texts = allPanels(dashboardTitled('Steps').panels).filter((p) => p.type === 'text');
  assert.ok(texts.some((p) => (p.options?.content ?? '').includes('a-step-s-session-exports-its-0cqv')));
});
