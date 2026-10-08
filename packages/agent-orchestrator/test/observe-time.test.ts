/**
 * What the side Grafana (`tools/observe/`) changes in its image to time a step: the collector overlay's command head, Tempo's span
 * metrics, its retention and the reach of its queries, and the compose file that mounts both and keeps metrics 90 days.
 *
 * The command head is read as the collector runs it: the pattern is taken out of `otelcol.yaml`'s OTTL string (`\\` one backslash,
 * `$$` the collector's `$`) and run over a table of commands, a match setting the head and any other command left `other`. Each rule is
 * a function of the parsed file returning what is wrong, each a line, shown to refuse a fixture that breaks it. The image's own paths
 * (`/otel-lgtm/tempo-config.yaml`, read by its Tempo; a second `--config` merged by its collector) are its pinned digest's, as
 * measured (`tools/observe/README.md`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const OBSERVE = path.join(import.meta.dirname, '..', '..', '..', 'tools', 'observe');

/** A parsed file of `tools/observe/`. */
const read = (file: string): unknown => yaml.load(fs.readFileSync(path.join(OBSERVE, file), 'utf8'));

/** The collector overlay, as far as the checker reads it. */
type Collector = {
  processors?: Record<string, { trace_statements?: { context?: string; conditions?: string[]; statements?: string[] }[] }>;
  service?: { pipelines?: { traces?: { processors?: string[] } } };
};

/** The overlay's processor that writes `command_head`. */
const TRANSFORM = 'transform/command_head';

