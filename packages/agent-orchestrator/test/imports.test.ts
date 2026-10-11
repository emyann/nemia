/**
 * The layers' import rules, held by lint (`docs/architecture.md`, "The rules"): the board imports no workspace package, no harness
 * SDK and no path into `packages/`; the api imports the orchestrator through `agent-orchestrator`, `/run`, `/workflow` and `/effect`
 * alone, and never the runtime or a harness SDK; the orchestrator imports no harness SDK; the runtime imports no layer above it.
 *
 * `.oxlintrc.json` sets `no-restricted-imports` in one override block per layer, over its source alone. Oxlint accepts an option it does
 * not understand without a word, so these tests read the blocks out of the config, run oxlint with them on files planted in a scratch
 * folder laid out as the layers, one import a file, and refuse a plant `LAYERS` forbids that lint lets through, and one it allows that
 * lint refuses. A block taken off the config, or replaced by a later block that sets the rule on the same files, lets its plants through.
 *
 * The test reads files outside this package. `turbo.json` makes `.oxlintrc.json` an input of this package's tests; after a change
 * anywhere else, `npx turbo run test --force`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { scratch } from './scratch.ts';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');
const OXLINT = path.join(ROOT, 'node_modules', '.bin', 'oxlint');
const RULE = 'no-restricted-imports';

const SDKS = ['@anthropic-ai/claude-agent-sdk', '@anthropic-ai/claude-agent-sdk/embed', '@a2a-js/sdk', '@a2a-js/sdk/client'];

/**
 * Each layer: the files its block covers, as one planted file a folder, the imports lint refuses there, and the imports it lets
 * through. A test beside a layer's source is of no layer, and may import the runtime's entries for a fake.
 */
const LAYERS: { name: string; at: string[]; refused: string[]; allowed: string[] }[] = [
  {
    name: 'web',
    at: ['apps/web/src', 'apps/web/src/lib'],
    refused: [
      'agent-orchestrator',
      'agent-orchestrator/run',
      'agent-runtime',
      'agent-runtime/vocabulary',
      ...SDKS,
      '../../../packages/agent-orchestrator/src/run.ts',
    ],
    allowed: ['react', 'effect', '@tanstack/react-query', './lib/api.ts', '../test/fixtures.ts'],
  },
  {
    name: 'api',
    at: ['apps/api/src', 'apps/api/src/runs'],
    refused: [
      'agent-runtime',
      'agent-runtime/harness',
      'agent-runtime/vocabulary',
      ...SDKS,
      'agent-orchestrator/effect',
      'agent-orchestrator/src/run.ts',
      'agent-orchestrator/runx',
      'agent-orchestrator/run/x',
      'agent-orchestrator/package.json',
      '../../../packages/agent-orchestrator/src/run.ts',
    ],
    allowed: ['agent-orchestrator', 'agent-orchestrator/run', 'agent-orchestrator/workflow', 'hono', 'effect', './body.ts'],
  },
  {
    name: 'orchestrator',
    at: ['packages/agent-orchestrator/src', 'packages/agent-orchestrator/bin', 'packages/agent-orchestrator/place/git'],
    refused: SDKS,
    allowed: ['agent-runtime', 'agent-runtime/vocabulary', 'effect', 'node:fs', './runner.ts'],
  },
  {
    name: 'runtime',
    at: ['packages/agent-runtime/src', 'packages/agent-runtime/bin'],
    refused: ['agent-orchestrator', 'agent-orchestrator/run', 'agent-orchestrator/effect', '../../agent-orchestrator/src/run.ts'],
    allowed: [...SDKS, 'effect', 'xstate', './index.ts'],
  },
];

/** Where a test sits beside each layer: no block covers it, so what its layer refuses passes there. */
const TESTS = ['apps/web/test', 'apps/api/test', 'packages/agent-orchestrator/test', 'packages/agent-runtime/test'];

type Block = { files: string[]; excludeFiles?: string[]; rules: Record<string, unknown> };
type Config = { rules?: Record<string, unknown>; overrides: Block[]; [key: string]: unknown };

/** `.oxlintrc.json`, read as oxlint reads it: JSON with comments. */
function readConfig(): Config {
  const parsed = ts.parseConfigFileTextToJson('.oxlintrc.json', fs.readFileSync(path.join(ROOT, '.oxlintrc.json'), 'utf8'));
  if (parsed.error) throw new Error(ts.flattenDiagnosticMessageText(parsed.error.messageText, '\n'));
  return parsed.config as Config;
}

/** The config's import rules alone: the top level's setting of the rule, and every override block that sets it, in order. */
const importRules = (config: Config): object => ({
  plugins: [],
  categories: {},
  rules: RULE in (config.rules ?? {}) ? { [RULE]: config.rules?.[RULE] } : {},
  overrides: config.overrides.filter((block) => RULE in block.rules).map((block) => ({ ...block, rules: { [RULE]: block.rules[RULE] } })),
});

