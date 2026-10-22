/**
 * What the side Grafana (`tools/observe/`) changes in its image to time a step: the collector overlay's command head and test scope,
 * Tempo's span metrics, its retention and the reach of its queries, the compose file that mounts both and keeps metrics 90 days, and
 * the README's word on how a change to a mounted file is taken.
 *
 * The command head is read as the collector runs it: the pattern is taken out of `otelcol.yaml`'s OTTL string (`\\` one backslash,
 * `$$` the collector's `$`) and run over a table of commands, a match setting the head and any other command left `other`. The test
 * scope is read the same way, each statement's pattern in order over its own table, the last match setting its literal and a command
 * none matches left without one. Each rule is
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

/** The overlay's processor that writes `test_scope`, after the head and before the batch. */
const SCOPE = 'transform/test_scope';

/** The OTTL string literals a statement matches the command against, to extract the head and to test it, each as the regex Go reads. */
const patternsOf = (statement: string): string[] =>
  [...statement.matchAll(/(?:ExtractPatterns|IsMatch)\(attributes\["full_command"\],\s*("(?:[^"\\]|\\.)*")\)/g)].map(([, literal]) =>
    (JSON.parse(literal) as string).replaceAll('$$', '$'),
  );

/** The one group of statements of `processor`, the head's by default, or undefined. */
const groupOf = (config: Collector, processor = TRANSFORM) => config.processors?.[processor]?.trace_statements?.[0];

/** The condition every transform of the overlay reads: a Bash tool span that carries its command. */
const BASH_SPAN = 'name == "claude_code.tool" and attributes["tool_name"] == "Bash" and ';

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
  if (group?.context !== 'span' || !condition.startsWith(BASH_SPAN))
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

/** The values `test_scope` takes: a literal each, so no package, file or page name gets in. */
const SCOPES = ['suite', 'package', 'files', 'e2e: all', 'e2e: pages'];

/** A statement of the scope's transform: `test_scope` set to a literal where the command matches one pattern. */
const SCOPE_STATEMENT =
  /^set\(attributes\["test_scope"\], ("(?:[^"\\]|\\.)*")\) where IsMatch\(attributes\["full_command"\], "(?:[^"\\]|\\.)*"\)$/;

/** The scope a statement sets and the pattern it matches the command against, or undefined when it is not of that form. */
function scopeStatementOf(statement: string): { scope: string; pattern: string } | undefined {
  const literal = SCOPE_STATEMENT.exec(statement)?.[1];
  const [pattern, ...more] = patternsOf(statement);
  if (literal === undefined || pattern === undefined || more.length) return undefined;
  return { scope: JSON.parse(literal) as string, pattern };
}

/** The scope `config` gives `command`: the last statement whose pattern matches sets it, as the collector runs them in order. */
function scopeOf(config: Collector, command: string): string | undefined {
  let scope: string | undefined;
  for (const statement of groupOf(config, SCOPE)?.statements ?? []) {
    const read = scopeStatementOf(statement);
    if (read && new RegExp(read.pattern).test(command)) scope = read.scope;
  }
  return scope;
}

/**
 * Commands and their scopes, undefined where none is set: the whole suite from the root, one package by a filter, a workspace or a
 * `cd` into it, some files by `node --test`, and e2e on every page or some; read at any command of the line, past its wrappers, the
 * last match winning, and never inside a quote, a script's longer name or another flag.
 */
const SCOPE_ROWS: [string, string | undefined][] = [
  ['npx turbo run test --force --continue', 'suite'],
  ['npm test', 'suite'],
  ['npm run test', 'suite'],
  ['cd ~/repo && npm test', 'suite'],
  ['timeout 900 npx turbo run test --force --continue 2>&1 | tail -40', 'suite'],
  ['npx turbo run test --filter=agent-orchestrator --force', 'package'],
  ['npx turbo run test -F web', 'package'],
  ['turbo run test --force --filter agent-runtime', 'package'],
  ['npm test -w packages/agent-runtime', 'package'],
  ['npm test --workspace=apps/api', 'package'],
  ['npm -w apps/web run test', 'package'],
  ['cd packages/agent-orchestrator && npm test', 'package'],
  ['cd /home/u/wt/apps/api && npm test 2>&1 | tail', 'package'],
  ['cd packages/agent-orchestrator && npx turbo run test --force', 'package'],
  ['cd packages/agent-runtime; npm test', 'package'],
  ['cd apps/web; npx turbo run test --force --continue', 'package'],
  ['cd ~/repo; npm test', 'suite'],
  ['cd apps/web && cd ../.. && npx turbo run test --force --continue', 'suite'],
  ['node --test test/a.test.ts', 'files'],
  ['timeout --foreground 60 node --test test/a.test.ts', 'files'],
  ['cd packages/agent-orchestrator && node --import ./test/ambient.ts --test test/observe-time.test.ts', 'files'],
  ['npm run e2e', 'e2e: all'],
  ['npm run build && npm run e2e -- --photos', 'e2e: all'],
  ['npm run e2e -- --pages time,runs', 'e2e: pages'],
  ['npm run build && npm run e2e -- --pages time', 'e2e: pages'],
  ['npx turbo run test --filter=web && npm run e2e -- --pages time', 'e2e: pages'],
  ['npm run typecheck', undefined],
  ['npx turbo run typecheck --force', undefined],
  ['npm run lint', undefined],
  ['npm run test:e2e', undefined],
  ['npm run testing', undefined],
  ['node workflows/build/probe.ts list', undefined],
  ['node --test-reporter=spec x.ts', undefined],
  ['grep -rn "npm test" docs/', undefined],
  ['git commit -m "Run npm test first"', undefined],
  ['docker run postgres:16-alpine', undefined],
];

/** What is wrong with where the scope's transform runs, what it reads and what it may set, each said in a line. */
function scopeShapeFaults(config: Collector): string[] {
  const faults: string[] = [];
  const order = config.service?.pipelines?.traces?.processors ?? [];
  const batch = order.indexOf('batch');
  if (![TRANSFORM, SCOPE].every((p) => order.indexOf(p) >= 0 && order.indexOf(p) < batch))
    faults.push(`the traces pipeline runs ${order.join(', ')}, not ${TRANSFORM} and ${SCOPE} before batch`);
  const group = groupOf(config, SCOPE);
  const condition = (group?.conditions ?? []).join(' or ');
  if (group?.context !== 'span' || !condition.startsWith(BASH_SPAN))
    faults.push(`the scope reads ${condition || 'every span'}, not a Bash tool span alone`);
  const set = (group?.statements ?? []).map((statement) => scopeStatementOf(statement)?.scope);
  for (const [i, scope] of set.entries())
    if (scope === undefined || !SCOPES.includes(scope))
      faults.push(`statement ${i + 1} sets ${scope === undefined ? 'no literal' : scope}, not one of ${SCOPES.join(', ')}`);
  for (const scope of SCOPES.filter((scope) => !set.includes(scope))) faults.push(`no statement sets the scope ${scope}`);
  return faults;
}

/** What is wrong with the scope's transform `config`, each said in a line: its shape, then each row it reads otherwise. */
function scopeFaults(config: Collector): string[] {
  const faults = scopeShapeFaults(config);
  for (const [command, scope] of SCOPE_ROWS) {
    const read = scopeOf(config, command);
    if (read !== scope) faults.push(`${JSON.stringify(command)} has the scope ${read ?? 'none'}, not ${scope ?? 'none'}`);
  }
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
  'test_scope',
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

/**
 * What is wrong with how the README `text` says a change to the mounted files is taken, each said in a line: `up -d` recreates nothing
 * for a bind-mounted file's contents, so it says `up -d --force-recreate`, and that `docker compose restart` fails on WSL.
 */
function recreateFaults(text: string): string[] {
  const faults: string[] = [];
  if (!/`tempo\.yaml`\s+or\s+`otelcol\.yaml`[^.]*?compose\.yaml\s+up\s+-d\s+--force-recreate`/.test(text))
    faults.push('the README does not say a change to tempo.yaml or otelcol.yaml is taken by up -d --force-recreate');
  if (!/`docker\s+compose\s+restart`\s+fails\s+on\s+WSL/.test(text))
    faults.push('the README does not say docker compose restart fails on WSL');
  return faults;
}

const COLLECTOR = read('otelcol.yaml') as Collector;
const TEMPO = read('tempo.yaml') as Tempo;
const README = fs.readFileSync(path.join(OBSERVE, 'README.md'), 'utf8');
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

test('a Bash tool span gets the scope of its test command, one of five values, and no name', () => {
  assert.deepEqual(scopeFaults(COLLECTOR), []);
  for (const [command, scope] of SCOPE_ROWS) assert.equal(scopeOf(COLLECTOR, command), scope, command);
});

test('REFUSED: the scope after the batch, on every span, copied from the command, unfiltered, a cd into a package read as the suite, out of order, or read in a quote', () => {
  const changed = (edit: (statements: string[], c: Collector) => void): string[] => {
    const config = structuredClone(COLLECTOR);
    edit(groupOf(config, SCOPE)!.statements!, config);
    return scopeFaults(config);
  };
  const statementOf = (statements: string[], scope: string, more = '') =>
    statements.findIndex((s) => s.startsWith(`set(attributes["test_scope"], "${scope}")`) && s.includes(more));
  assert.deepEqual(
    changed((_, c) => {
      c.service!.pipelines!.traces!.processors = [TRANSFORM, 'batch', SCOPE];
    }),
    [`the traces pipeline runs ${TRANSFORM}, batch, ${SCOPE}, not ${TRANSFORM} and ${SCOPE} before batch`],
  );
  assert.deepEqual(
    changed((_, c) => {
      groupOf(c, SCOPE)!.conditions = ['attributes["full_command"] != nil'];
    }),
    ['the scope reads attributes["full_command"] != nil, not a Bash tool span alone'],
  );
  const copied = 'set(attributes["test_scope"], attributes["full_command"])';
  assert.deepEqual(
    changed((statements) => statements.push(copied)),
    [`statement 8 sets no literal, not one of ${SCOPES.join(', ')}`],
  );
  assert.deepEqual(
    changed((statements) => {
      const files = statementOf(statements, 'files');
      statements[files] = statements[files].replace('"files"', '"files: test/a.test.ts"');
    }),
    [
      `statement 5 sets files: test/a.test.ts, not one of ${SCOPES.join(', ')}`,
      'no statement sets the scope files',
      '"node --test test/a.test.ts" has the scope files: test/a.test.ts, not files',
      '"timeout --foreground 60 node --test test/a.test.ts" has the scope files: test/a.test.ts, not files',
      '"cd packages/agent-orchestrator && node --import ./test/ambient.ts --test test/observe-time.test.ts" has the scope files: test/a.test.ts, not files',
    ],
  );
  assert.deepEqual(
    changed((statements) => statements.splice(statementOf(statements, 'package', '--filter'), 1)),
    [
      '"npx turbo run test --filter=agent-orchestrator --force" has the scope suite, not package',
      '"npx turbo run test -F web" has the scope suite, not package',
      '"turbo run test --force --filter agent-runtime" has the scope suite, not package',
      '"npm test -w packages/agent-runtime" has the scope suite, not package',
      '"npm test --workspace=apps/api" has the scope suite, not package',
    ],
  );
  assert.deepEqual(
    changed((statements) => {
      const cd = statementOf(statements, 'package', 'cd\\\\s+');
      statements[cd] = statements[cd]
        .replace('(?:&&|;)', '&&')
        .replace('(?:turbo\\\\s+run\\\\s+test|npm\\\\s+(?:run\\\\s+)?test)', 'npm\\\\s+(?:run\\\\s+)?test');
    }),
    [
      '"cd packages/agent-orchestrator && npx turbo run test --force" has the scope suite, not package',
      '"cd packages/agent-runtime; npm test" has the scope suite, not package',
      '"cd apps/web; npx turbo run test --force --continue" has the scope suite, not package',
    ],
  );
  assert.deepEqual(
    changed((statements) => {
      const all = statementOf(statements, 'e2e: all');
      const pages = statementOf(statements, 'e2e: pages');
      [statements[all], statements[pages]] = [statements[pages], statements[all]];
    }),
    [
      '"npm run e2e -- --pages time,runs" has the scope e2e: all, not e2e: pages',
      '"npm run build && npm run e2e -- --pages time" has the scope e2e: all, not e2e: pages',
      '"npx turbo run test --filter=web && npm run e2e -- --pages time" has the scope e2e: all, not e2e: pages',
    ],
  );
  assert.deepEqual(
    changed((statements) => {
      const suite = statementOf(statements, 'suite');
      statements[suite] = statements[suite].replace('"(?:^|[;&|(\\\\n])\\\\s*', '"');
    }),
    ['"git commit -m \\"Run npm test first\\"" has the scope suite, not none'],
  );
});

test("Tempo keeps span time by a step's and a tool's names, never a run's, and traces two weeks", () => {
  assert.deepEqual(tempoFaults(TEMPO), []);
});

test("REFUSED: span time by run or task, without the command head or the test scope, with a subagent's spans, and a shorter reach or retention", () => {
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
      spanMetrics(t).dimensions = spanMetrics(t).dimensions!.filter((d) => d !== 'test_scope');
    }),
    ['span time is not kept by test_scope'],
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

test('the README says a change to the mounted files is taken by up -d --force-recreate, and that restart fails on WSL', () => {
  assert.deepEqual(recreateFaults(README), []);
});

test('REFUSED: a README that takes a mounted file by up -d alone, or says nothing of restart on WSL', () => {
  assert.deepEqual(recreateFaults(README.replace('compose.yaml up -d --force-recreate`', 'compose.yaml up -d`')), [
    'the README does not say a change to tempo.yaml or otelcol.yaml is taken by up -d --force-recreate',
  ]);
  assert.deepEqual(recreateFaults(README.replace(/`docker\s+compose\s+restart`\s+fails\s+on\s+WSL/, '`docker compose restart` works')), [
    'the README does not say docker compose restart fails on WSL',
  ]);
});
