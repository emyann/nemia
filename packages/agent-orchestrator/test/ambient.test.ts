/**
 * The package's Vitest config loads `test/ambient.ts` first into every test file's process (`setupFiles`), so a test that reads
 * `WF_MAX_RUNS` or `WF_MAX_CONCURRENT` without setting it is refused, whatever the shell or the daemon that runs the check has set.
 * Proven on fixtures run by a Vitest of their own with the config's setup files (`test-kit/probe`), with the daemon's ceilings in their
 * environment: one that relies on a default fails naming the sentinel, and one that deletes the variable first passes. And a command that
 * ticks, typed in such a file on a store no daemon holds, starts none: the seat turns the start off (`NEMIA_DAEMON_START=off`). And a
 * collector the shell or the daemon names is not one a test file exports to: the seat drops `OTEL_EXPORTER_OTLP_ENDPOINT`. And the
 * daemon's per-session variables (`WF_SESSION_TOKEN`, `WF_MEMORY_LIMIT`, `WF_CGROUP_PARENT`) are dropped too, so a step's own run reads
 * what CI reads. And a harness's own files are never the person's: the seat sets `CLAUDE_CONFIG_DIR` to a scratch folder. And neither
 * store is the person's: the seat points `WF_ROOT`, `AE_ROOT` and `HOME` at scratch folders, so a module that pins a root as it loads
 * pins a throwaway one and `os.homedir()` answers a throwaway too.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AWAY, ENGINE, REAL_HOME, SENTINEL, STORE } from './ambient.ts';
import { SERVING_VARIABLES, SESSION_VARIABLES } from '../src/config/config.store.ts';
import { machineTempDir, scratch } from 'test-kit/scratch';
import { vitestIn } from 'test-kit/probe';
import { suiteOf } from 'test-kit/repo';

const PACKAGE = path.join(import.meta.dirname, '..');
const TELEMETRY = path.join(PACKAGE, 'src', 'telemetry', 'telemetry.ts');
const CONFIG = path.join(PACKAGE, 'src', 'config', 'config.store.ts');
const CONFIG_FILE = path.join(PACKAGE, 'vitest.config.ts');

/** The setup files the package's config loads before each test file, from the package, as a probe is given them. */
const SEAT = (suiteOf(PACKAGE)?.setupFiles ?? []).map((f) => path.join(PACKAGE, f));

/**
 * Why `config`, the text of a Vitest config, may run a test file with the ceilings this machine has, or null when it may not: its
 * first setup file is `./test/ambient.ts`.
 * @param config the text of the package's `vitest.config.ts`
 */
