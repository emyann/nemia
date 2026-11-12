/**
 * What a test is given of the environment, read off a file's text. `seatLists`: a test seat drops the daemon's per-session variables and
 * its serving ones by the orchestrator's lists, `SESSION_VARIABLES` and `SERVING_VARIABLES`, imported, never a copy of their names in an
 * array of its own; the four seats are held to them here. `moduleEnvWrites`: each line that writes a `WF_` variable into the process's
 * environment as a module loads (an assignment, a `delete` or an `Object.assign(process.env, …)` at column 0), which every test that runs
 * in that process then reads: a test builds the environment it means and hands it on instead. Each is proven on planted texts, then swept:
 * the four seats by `seatLists`, and every test file of every workspace by `moduleEnvWrites`, with no baseline, the two seats that point
 * the process at its throwaway store (`ENV_SEATS`) excepted.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { files, ours, REPO } from 'test-kit/repo';

/** The four test seats: what each workspace's tests are given of the environment before, or as, they run. */
export const SEATS = [
  'packages/agent-orchestrator/test/ambient.ts',
  'apps/api/test/harness.ts',
  'apps/cli/test/ambient.ts',
  'packages/templates/test/template.ts',
] as const;

/** The two seats that set the throwaway store in the process's own environment, which every test of their workspace then reads. */
export const ENV_SEATS = ['packages/agent-orchestrator/test/ambient.ts', 'apps/api/test/harness.ts'] as const;

