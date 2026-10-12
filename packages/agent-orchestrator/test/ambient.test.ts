/**
 * The package's `test` script loads `test/ambient.ts` into every test file's process, so a test that reads `WF_MAX_RUNS` or
 * `WF_MAX_CONCURRENT` without setting it is refused, whatever the shell or the daemon that runs the check has set. Proven on fixtures run
 * by `node --test` with the script's own flags, from the package, with the daemon's ceilings in their environment: one that relies on
 * a default fails naming the sentinel, and one that deletes the variable first passes. And a command that ticks, typed in such a file on a
 * store no daemon holds, starts none: the script turns the start off (`NEMIA_DAEMON_START=off`). And a collector the shell or the daemon
 * names is not one a test file exports to: the script drops `OTEL_EXPORTER_OTLP_ENDPOINT`. And a harness's own files are never the
 * person's: the script sets `CLAUDE_CONFIG_DIR` to a scratch folder.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { SENTINEL } from './ambient.ts';
import { scratch } from './scratch.ts';

const PACKAGE = path.join(import.meta.dirname, '..');
const TELEMETRY = pathToFileURL(path.join(PACKAGE, 'src', 'telemetry', 'telemetry.ts')).href;
const CONFIG = pathToFileURL(path.join(PACKAGE, 'src', 'config', 'config.store.ts')).href;
const script = (JSON.parse(fs.readFileSync(path.join(PACKAGE, 'package.json'), 'utf8')) as { scripts: { test: string } }).scripts.test;

/**
 * Why `script` may run a test file with the ceilings this machine has, or null when it may not: it loads `./test/ambient.ts` with
 * `--import` before `--test`.
 */
function scriptUnguarded(script: string): string | null {
  const words = script.trim().split(/\s+/);
  const at = words.findIndex((w, i) => w === '--import=./test/ambient.ts' || (w === '--import' && words[i + 1] === './test/ambient.ts'));
  const run = words.indexOf('--test');
  if (words[0] === 'node' && at > 0 && run > at) return null;
  return `the test script (${script}) runs its test files with the ceilings of the shell that runs it. Make it \`node --import ./test/ambient.ts --test …\`.`;
}

/**
 * A test file that reads `name` through `reader` and expects `expected`, deleting the variable first when `names` is true, run with
 * the flags `script` gives `node` before `--test`, from the package, with the daemon's ceilings in its environment.
 */
function runFixture(reader: 'maxRuns' | 'maxConcurrent', name: string, expected: number, names: boolean) {
  const dir = scratch('wf-ambient-');
  const file = path.join(dir, 'fixture.test.mjs');
  fs.writeFileSync(
    file,
    [
      "import { test } from 'node:test';",
      "import assert from 'node:assert/strict';",
      `import { ${reader} } from '${CONFIG}';`,
      names ? `delete process.env.${name};` : '',
      `test('the default', () => assert.equal(${reader}(), ${expected}));`,
      '',
    ].join('\n'),
  );
  const words = script.trim().split(/\s+/);
  const flags = words.slice(1, words.indexOf('--test'));
  const env: Record<string, string | undefined> = { ...process.env, WF_MAX_RUNS: '6', WF_MAX_CONCURRENT: '50' };
  for (const key of ['NODE_TEST_CONTEXT', 'NODE_OPTIONS']) delete env[key];
  return spawnSync(process.execPath, [...flags, '--test', file], { cwd: PACKAGE, env, encoding: 'utf8', timeout: 60_000 });
}

test("the package's test script loads test/ambient.ts with --import before --test", () => {
  assert.equal(scriptUnguarded(script), null);
});

test('REFUSED: a test script without the ambient hook, with another file, or with it after --test, is named, with the fix', () => {
  for (const bad of [
    "node --test 'test/*.test.ts' 'src/**/*.test.ts'",
    "node --import ./test/scratch.ts --test 'test/*.test.ts'",
    "node --test --import ./test/ambient.ts 'test/*.test.ts'",
  ]) {
    assert.equal(
      scriptUnguarded(bad),
      `the test script (${bad}) runs its test files with the ceilings of the shell that runs it. Make it \`node --import ./test/ambient.ts --test …\`.`,
    );
  }
  assert.equal(scriptUnguarded("node --import=./test/ambient.ts --test 'test/*.test.ts'"), null);
});

