/**
 * The api's tests observe the harness `test/harness.ts` installs, and never this machine's registry: the test script loads it with
 * `--import` before every test file, under `test/` or beside the code in `src/`, every test file imports it first too, and the `claude` the
 * api's engine runs is the harness's.
 */
import { askEnded, bin, calls, observations, registry, root, scriptUnharnessed, unharnessed } from './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { scratch } from './scratch.ts';
import { app, runtime } from '../src/app.ts';
import { Engine } from '../src/store.ts';
import { engine, tickRun } from 'agent-orchestrator';
import { runWith } from './placed.ts';

/** What a file's text loads with `import()`, each as its call is written: never one in a string, a comment or a type (`import('…').T`). */
function importCalls(text: string): string[] {
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) found.push(node.getText());
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile('test.ts', text, ts.ScriptTarget.Latest, true));
  return found;
}

/** The api package's folder. */
const API = path.join(import.meta.dirname, '..');

/** Every test file of the api from the package's folder, `test/x.test.ts` and each beside the code, `src/<folder>/x.test.ts`. */
const testFiles = (): string[] => [
  ...fs
    .readdirSync(path.join(API, 'test'))
    .filter((f) => f.endsWith('.test.ts'))
    .map((f) => `test/${f}`),
  ...fs
    .readdirSync(path.join(API, 'src'), { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.test.ts'))
    .map((f) => `src/${f.split(path.sep).join('/')}`),
];

test('every api test file imports the harness first, by its path from the file, before anything that could observe this machine', () => {
  const files = testFiles();
  assert.ok(files.includes('test/app.test.ts') && files.includes('test/harness.test.ts'), "and this is looking at the api's tests");
  assert.ok(files.includes('src/runs/prune.test.ts'), 'and at the ones beside the code');
  assert.deepEqual(
    files
      .map((file) => {
        const harness = path.posix.relative(path.posix.dirname(file), 'test/harness.ts');
        return [file, unharnessed(fs.readFileSync(path.join(API, file), 'utf8'), harness.startsWith('.') ? harness : `./${harness}`)];
      })
      .filter(([, why]) => why !== null),
    [],
  );
});

test('REFUSED: a test file whose first import is not the harness — a builtin, the api, none at all, or an import() above it — is named, with the fix', () => {
  const refused = (text: string, why: RegExp) => {
    const said = unharnessed(text);
    assert.ok(said !== null && why.test(said) && said.includes("Make `import './harness.ts'` first"), `${JSON.stringify(text)} → ${said}`);
  };
  refused("import { test } from 'node:test';\nimport './harness.ts';\n", /^its first import is node:test\./);
  refused(
    "import { app } from '../src/app.ts';\nimport { observations } from './harness.ts';\n",
    /^its first import is \.\.\/src\/app\.ts\./,
  );
  refused(
    "const { app } = await import('../src/app.ts');\nimport './harness.ts';\n",
    /^it imports a module with import\(\) before any static import\./,
  );
  refused('const one = 1;\n', /^it imports no harness\./);
  assert.equal(unharnessed("import './harness.ts';\nimport { test } from 'node:test';\n"), null);
  assert.equal(
    unharnessed("import {\n  observations,\n  registry,\n} from './harness.ts';\nconst { app } = await import('../src/app.ts');\n"),
    null,
  );
  assert.equal(
    unharnessed("import './harness.ts';\nimport { test } from 'node:test';\n", '../../test/harness.ts'),
    "its first import is ./harness.ts. Make `import '../../test/harness.ts'` first, above it.",
    'a test beside the code names the harness by its own path to it',
  );
  assert.equal(unharnessed("import { root } from '../../test/harness.ts';\n", '../../test/harness.ts'), null);
});

test("the api's test script loads the harness with --import before any test file", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(API, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
  assert.equal(scriptUnharnessed(pkg.scripts.test), null);
});

test('REFUSED: a test script that runs its files without the harness — no --import, another file, a near word, or after the files — is named, with the fix', () => {
  const refused = (script: string) =>
    assert.equal(
      scriptUnharnessed(script),
      `the test script (${script}) runs its test files without the harness. Make it \`node --import ./test/harness.ts --test …\`.`,
    );
  refused("node --test 'test/*.test.ts' 'src/**/*.test.ts'");
  refused("node --import ./test/scratch.ts --test 'test/*.test.ts'");
  refused("node --test --import-map ./test/harness.ts 'test/*.test.ts'");
  refused("node --test 'test/*.test.ts' --import ./test/harness.ts");
  refused("tsx --import ./test/harness.ts --test 'test/*.test.ts'");
  assert.equal(scriptUnharnessed("node --import ./test/harness.ts --test 'test/*.test.ts' 'src/**/*.test.ts'"), null);
  assert.equal(scriptUnharnessed("node --import=./test/harness.ts --test 'test/*.test.ts'"), null);
  assert.equal(scriptUnharnessed("node --test --import ./test/harness.ts 'test/*.test.ts'"), null);
});

test('--import installs the harness once in a test file that imports nothing of it, and not in the runner of `node --test`', () => {
  const dir = scratch('nemia-api-probe-');
  const out = path.join(dir, 'probe.json');
  fs.writeFileSync(
    path.join(dir, 'probe.test.mjs'),
    [
      "import { execFileSync } from 'node:child_process';",
      "import fs from 'node:fs';",
      "import { test } from 'node:test';",
      "test('probe', () => {",
      "  const claude = execFileSync('sh', ['-c', 'command -v claude || true'], { encoding: 'utf8' }).trim();",
      '  fs.writeFileSync(process.env.PROBE_OUT, JSON.stringify({ claude, path: process.env.PATH, wfRoot: process.env.WF_ROOT }));',
      '});',
      '',
    ].join('\n'),
  );
  const env: Record<string, string | undefined> = { ...process.env, PROBE_OUT: out };
  env.PATH = (process.env.PATH ?? '')
    .split(path.delimiter)
    .filter((p) => !p.includes('nemia-api-harness-'))
    .join(path.delimiter);
  for (const key of ['WF_ROOT', 'CLAUDE_CONFIG_DIR', 'WF_VERIFY_REST', 'NODE_TEST_CONTEXT', 'NODE_OPTIONS']) delete env[key];
  const ran = spawnSync(process.execPath, ['--import', path.join(API, 'test', 'harness.ts'), '--test', 'probe.test.mjs'], {
    cwd: dir,
    env,
    encoding: 'utf8',
    timeout: 60_000,
  });
  assert.equal(ran.status, 0, `${ran.stdout}\n${ran.stderr}`);
  const seen = JSON.parse(fs.readFileSync(out, 'utf8')) as { claude: string; path: string; wfRoot?: string };
  const harnesses = seen.path.split(path.delimiter).filter((p) => path.basename(p).startsWith('nemia-api-harness-'));
  assert.equal(harnesses.length, 1, `one harness on the test's PATH, none from the runner: ${harnesses.join(', ')}`);
  assert.equal(seen.claude, path.join(harnesses[0], 'claude'), "the test's `claude` is the harness's");
  assert.ok(path.basename(seen.wfRoot ?? '').startsWith('nemia-api-store-'), `the store is a scratch folder: ${seen.wfRoot}`);
});

test("REFUSED under the daemon's OTEL_EXPORTER_OTLP_ENDPOINT: a test file run under the harness sees no collector, and without it sees the shell's", () => {
  const dir = scratch('nemia-api-probe-');
  const out = path.join(dir, 'probe.json');
  fs.writeFileSync(
    path.join(dir, 'probe.test.mjs'),
    [
      "import fs from 'node:fs';",
      "import { test } from 'node:test';",
      "const address = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? null;",
      "test('probe', () => fs.writeFileSync(process.env.PROBE_OUT, JSON.stringify({ address })));",
      '',
    ].join('\n'),
  );
  const named = 'http://127.0.0.1:9';
  const env: Record<string, string | undefined> = { ...process.env, PROBE_OUT: out, OTEL_EXPORTER_OTLP_ENDPOINT: named };
  for (const key of ['NODE_TEST_CONTEXT', 'NODE_OPTIONS']) delete env[key];
  const seen = (flags: string[]): unknown => {
    const ran = spawnSync(process.execPath, [...flags, '--test', 'probe.test.mjs'], { cwd: dir, env, encoding: 'utf8', timeout: 60_000 });
    assert.equal(ran.status, 0, `${ran.stdout}\n${ran.stderr}`);
    return JSON.parse(fs.readFileSync(out, 'utf8'));
  };
  assert.deepEqual(seen(['--import', path.join(API, 'test', 'harness.ts')]), { address: null });
  assert.deepEqual(seen([]), { address: named }, 'the probe reads what it is given, so the absence above is the harness');
});

test("REFUSED, whatever the daemon's: a test that leaves WF_MAX_RUNS to the harness is answered 422 by GET /api/ceilings, naming the variable to set", async () => {
  fs.rmSync(path.join(root, 'tick.json'), { force: true });
  const res = await app.request('/api/ceilings');
  assert.equal(res.status, 422, await res.clone().text());
  assert.equal(
    ((await res.json()) as { error: string }).error,
    'WF_MAX_RUNS=set-it-in-the-test is not a count. It is the most runs in flight at once, a whole number: WF_MAX_RUNS=2 — or 0, or unset, for no cap.',
  );
});

test("REFUSED, whatever the daemon's: a test that ticks with WF_MAX_CONCURRENT left to the harness is refused, naming the variable to set", async (t) => {
  const runs = process.env.WF_MAX_RUNS;
  t.after(() => {
    if (runs === undefined) delete process.env.WF_MAX_RUNS;
    else process.env.WF_MAX_RUNS = runs;
  });
  process.env.WF_MAX_RUNS = '0';
  await assert.rejects(runWith(engine(), tickRun({})), (err: Error) => {
    assert.equal(
      err.message,
      'WF_MAX_CONCURRENT=set-it-in-the-test is not a count from 1. It is the most sessions at work per pool at once, a whole number: WF_MAX_CONCURRENT=4 — or unset, for 2.',
    );
    return true;
  });
});

test('no api test file loads a module with import(): the harness sets the store as it loads, so the api and the package are imported after it', () => {
  const files = [
    ...fs
      .readdirSync(path.join(API, 'test'))
      .filter((f) => f.endsWith('.ts'))
      .map((f) => `test/${f}`),
    ...testFiles().filter((f) => f.startsWith('src/')),
  ];
  assert.ok(files.includes('test/app.test.ts') && files.includes('test/harness.ts'), "and this is looking at the api's tests");
  assert.ok(files.includes('src/runs/prune.test.ts'), 'and at the ones beside the code');
  assert.deepEqual(
    files.flatMap((file) =>
      importCalls(fs.readFileSync(path.join(API, file), 'utf8')).map(
        (call) => `${file} loads a module with ${call}: import it statically, after './harness.ts', which gives the store (\`root\`)`,
      ),
    ),
    [],
  );
});

test('REFUSED: a file that loads the api or the package with import() is named; a type import and a string are not', () => {
  assert.deepEqual(importCalls("import './harness.ts';\nconst { app } = await import('../src/app.ts');\n"), ["import('../src/app.ts')"]);
  assert.deepEqual(importCalls("test('t', async () => {\n  await import('agent-orchestrator');\n});\n"), ["import('agent-orchestrator')"]);
  assert.deepEqual(importCalls("type Run = import('agent-orchestrator').Run;\nconst said = \"await import('x')\";\n"), []);
});

test("the `claude` the api's engine runs is the harness's: it resolves there, answers with the harness's registry, and each observation is noted", async () => {
  assert.equal(execFileSync('sh', ['-c', 'command -v claude'], { encoding: 'utf8' }).trim(), path.join(bin, 'claude'));
  fs.writeFileSync(
    registry,
    JSON.stringify([
      { name: 'ae/t-harness/1', sessionId: 'a-session', kind: 'background', state: 'working', status: 'busy', startedAt: 0 },
    ]),
  );
  const listed = execFileSync('claude', ['agents', '--all', '--json'], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(listed), JSON.parse(fs.readFileSync(registry, 'utf8')));
  fs.writeFileSync(registry, '[]');

  const e = engine();
  await Effect.runPromise(e.file({ id: 't-harness', brief: 'Read me.', cwd: scratch('nemia-api-cwd-'), harness: 'claude' }));
  let before = observations();
  await Effect.runPromise(e.list());
  assert.ok(
    observations() > before,
    "the package's engine, listing a task filed on its Claude harness, observed the harness's `claude`: a list observes every harness, where a view of a task with no attempt in flight reads its record alone",
  );
  before = observations();
  await Effect.runPromise((await runtime.runPromise(Engine.useSync((e) => e))).list());
  assert.ok(observations() > before, "and so did the api's");
  assert.match(fs.readFileSync(calls, 'utf8'), /^agents --all --json$/m);
});

test("the harness's `claude` answers a get_usage request with the request's own id, and ends only once its stdin is closed", async () => {
  const child = spawn('claude', ['-p', '--input-format', 'stream-json'], { stdio: ['pipe', 'pipe', 'ignore'] });
  let out = '';
  const line = new Promise<string>((resolve) =>
    child.stdout.on('data', (d: Buffer) => {
      out += d;
      if (out.includes('\n')) resolve(out.slice(0, out.indexOf('\n')));
    }),
  );
  child.stdin.write(
    `${JSON.stringify({ type: 'control_request', request_id: 'mine-7', request: { subtype: 'get_usage', skip_behaviors: true } })}\n`,
  );
  const answered = JSON.parse(await line) as { type: string; response: { request_id: string; subtype: string } };
  assert.deepEqual([answered.type, answered.response.request_id, answered.response.subtype], ['control_response', 'mine-7', 'success']);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(child.exitCode, null, 'it waits on its stdin, as Claude Code does');
  assert.equal(askEnded(child.pid!), false);
  child.stdin.end();
  await new Promise((r) => child.once('exit', r));
  assert.equal(askEnded(child.pid!), true);
});