/** The OTTL string literals a statement matches the command against, to extract the head and to test it, each as the regex Go reads. */
const patternsOf = (statement: string): string[] =>
  [...statement.matchAll(/(?:ExtractPatterns|IsMatch)\(attributes\["full_command"\],\s*("(?:[^"\\]|\\.)*")\)/g)].map(([, literal]) =>
    (JSON.parse(literal) as string).replaceAll('$$', '$'),
  );

/** The transform's one group of statements, or undefined. */
const groupOf = (config: Collector) => config.processors?.[TRANSFORM]?.trace_statements?.[0];

/** The command head `config` gives `command`: the pattern's `head` where it matches, else `other`, as the two statements set it. */
function headOf(config: Collector, command: string): string {
  const [pattern] = patternsOf(groupOf(config)?.statements?.[1] ?? '');
  assert.ok(pattern, 'the second statement extracts the head');
  return new RegExp(pattern).exec(command)?.groups?.head ?? 'other';
}

/**
 * Commands and their heads: a command of subcommands keeps its subcommand, a package runner (npm, pnpm, yarn, turbo) a `run`'s script
 * too, wrappers and a leading `cd` are skipped, and a flag, path, quote, `$`, `=` or the next line ends the head, so no argument gets in.
 */
const HEADS: [string, string][] = [
  ['npm test', 'npm test'],
  ['npm run typecheck', 'npm run typecheck'],
  ['npm run build:web -- --pages time', 'npm run build:web'],
  ['npx turbo run test --force --continue', 'turbo run test'],
  ['cd ~/repo && npm run lint', 'npm run lint'],
  ['FOO=1 BAR=/x npm test', 'npm test'],
  ['timeout 580 bash -c "while kill -0 12; do sleep 5; done"', 'bash'],
  ['timeout --foreground 60 node --test test/a.test.ts', 'node'],
  ['nohup docker compose up -d', 'docker compose'],
  ['docker run postgres:16-alpine', 'docker run'],
  ['go run main.go', 'go run'],
  ['cargo run --release', 'cargo run'],
  ['pnpm run build', 'pnpm run build'],
  ['yarn run lint', 'yarn run lint'],
  ['git commit -m "a secret said in a message"', 'git commit'],
  ['git -C /repo log --oneline', 'git'],
  ['git log;rm -rf /', 'git log'],
  ['npm test\nrm -rf /', 'npm test'],
  ['grep -n foo src/a.ts | head -5', 'grep'],
  ['echo $HOME', 'echo'],
  ['cat /etc/hosts', 'cat'],
  ['node workflows/build/probe.ts list', 'node'],
  ['./run.sh --flag', 'other'],
  ['tools/run.sh --flag', 'other'],
  ['"quoted" words', 'other'],
  ['/usr/bin/env node', 'other'],
  ['$EDITOR file', 'other'],
];

/** What is wrong with the collector overlay `config`, each said in a line. */
function collectorFaults(config: Collector): string[] {
  const faults: string[] = [];
  const order = config.service?.pipelines?.traces?.processors ?? [];
  if (order.indexOf(TRANSFORM) < 0 || order.indexOf(TRANSFORM) > order.indexOf('batch'))
    faults.push(`the traces pipeline runs ${order.join(', ')}, not ${TRANSFORM} before batch`);
  const group = groupOf(config);
  const condition = (group?.conditions ?? []).join(' or ');
  if (group?.context !== 'span' || !condition.startsWith('name == "claude_code.tool" and attributes["tool_name"] == "Bash" and '))
    faults.push(`the transform reads ${condition || 'every span'}, not a Bash tool span alone`);
  const [first, second, ...rest] = group?.statements ?? [];
  if (first !== 'set(attributes["command_head"], "other")' || !second || rest.length)
    faults.push('the statements are not `other`, then the head where the pattern matches');
  const patterns = patternsOf(second ?? '');
  if (patterns.length !== 2 || patterns[0] !== patterns[1]) faults.push('the head is extracted by another pattern than it is matched by');
  if (patterns.length === 2)
    for (const [command, head] of HEADS)
      if (headOf(config, command) !== head) faults.push(`${JSON.stringify(command)} has the head ${headOf(config, command)}, not ${head}`);
  return faults;
}

/** Tempo's config, as far as the checker reads it. */
type Tempo = {
  query_frontend?: { metrics?: { max_duration?: string } };
  backend_scheduler?: { provider?: { compaction?: { compaction?: { block_retention?: string } } } };
  backend_worker?: { compaction?: { block_retention?: string } };
  live_store?: { wal?: { ingestion_time_range_slack?: string } };
  metrics_generator?: {
    metrics_ingestion_time_range_slack?: string;
    processor?: {
      span_metrics?: {
        dimensions?: string[];
        filter_policies?: { exclude?: { match_type?: string; attributes?: { key?: string; value?: string }[] } }[];
      };
    };
  };
};

/** What span time is kept by: the image's three, a step's names, and a tool's. */
const DIMENSIONS = [
  'service_name',
  'operation',
  'status_code',
  'factory',
  'workflow',
  'step',
  'agent',
  'tool_name',
  'bash_command_class',
  'command_head',
];

/** Attributes a span carries that span time is never kept by: each value would be a series of its own, never ended. */
const UNBOUNDED = ['run', 'task', 'try', 'full_command', 'agent_id', 'session.id'];

/** What is wrong with Tempo's `config`, each said in a line. */
function tempoFaults(config: Tempo): string[] {
  const faults: string[] = [];
  const spanMetrics = config.metrics_generator?.processor?.span_metrics;
  const dimensions = spanMetrics?.dimensions ?? [];
  for (const d of dimensions.filter((d) => UNBOUNDED.includes(d))) faults.push(`span time is kept by ${d}, a series for each`);
  for (const d of DIMENSIONS.filter((d) => !dimensions.includes(d))) faults.push(`span time is not kept by ${d}`);
  const subagent = (spanMetrics?.filter_policies ?? []).some(
    ({ exclude }) =>
      exclude?.match_type === 'regex' && (exclude.attributes ?? []).some((a) => a.key === 'span.agent_id' && a.value === '.+'),
  );
  if (!subagent) faults.push("a subagent's spans are kept in span time, counted again beside its Agent tool");
  const kept = {
    'the scheduler keeps traces': config.backend_scheduler?.provider?.compaction?.compaction?.block_retention,
    'the worker keeps traces': config.backend_worker?.compaction?.block_retention,
  };
  for (const [what, value] of Object.entries(kept)) if (value !== '336h') faults.push(`${what} ${value ?? 'by default'}, not 336h`);
  const reach = config.query_frontend?.metrics?.max_duration;
  if (reach !== '168h') faults.push(`a TraceQL metrics query reaches ${reach ?? '24h'}, not 168h`);
  const late = config.metrics_generator?.metrics_ingestion_time_range_slack;
  if (late !== '2m') faults.push(`span time is kept for a span ended ${late ?? '30s'} before it arrived, not 2m`);
  const long = config.live_store?.wal?.ingestion_time_range_slack;
  if (long !== '24h') faults.push(`a TraceQL metrics query counts a span begun ${long ?? '2m'} before it arrived, not 24h`);
  return faults;
}

/** The compose file's service, as far as the checker reads it. */
type Service = { volumes?: string[]; environment?: Record<string, string> };

/** Where the image's collector reads the overlay, its Tempo its config, and the flag keeping metrics 90 days. */
const OVERLAY = '/otel-lgtm/nemia/otelcol.yaml';
const TEMPO_CONFIG = '/otel-lgtm/tempo-config.yaml';
const RETENTION = '--storage.tsdb.retention.time=90d';

/** What is wrong with how `service` brings in the overlay and Tempo's config and keeps metrics, each said in a line. */
function composeFaults(service: Service): string[] {
  const faults: string[] = [];
  const mounted = (from: string, to: string) => (service.volumes ?? []).includes(`${from}:${to}:ro`);
  if (!mounted('./otelcol.yaml', OVERLAY)) faults.push(`./otelcol.yaml is not mounted, read-only, at ${OVERLAY}`);
  if (!mounted('./tempo.yaml', TEMPO_CONFIG)) faults.push(`./tempo.yaml is not mounted, read-only, over ${TEMPO_CONFIG}`);
  const env = service.environment ?? {};
  if (env.OTELCOL_EXTRA_ARGS !== `--config=${OVERLAY}`) faults.push(`the collector is not given --config=${OVERLAY}`);
  if (!(env.PROMETHEUS_EXTRA_ARGS ?? '').split(/\s+/).includes(RETENTION)) faults.push(`Prometheus is not given ${RETENTION}`);
  return faults;
}

const COLLECTOR = read('otelcol.yaml') as Collector;
const TEMPO = read('tempo.yaml') as Tempo;
const SERVICE = Object.values((read('compose.yaml') as { services: Record<string, Service> }).services)[0];

test('a Bash tool span gets the plain words of its command, before the batch, and no argument', () => {
  assert.deepEqual(collectorFaults(COLLECTOR), []);
  for (const [command, head] of HEADS) assert.equal(headOf(COLLECTOR, command), head, command);
});

test("REFUSED: the head after the batch, on every span, by two patterns, or with an argument in it, a script's or an image's", () => {
  const changed = (edit: (c: Collector) => void): string[] => {
    const config = structuredClone(COLLECTOR);
    edit(config);
    return collectorFaults(config);
  };
  assert.deepEqual(
    changed((c) => {
      c.service!.pipelines!.traces!.processors = ['batch', TRANSFORM];
    }),
    [`the traces pipeline runs batch, ${TRANSFORM}, not ${TRANSFORM} before batch`],
  );
  assert.deepEqual(
    changed((c) => {
      groupOf(c)!.conditions = ['attributes["full_command"] != nil'];
    }),
    ['the transform reads attributes["full_command"] != nil, not a Bash tool span alone'],
  );
  assert.deepEqual(
    changed((c) => {
      const statements = groupOf(c)!.statements!;
      statements[1] = statements[1].replace('IsMatch(attributes["full_command"], "^', 'IsMatch(attributes["full_command"], "');
    }),
    ['the head is extracted by another pattern than it is matched by'],
  );
  const loose = changed((c) => {
    const statements = groupOf(c)!.statements!;
    statements[1] = statements[1].replaceAll('(?:[\\\\s;|&)]|$$)', '');
  });
  assert.ok(loose.includes('"tools/run.sh --flag" has the head tools, not other'), loose.join('\n'));
  const wide = changed((c) => {
    const statements = groupOf(c)!.statements!;
    statements[1] = statements[1].replaceAll('[a-z][a-z0-9_:.-]*)?|', '[^\\\\n]*)?|');
  });
  assert.ok(
    wide.includes(
      '"git commit -m \\"a secret said in a message\\"" has the head git commit -m "a secret said in a message", not git commit',
    ),
    wide.join('\n'),
  );
  assert.deepEqual(
    changed((c) => {
      const statements = groupOf(c)!.statements!;
      statements[1] = statements[1].replaceAll('(?:npm|pnpm|yarn|turbo)(', '(?:npm|pnpm|yarn|turbo|docker)(');
    }),
    ['"docker run postgres:16-alpine" has the head docker run postgres:16-alpine, not docker run'],
  );
});

test("Tempo keeps span time by a step's and a tool's names, never a run's, and traces two weeks", () => {
  assert.deepEqual(tempoFaults(TEMPO), []);
});

test("REFUSED: span time by run or task, without the command head, with a subagent's spans, and a shorter reach or retention", () => {
  const changed = (edit: (t: Tempo) => void): string[] => {
    const config = structuredClone(TEMPO);
    edit(config);
    return tempoFaults(config);
  };
  const spanMetrics = (t: Tempo) => t.metrics_generator!.processor!.span_metrics!;
  assert.deepEqual(
    changed((t) => spanMetrics(t).dimensions!.push('run', 'task')),
    ['span time is kept by run, a series for each', 'span time is kept by task, a series for each'],
  );
  assert.deepEqual(
    changed((t) => {
      spanMetrics(t).dimensions = spanMetrics(t).dimensions!.filter((d) => d !== 'command_head');
    }),
    ['span time is not kept by command_head'],
  );
  assert.deepEqual(
    changed((t) => {
      delete spanMetrics(t).filter_policies;
    }),
    ["a subagent's spans are kept in span time, counted again beside its Agent tool"],
  );
  assert.deepEqual(
    changed((t) => {
      t.backend_worker!.compaction!.block_retention = '168h';
    }),
    ['the worker keeps traces 168h, not 336h'],
  );
  assert.deepEqual(
    changed((t) => {
      delete t.backend_scheduler;
      delete t.query_frontend;
    }),
    ['the scheduler keeps traces by default, not 336h', 'a TraceQL metrics query reaches 24h, not 168h'],
  );
  assert.deepEqual(
    changed((t) => {
      delete t.live_store;
      delete t.metrics_generator!.metrics_ingestion_time_range_slack;
    }),
    [
      'span time is kept for a span ended 30s before it arrived, not 2m',
      'a TraceQL metrics query counts a span begun 2m before it arrived, not 24h',
    ],
  );
});

test("the compose file mounts the overlay and Tempo's config where the image reads them, and keeps metrics 90 days", () => {
  assert.deepEqual(composeFaults(SERVICE), []);
});

test("REFUSED: an overlay the collector is not told of, Tempo's config mounted elsewhere, and metrics kept by default", () => {
  const changed = (more: Service): string[] => composeFaults({ ...SERVICE, ...more });
  const volumes = SERVICE.volumes ?? [];
  assert.deepEqual(changed({ environment: { ...SERVICE.environment, OTELCOL_EXTRA_ARGS: '' } }), [
    `the collector is not given --config=${OVERLAY}`,
  ]);
  assert.deepEqual(changed({ volumes: volumes.map((v) => v.replace(TEMPO_CONFIG, '/otel-lgtm/nemia/tempo.yaml')) }), [
    `./tempo.yaml is not mounted, read-only, over ${TEMPO_CONFIG}`,
  ]);
  assert.deepEqual(changed({ volumes: volumes.map((v) => v.replace(`${OVERLAY}:ro`, OVERLAY)) }), [
    `./otelcol.yaml is not mounted, read-only, at ${OVERLAY}`,
  ]);
  const { PROMETHEUS_EXTRA_ARGS: _, ...rest } = SERVICE.environment ?? {};
  assert.deepEqual(changed({ environment: rest }), [`Prometheus is not given ${RETENTION}`]);
});