function configUnguarded(config: string) {
  const first = /\bsetupFiles:\s*\[\s*['"]([^'"]+)['"]/.exec(config)?.[1];
  if (first === './test/ambient.ts') return null;
  return `the Vitest config runs its test files with the ceilings of the shell that runs it. Make its first setup file \`./test/ambient.ts\`: \`setupFiles: ['./test/ambient.ts', …]\`.`;
}

/** Runs the fixture `file` holds in `dir` through Vitest under `env`, with the package's setup files when `seated`, with none otherwise. */
const probed = (dir: string, file: string, env: NodeJS.ProcessEnv, seated = true) => {
  fs.writeFileSync(path.join(dir, 'fixture.test.mjs'), file);
  return vitestIn(dir, seated ? SEAT : [], env);
};

/**
 * A test file that reads `name` through `reader` and expects `expected`, deleting the variable first when `names` is true, run with
 * the package's setup files, with the daemon's ceilings in its environment.
 */
function runFixture(reader: 'maxRuns' | 'maxConcurrent', name: string, expected: number, names: boolean) {
  const dir = scratch('wf-ambient-');
  const text = [
    "import assert from 'node:assert/strict';",
    `import { ${reader} } from '${CONFIG}';`,
    names ? `delete process.env.${name};` : '',
    `test('the default', () => assert.equal(${reader}(process.env), ${expected}));`,
    '',
  ].join('\n');
  const env: Record<string, string | undefined> = { ...process.env, WF_MAX_RUNS: '6', WF_MAX_CONCURRENT: '50' };
  return probed(dir, text, env);
}

test("the package's Vitest config loads test/ambient.ts as its first setup file", () => {
  assert.equal(configUnguarded(fs.readFileSync(CONFIG_FILE, 'utf8')), null);
});

test('REFUSED: a Vitest config without the ambient hook, with another file, or with it after another, is named', () => {
  for (const bad of [
    "export default { test: { include: ['test/*.test.ts', 'src/**/*.test.ts'] } };",
    "export default { test: { setupFiles: ['./test/scratch.ts'] } };",
    "export default { test: { setupFiles: ['../../tools/test-kit/seat.ts', './test/ambient.ts'] } };",
  ])
    assert.equal(typeof configUnguarded(bad), 'string', bad);
  assert.equal(configUnguarded("export default { test: { setupFiles: ['./test/ambient.ts', '../../tools/test-kit/seat.ts'] } };"), null);
});

test("REFUSED under the daemon's WF_MAX_RUNS=6: a test file that relies on WF_MAX_RUNS's default fails, naming the variable to set", () => {
  const ran = runFixture('maxRuns', 'WF_MAX_RUNS', 0, false);
  assert.equal(ran.status, 1, `${ran.stdout}\n${ran.stderr}`);
  assert.ok(`${ran.stdout}${ran.stderr}`.includes(`WF_MAX_RUNS=${SENTINEL} is not a count.`), ran.stdout + ran.stderr);
});

test("REFUSED under the daemon's WF_MAX_CONCURRENT=50: a test file that relies on WF_MAX_CONCURRENT's default fails, naming the variable", () => {
  const ran = runFixture('maxConcurrent', 'WF_MAX_CONCURRENT', 2, false);
  assert.equal(ran.status, 1, `${ran.stdout}\n${ran.stderr}`);
  assert.ok(`${ran.stdout}${ran.stderr}`.includes(`WF_MAX_CONCURRENT=${SENTINEL} is not a count from 1.`), ran.stdout + ran.stderr);
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
  const main = path.join(PACKAGE, 'src', 'cli', 'main.ts');
  const text = [
    "import assert from 'node:assert/strict';",
    "import fs from 'node:fs';",
    `process.env.WF_ROOT = ${JSON.stringify(store)};`,
    "if (process.env.NEMIA_DAEMON_START !== 'off') throw new Error('NEMIA_DAEMON_START is not off: nothing was typed, so no daemon started');",
    `const { main } = await import('${main}');`,
    "test('doctor fix', async () => {",
    '  const said = [];',
    "  vi.spyOn(console, 'error').mockImplementation((...a) => said.push(a.join(' ')));",
    "  await main(['doctor', 'fix', 'no-piece']).catch(() => undefined);",
    "  assert.ok(said.some((l) => l.includes('NEMIA_DAEMON_START=off here, so this command starts no daemon')), said.join('\\n'));",
    `  assert.deepEqual(fs.readdirSync(${JSON.stringify(store)}).filter((f) => f.startsWith('daemon.')), []);`,
    '});',
    '',
  ].join('\n');
  const env: Record<string, string | undefined> = { ...process.env, WF_MAX_RUNS: '6', WF_MAX_CONCURRENT: '50' };
  delete env.NEMIA_DAEMON_START;
  const ran = probed(dir, text, env);
  assert.equal(ran.status, 0, `${ran.stdout}\n${ran.stderr}`);
});

/** A collector's address no test posts to: the discard port, where nothing listens. */
const NAMED = 'http://127.0.0.1:9';

/**
 * A test file that says what it sees of the collector's address and what `otlpOf` reads of it, run from the package with `NAMED` as the
 * address in its environment: with the package's setup files when `seated`, with none otherwise.
 */
function runExporter(seated: boolean, expected: string) {
  const dir = scratch('wf-ambient-');
  const text = [
    "import assert from 'node:assert/strict';",
    `import { otlpOf } from '${TELEMETRY}';`,
    'const seen = { address: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? null, exports: otlpOf(process.env)?.url ?? null };',
    `test('the collector', () => assert.deepEqual(seen, ${expected}));`,
    '',
  ].join('\n');
  const env: Record<string, string | undefined> = { ...process.env, OTEL_EXPORTER_OTLP_ENDPOINT: NAMED };
  return probed(dir, text, env, seated);
}

test("REFUSED under the daemon's OTEL_EXPORTER_OTLP_ENDPOINT: a test file sees no collector and exports to none, and without the hook it would", () => {
  const seated = runExporter(true, '{ address: null, exports: null }');
  assert.equal(seated.status, 0, `${seated.stdout}\n${seated.stderr}`);
  const bare = runExporter(false, JSON.stringify({ address: NAMED, exports: NAMED }));
  assert.equal(bare.status, 0, `without the hook the address is the shell's: ${bare.stdout}\n${bare.stderr}`);
});

/** What the daemon sets for each session it files, and what a server's unit serves with, as a step's own run of the suite inherits it. */
const DAEMONS: Record<(typeof SESSION_VARIABLES)[number] | (typeof SERVING_VARIABLES)[number], string> = {
  WF_SESSION_TOKEN: 'a-token-no-test-minted',
  WF_MEMORY_LIMIT: '6Gi',
  WF_MEMORY_REQUEST: '2560Mi',
  WF_MEMORY_RESERVED: '2Gi',
  WF_CGROUP_PARENT: 'sessions.slice',
  NEMIA_BIND: '100.126.244.0',
  WF_EXPOSED: '1',
  WF_SERVED_NAMES: 'nemia.example.ts.net',
};

test("REFUSED under the daemon's per-session and serving variables: a test file sees none of them, and without the hook it would", () => {
  const dir = scratch('wf-ambient-');
  const out = path.join(dir, 'seen.json');
  const names = Object.keys(DAEMONS);
  const text = [
    "import fs from 'node:fs';",
    `const seen = Object.fromEntries(${JSON.stringify(names)}.map((n) => [n, process.env[n] ?? null]));`,
    `test('the daemon', () => fs.writeFileSync(${JSON.stringify(out)}, JSON.stringify(seen)));`,
    '',
  ].join('\n');
  const env: Record<string, string | undefined> = { ...process.env, ...DAEMONS };
  const seen = (seated: boolean) => {
    const ran = probed(dir, text, env, seated);
    assert.equal(ran.status, 0, `${ran.stdout}\n${ran.stderr}`);
    return JSON.parse(fs.readFileSync(out, 'utf8'));
  };
  assert.deepEqual(seen(true), Object.fromEntries(names.map((n) => [n, null])));
  assert.deepEqual(seen(false), DAEMONS, "without the hook the fixture reads the daemon's, so the absence above is the hook");
});

/**
 * A test file that says where a harness keeps its files, run from the package with the person's own folder named in its environment:
 * with the package's setup files when `seated`, with none otherwise. Answers the run, and where it printed.
 */
function runConfigured(seated: boolean, own: string) {
  const dir = scratch('wf-ambient-');
  const out = path.join(dir, 'seen.txt');
  const text = [
    "import fs from 'node:fs';",
    `test('the folder', () => fs.writeFileSync(${JSON.stringify(out)}, process.env.CLAUDE_CONFIG_DIR ?? ''));`,
    '',
  ].join('\n');
  const env: Record<string, string | undefined> = { ...process.env, CLAUDE_CONFIG_DIR: own };
  const ran = probed(dir, text, env, seated);
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

test("the three roots a test process starts with are each a scratch folder, and none is the person's store", () => {
  const temp = fs.realpathSync(machineTempDir());
  for (const [name, dir, prefix] of [
    ['WF_ROOT', STORE, 'wf-ambient-store-'],
    ['AE_ROOT', ENGINE, 'wf-ambient-engine-'],
    ['HOME', AWAY, 'wf-ambient-home-'],
  ] as const) {
    assert.equal(process.env[name], dir, `${name} is not what ambient.ts made`);
    assert.ok(path.isAbsolute(dir), `${name}=${dir} is not absolute`);
    assert.ok(fs.realpathSync(dir).startsWith(`${temp}${path.sep}`), `${name}=${dir} is not under ${temp}`);
    assert.ok(path.basename(dir).startsWith(prefix), `${name}=${dir} is not a scratch folder of this process's`);
    for (const live of [path.join(REAL_HOME, '.agent-workflows'), path.join(REAL_HOME, '.agent-engine'), REAL_HOME]) {
      assert.notEqual(fs.realpathSync(dir), live, `${name} is the person's own ${live}`);
      assert.equal(fs.realpathSync(dir).startsWith(`${live}${path.sep}`), false, `${name} is under the person's own ${live}`);
    }
  }
  assert.equal(fs.realpathSync(os.homedir()), fs.realpathSync(AWAY), "os.homedir() still answers the person's own home");
});