/** Whether `file`, a path from the root, is a test's: under a `test/` folder, or a `.test.ts` beside its source. */
const isTestFile = (file: string): boolean => /\.tsx?$/.test(file) && (/(^|\/)test\//.test(file) || /\.test\.tsx?$/.test(file));

/** `text` with its comments blanked, line for line, so a name in prose is not read as code. */
const codeOf = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

/**
 * The orchestrator's lists a seat drops, each by its name, with two of its names a copy of it would hold: the daemon's per-session
 * variables, and its serving ones (where its api listens, and whether its store is marked exposed).
 */
export const LISTS = [
  { list: 'SESSION_VARIABLES', copy: ['WF_SESSION_TOKEN', 'WF_MEMORY_LIMIT'], what: 'per-session' },
  { list: 'SERVING_VARIABLES', copy: ['NEMIA_BIND', 'WF_EXPOSED'], what: 'serving' },
] as const;

/**
 * Why the seat whose text is `text` does not drop each of `LISTS` by the orchestrator's one list, a reason each: an array literal holding
 * both names of its `copy`, its copy of the list; no import of the list (static, or awaited once the seat has set what the package reads
 * as it loads); or an import of it unread.
 */
export function seatLists(text: string): string[] {
  const code = codeOf(text);
  const why: string[] = [];
  for (const { list, copy, what } of LISTS) {
    for (const array of code.match(/\[[^[\]]*\]/g) ?? [])
      if (copy.every((name) => new RegExp(`['"]${name}['"]`).test(array)))
        why.push(
          `it lists the ${what} variables itself (${array.replace(/\s+/g, ' ')}): import ${list} from agent-orchestrator and drop it`,
        );
    const imported = new RegExp(
      String.raw`import\s*\{[^}]*\b${list}\b[^}]*\}\s*from\s*['"][^'"]+['"]|\{[^}]*\b${list}\b[^}]*\}\s*=\s*await\s+import\(\s*['"][^'"]+['"]\s*\)`,
    ).exec(code);
    if (!imported) why.push(`it imports no ${list}: import it from agent-orchestrator and drop each of its names`);
    else if (code.replace(imported[0], '').search(new RegExp(`\\b${list}\\b`)) < 0)
      why.push(`it imports ${list} and reads it nowhere: delete each of its names from the environment it gives`);
  }
  return why;
}

/**
 * Each line of `text` that writes a `WF_` variable into `process.env` as the module loads, as `<line>: <what>`: an assignment of a
 * `WF_` name on it, dotted or bracketed, its `delete`, or an `Object.assign(process.env, …)` naming one, at column 0. One indented
 * inside a test's body, a copy of the environment (`{ ...process.env, WF_X }`), and a name in a comment are passed over.
 */
export function moduleEnvWrites(text: string): string[] {
  const lines = codeOf(text).split('\n');
  const named = String.raw`process\.env(?:\.(WF_\w+)|\[\s*['"](WF_\w+)['"]\s*\])`;
  const assigned = new RegExp(String.raw`^${named}\s*(?:\?\?|\|\||&&)?=(?!=)`);
  const deleted = new RegExp(String.raw`^delete\s+${named}`);
  const written: string[] = [];
  lines.forEach((line, i) => {
    const at = assigned.exec(line) ?? deleted.exec(line);
    if (at) {
      written.push(`${i + 1}: ${at[0].startsWith('delete') ? 'delete ' : ''}process.env.${at[1] ?? at[2]}`);
      return;
    }
    if (!/^Object\.assign\(\s*process\.env\s*,/.test(line)) return;
    const rest = lines.slice(i).join('\n');
    const statement = rest.slice(0, rest.search(/\)\s*;|\)\s*$/m) + 1 || rest.length);
    for (const [, name] of statement.matchAll(/['"]?\b(WF_\w+)['"]?\s*:/g)) written.push(`${i + 1}: Object.assign(process.env) ${name}`);
  });
  return written;
}

test('REFUSED: a seat holding its own copy of the per-session variables, or no import of SESSION_VARIABLES', () => {
  const copied = [
    "import { SERVING_VARIABLES } from 'agent-orchestrator';",
    "export const DAEMON_ONLY = ['WF_SESSION_TOKEN', 'WF_MEMORY_LIMIT', 'WF_CGROUP_PARENT'] as const;",
    'for (const name of [...DAEMON_ONLY, ...SERVING_VARIABLES]) delete process.env[name];',
  ].join('\n');
  assert.equal(seatLists(copied).length, 2, 'its copy, and no import');
  const inline = [
    "import { SERVING_VARIABLES, SESSION_VARIABLES } from 'agent-orchestrator';",
    "for (const name of [...SERVING_VARIABLES, 'OTEL_EXPORTER_OTLP_ENDPOINT', \"WF_SESSION_TOKEN\", 'WF_MEMORY_LIMIT']) delete env[name];",
  ].join('\n');
  assert.equal(seatLists(inline).length, 2, 'its copy, and the import unread');
});

test('REFUSED: a seat that drops the per-session variables and not the serving ones', () => {
  const seat = [
    "import { SESSION_VARIABLES } from 'agent-orchestrator';",
    "for (const name of [...SESSION_VARIABLES, 'NEMIA_BIND', 'WF_EXPOSED']) delete process.env[name];",
  ].join('\n');
  assert.equal(seatLists(seat).length, 2, 'its copy of the serving variables, and no import of SERVING_VARIABLES');
});

test('a seat that imports both lists and drops them passes, their names said in prose', () => {
  const seat = [
    "/** Drops `WF_SESSION_TOKEN` and `NEMIA_BIND`: ['WF_SESSION_TOKEN', 'WF_MEMORY_LIMIT'], ['NEMIA_BIND', 'WF_EXPOSED'] in prose. */",
    "import { SENTINEL, SERVING_VARIABLES, SESSION_VARIABLES } from 'agent-orchestrator';",
    "for (const name of [...SESSION_VARIABLES, ...SERVING_VARIABLES, 'OTEL_EXPORTER_OTLP_ENDPOINT']) delete env[name];",
  ].join('\n');
  assert.deepEqual(seatLists(seat), []);
  const awaited = [
    "const { SERVING_VARIABLES, SESSION_VARIABLES } = await import('agent-orchestrator');",
    'for (const name of [...SESSION_VARIABLES, ...SERVING_VARIABLES]) delete process.env[name];',
  ].join('\n');
  assert.deepEqual(seatLists(awaited), []);
});

test('each of the four seats drops the per-session and the serving variables by their lists', () => {
  const refused = SEATS.flatMap((seat) => seatLists(fs.readFileSync(path.join(REPO, seat), 'utf8')).map((why) => `${seat}: ${why}`));
  assert.deepEqual(refused, []);
});

test('REFUSED: a WF_ variable written into the environment at column 0, assigned, deleted or Object.assign-ed', () => {
  const planted: Record<string, string> = {
    'process.env.WF_ROOT = ROOT;': '1: process.env.WF_ROOT',
    'delete process.env.WF_MAX_RUNS;': '1: delete process.env.WF_MAX_RUNS',
    "process.env['WF_VERIFY_REST'] = '1';": '1: process.env.WF_VERIFY_REST',
    'Object.assign(process.env, { WF_ROOT: x });': '1: Object.assign(process.env) WF_ROOT',
  };
  for (const [line, said] of Object.entries(planted))
    assert.deepEqual(moduleEnvWrites(`import x from 'x';\n${line}`), [said.replace(/^1/, '2')]);
  assert.deepEqual(moduleEnvWrites('Object.assign(process.env, {\n  PATH: p,\n  WF_ROOT: x,\n});'), [
    '1: Object.assign(process.env) WF_ROOT',
  ]);
});

test('a write inside a test, a copy of the environment, a comparison and a name in a comment are passed over', () => {
  const text = [
    "test('mine', () => {",
    '  process.env.WF_ROOT = ROOT;',
    '  delete process.env.WF_MAX_RUNS;',
    "  process.env['WF_VERIFY_REST'] = '1';",
    '  Object.assign(process.env, { WF_ROOT: x });',
    '});',
    "spawn('node', [], { env: { ...process.env, WF_ROOT: x } });",
    "if (process.env.WF_ROOT === '/x') run();",
    'Object.assign(process.env, { PATH: p });',
    '// process.env.WF_ROOT = ROOT;',
    '/*',
    'process.env.WF_ROOT = ROOT;',
    '*/',
  ].join('\n');
  assert.deepEqual(moduleEnvWrites(text), []);
});

test('no test file of any workspace writes a WF_ variable into the environment as it loads, the two seats excepted', () => {
  const seats = new Set<string>(ENV_SEATS);
  const tests = files().filter((file) => isTestFile(file) && ours(file) && !seats.has(file));
  assert.ok(tests.length > 500, `the sweep reads every workspace's tests: ${tests.length} found`);
  const written = tests.flatMap((file) => {
    const text = fs.existsSync(path.join(REPO, file)) ? fs.readFileSync(path.join(REPO, file), 'utf8') : '';
    return moduleEnvWrites(text).map((line) => `${file}:${line}: build the environment the test means and hand it on`);
  });
  assert.deepEqual(written, []);
});