type Plant = { layer: string; file: string; spec: string; refuse: boolean };

/** One file for each import of each layer, in each folder its block covers, and each refused import again in a test beside it. */
function plants(): Plant[] {
  const out: Plant[] = [];
  for (const layer of LAYERS)
    for (const dir of layer.at)
      for (const [spec, refuse] of [...layer.refused.map((s) => [s, true] as const), ...layer.allowed.map((s) => [s, false] as const)])
        out.push({ layer: layer.name, file: `${dir}/p${out.length}.ts`, spec, refuse });
  for (const dir of TESTS)
    for (const spec of LAYERS.flatMap((layer) => layer.refused))
      out.push({ layer: 'test', file: `${dir}/p${out.length}.test.ts`, spec, refuse: false });
  return out;
}

/** The planted files oxlint refuses with the import rule, run with `config` in a scratch folder laid out as the repository. */
function refusedBy(config: object, planted: Plant[]): Set<string> {
  const dir = scratch('imports-');
  for (const plant of planted) {
    fs.mkdirSync(path.join(dir, path.dirname(plant.file)), { recursive: true });
    fs.writeFileSync(path.join(dir, plant.file), `export * from '${plant.spec}';\n`);
  }
  fs.writeFileSync(path.join(dir, 'oxlintrc.json'), JSON.stringify(config));
  const ran = spawnSync(OXLINT, ['-c', 'oxlintrc.json', '-f', 'json', 'apps', 'packages'], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 120_000,
  });
  assert.equal(ran.signal, null, `oxlint was stopped by ${ran.signal}: ${ran.stderr}`);
  assert.ok(ran.status === 0 || ran.status === 1, `oxlint exited ${ran.status}: ${ran.stderr}${ran.stdout}`);
  const report = JSON.parse(ran.stdout) as { diagnostics: { code: string; filename: string }[] };
  return new Set(report.diagnostics.filter((d) => d.code === `eslint(${RULE})`).map((d) => d.filename));
}

/** Each plant whose verdict is not the one `LAYERS` gives it, as a sentence naming the block to fix. */
function leaks(config: object): string[] {
  const planted = plants();
  const refused = refusedBy(config, planted);
  return planted.flatMap(({ layer, file, spec, refuse }) => {
    if (refuse && !refused.has(file))
      return [`the ${layer} lets ${file} import ${spec}: set ${RULE} on its source in .oxlintrc.json, in its layer's block alone`];
    if (!refuse && refused.has(file))
      return [`the ${layer} refuses ${file} its import of ${spec}: narrow its block in .oxlintrc.json, which reaches too far`];
    return [];
  });
}

test("each layer's block refuses the imports that cross a layer, and lets its own through", () => {
  const planted = plants();
  assert.ok(planted.filter((p) => p.refuse).length > 40, 'the plants hold the imports each layer refuses');
  assert.deepEqual(leaks(importRules(readConfig())), []);
});

test('REFUSED: a layer whose block is taken off the config lets every import it refuses through, named by its layer', () => {
  const config = importRules(readConfig()) as { overrides: Block[] };
  assert.equal(config.overrides.length, LAYERS.length, 'one block a layer');
  for (const [at, layer] of LAYERS.entries()) {
    const without = { ...config, overrides: config.overrides.filter((_, i) => i !== at) };
    const leaked = leaks(without);
    assert.ok(leaked.length > 0, `the config without its block ${at} let nothing through`);
    assert.deepEqual(
      leaked.filter((line) => !line.startsWith(`the ${layer.name} lets `)),
      [],
      `block ${at} is the ${layer.name}'s, and only the ${layer.name}'s plants leak without it`,
    );
    assert.equal(leaked.length, layer.refused.length * layer.at.length, `every import the ${layer.name} refuses leaks`);
  }
});

test('REFUSED: a later block that sets the rule on a layer replaces its options, and lets its imports through', () => {
  const config = importRules(readConfig()) as { overrides: Block[] };
  const wide = { files: ['apps/**'], rules: { [RULE]: ['error', { patterns: [{ group: ['left-pad'] }] }] } };
  const leaked = leaks({ ...config, overrides: [...config.overrides, wide] });
  assert.ok(leaked.some((line) => line.startsWith('the web lets ')));
  assert.ok(leaked.some((line) => line.startsWith('the api lets ')));
});

test('REFUSED: a block that reaches too far refuses what its layer allows', () => {
  const config = importRules(readConfig()) as { overrides: Block[] };
  const tight = config.overrides.map((block) =>
    block.files.includes('apps/api/src/**')
      ? { files: block.files, rules: { [RULE]: ['error', { patterns: ['agent-orchestrator/**'] }] } }
      : block,
  );
  const leaked = leaks({ ...config, overrides: tight });
  assert.ok(
    leaked.some((line) => /^the api refuses apps\/api\/src\/p\d+\.ts its import of agent-orchestrator\/run: narrow its block/.test(line)),
    leaked.join('\n'),
  );
});