test("REFUSED under the daemon's WF_MAX_RUNS=6: a test file that relies on WF_MAX_RUNS's default fails, naming the variable to set", () => {
  const ran = runFixture('maxRuns', 'WF_MAX_RUNS', 0, false);
  assert.equal(ran.status, 1, `${ran.stdout}\n${ran.stderr}`);
  assert.ok(ran.stdout.includes(`WF_MAX_RUNS=${SENTINEL} is not a count.`), ran.stdout);
});

test("REFUSED under the daemon's WF_MAX_CONCURRENT=50: a test file that relies on WF_MAX_CONCURRENT's default fails, naming the variable", () => {
  const ran = runFixture('maxConcurrent', 'WF_MAX_CONCURRENT', 2, false);
  assert.equal(ran.status, 1, `${ran.stdout}\n${ran.stderr}`);
  assert.ok(ran.stdout.includes(`WF_MAX_CONCURRENT=${SENTINEL} is not a count from 1.`), ran.stdout);
});

test("a test file that deletes the ceiling it reads gets its default, whatever the daemon's", () => {
  for (const [reader, name, expected] of [
    ['maxRuns', 'WF_MAX_RUNS', 0],
    ['maxConcurrent', 'WF_MAX_CONCURRENT', 2],
  ] as const) {
    const ran = runFixture(reader, name, expected, true);
    assert.equal(ran.status, 0, `${name}: ${ran.stdout}\n${ran.stderr}`);
  }
});

test('with the switch the test script puts, a ticking command typed in a test starts no daemon, and says so', () => {
  const dir = scratch('wf-ambient-');
  const store = scratch('wf-ambient-store-');
  const main = pathToFileURL(path.join(PACKAGE, 'src', 'cli', 'main.ts')).href;
  const file = path.join(dir, 'fixture.test.mjs');
  fs.writeFileSync(
    file,
    [
      "import { test } from 'node:test';",
      "import assert from 'node:assert/strict';",
      "import fs from 'node:fs';",
      `process.env.WF_ROOT = ${JSON.stringify(store)};`,
      "if (process.env.NEMIA_DAEMON_START !== 'off') throw new Error('NEMIA_DAEMON_START is not off: nothing was typed, so no daemon started');",
      `const { main } = await import('${main}');`,
      "test('retry', async (t) => {",
      '  const said = [];',
      "  t.mock.method(console, 'error', (...a) => said.push(a.join(' ')));",
      "  await main(['retry', 'no-run', 'implement']).catch(() => undefined);",
      "  assert.ok(said.some((l) => l.includes('NEMIA_DAEMON_START=off here, so this command starts no daemon')), said.join('\\n'));",
      `  assert.deepEqual(fs.readdirSync(${JSON.stringify(store)}).filter((f) => f.startsWith('daemon.')), []);`,
      '});',
      '',
    ].join('\n'),
  );
  const words = script.trim().split(/\s+/);
  const flags = words.slice(1, words.indexOf('--test'));
  const env: Record<string, string | undefined> = { ...process.env, WF_MAX_RUNS: '6', WF_MAX_CONCURRENT: '50' };
  for (const key of ['NODE_TEST_CONTEXT', 'NODE_OPTIONS', 'NEMIA_DAEMON_START']) delete env[key];
  const ran = spawnSync(process.execPath, [...flags, '--test', file], { cwd: PACKAGE, env, encoding: 'utf8', timeout: 60_000 });
  assert.equal(ran.status, 0, `${ran.stdout}\n${ran.stderr}`);
});

/** A collector's address no test posts to: the discard port, where nothing listens. */
const NAMED = 'http://127.0.0.1:9';

