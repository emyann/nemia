/**
 * The api's tests observe the harness `test/harness.ts` installs, and never this machine's registry: every test file imports it first, and
 * the `claude` the api's engine runs is the harness's.
 */
import { askEnded, bin, calls, observations, registry, unharnessed } from './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { scratch } from './scratch.ts';
import { runtime } from '../src/app.ts';
import { Engine } from '../src/store.ts';
import { engine } from 'agent-orchestrator';

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

test('every api test file imports the harness first, before anything that could observe this machine', () => {
  const dir = import.meta.dirname;
  const files = fs.readdirSync(dir).filter((file) => file.endsWith('.test.ts'));
  assert.ok(files.includes('app.test.ts') && files.includes('harness.test.ts'), "and this is looking at the api's tests");
  assert.deepEqual(
    files.map((file) => [file, unharnessed(fs.readFileSync(path.join(dir, file), 'utf8'))]).filter(([, why]) => why !== null),
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
});

test('no api test file loads a module with import(): the harness sets the store as it loads, so the api and the package are imported after it', () => {
  const dir = import.meta.dirname;
  const files = fs.readdirSync(dir).filter((file) => file.endsWith('.ts'));
  assert.ok(files.includes('app.test.ts') && files.includes('harness.ts'), "and this is looking at the api's tests");
  assert.deepEqual(
    files.flatMap((file) =>
      importCalls(fs.readFileSync(path.join(dir, file), 'utf8')).map(
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
  await e.file({ id: 't-harness', brief: 'Read me.', cwd: scratch('nemia-api-cwd-'), harness: 'claude' });
  let before = observations();
  await e.list();
  assert.ok(
    observations() > before,
    "the package's engine, listing a task filed on its Claude harness, observed the harness's `claude`: a list observes every harness, where a view of a task with no attempt in flight reads its record alone",
  );
  before = observations();
  await (await runtime.runPromise(Engine.useSync((e) => e))).list();
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