/**
 * A test file that says what it sees of the collector's address and what `otlpOf` reads of it, run from the package with `NAMED` as the
 * address in its environment: with the flags `script` gives `node` before `--test` when `seated`, with none otherwise.
 */
function runExporter(seated: boolean, expected: string) {
  const dir = scratch('wf-ambient-');
  const file = path.join(dir, 'fixture.test.mjs');
  fs.writeFileSync(
    file,
    [
      "import { test } from 'node:test';",
      "import assert from 'node:assert/strict';",
      `import { otlpOf } from '${TELEMETRY}';`,
      'const seen = { address: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? null, exports: otlpOf(process.env)?.url ?? null };',
      `test('the collector', () => assert.deepEqual(seen, ${expected}));`,
      '',
    ].join('\n'),
  );
  const words = script.trim().split(/\s+/);
  const flags = seated ? words.slice(1, words.indexOf('--test')) : [];
  const env: Record<string, string | undefined> = { ...process.env, OTEL_EXPORTER_OTLP_ENDPOINT: NAMED };
  for (const key of ['NODE_TEST_CONTEXT', 'NODE_OPTIONS']) delete env[key];
  return spawnSync(process.execPath, [...flags, '--test', file], { cwd: PACKAGE, env, encoding: 'utf8', timeout: 60_000 });
}

test("REFUSED under the daemon's OTEL_EXPORTER_OTLP_ENDPOINT: a test file sees no collector and exports to none, and without the hook it would", () => {
  const seated = runExporter(true, '{ address: null, exports: null }');
  assert.equal(seated.status, 0, `${seated.stdout}\n${seated.stderr}`);
  const bare = runExporter(false, JSON.stringify({ address: NAMED, exports: NAMED }));
  assert.equal(bare.status, 0, `without the hook the address is the shell's: ${bare.stdout}\n${bare.stderr}`);
});

/**
 * A test file that says where a harness keeps its files, run from the package with the person's own folder named in its environment:
 * with the flags `script` gives `node` before `--test` when `seated`, with none otherwise. Answers the run, and where it printed.
 */
function runConfigured(seated: boolean, own: string) {
  const dir = scratch('wf-ambient-');
  const file = path.join(dir, 'fixture.test.mjs');
  const out = path.join(dir, 'seen.txt');
  fs.writeFileSync(
    file,
    [
      "import { test } from 'node:test';",
      "import fs from 'node:fs';",
      `test('the folder', () => fs.writeFileSync(${JSON.stringify(out)}, process.env.CLAUDE_CONFIG_DIR ?? ''));`,
      '',
    ].join('\n'),
  );
  const words = script.trim().split(/\s+/);
  const flags = seated ? words.slice(1, words.indexOf('--test')) : [];
  const env: Record<string, string | undefined> = { ...process.env, CLAUDE_CONFIG_DIR: own };
  for (const key of ['NODE_TEST_CONTEXT', 'NODE_OPTIONS']) delete env[key];
  const ran = spawnSync(process.execPath, [...flags, '--test', file], { cwd: PACKAGE, env, encoding: 'utf8', timeout: 60_000 });
  return { ran, seen: fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : undefined };
}

test("REFUSED under a person's own CLAUDE_CONFIG_DIR: a test file is given a scratch folder, and without the hook it would write theirs", () => {
  const own = path.join(os.homedir(), '.claude');
  const seated = runConfigured(true, own);
  assert.equal(seated.ran.status, 0, `${seated.ran.stdout}\n${seated.ran.stderr}`);
  assert.ok(seated.seen, 'the fixture said no folder');
  assert.notEqual(seated.seen, own);
  assert.ok(path.basename(seated.seen).startsWith('wf-ambient-claude-'), seated.seen);
  assert.equal(path.relative(os.homedir(), seated.seen).startsWith('.claude'), false);
  assert.equal(runConfigured(false, own).seen, own, "without the hook the folder is the shell's");
});

test("this file's own process has the scratch folder too", () => {
  assert.equal(path.basename(process.env.CLAUDE_CONFIG_DIR ?? '').startsWith('wf-ambient-claude-'), true);
});
