/**
 * The A2A SDK stays inside the seam: only the files of `src/a2a/`, its face `index.ts` left out, import `@a2a-js/sdk`,
 * by any entry, and neither of the runtime's entries hands a consumer an SDK name or value. A consumer of the runtime
 * learns no protocol, and a change of SDK is a change to the seam's files alone.
 *
 * Each rule is made to refuse planted source first: a scan that read nothing, or matched nothing, passes too.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const PKG = path.join(import.meta.dirname, '..');
const SDK = '@a2a-js/sdk';
const SDK_ENTRIES = [SDK, `${SDK}/client`, `${SDK}/server`, `${SDK}/errors`];

/** A line of prose read as nothing, as `contract.test.ts` reads one, the line kept so numbers still count. */
const withoutComments = (text: string): string =>
  text
    .split('\n')
    .map((line) => (/^\s*(\/\/|\/\*|\*)/.test(line) ? '' : line))
    .join('\n');

/** Every module a piece of source names: imports and re-exports, type-only included, `import()` and `require()` (as `contract.test.ts`). */
function specifiersIn(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/^\s*(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/gm)) found.add(m[1]);
  for (const m of text.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) found.add(m[1]);
  for (const m of text.matchAll(/\b(?:import|require|import\.meta\.resolve|require\.resolve)\s*\(\s*['"`]([^'"`]+)['"`]/g)) found.add(m[1]);
  return [...found].sort();
}

/** The seam's files that speak no protocol: the registry's entry, and a send's lease read off it. */
const SDK_FREE = ['src/a2a/entry.ts', 'src/a2a/sending.ts'];

/** The seam's files, by their path in the package. */
const inSeam = (file: string) => /^src\/a2a\/[a-z0-9-]+\.ts$/.test(file) && file !== 'src/a2a/index.ts';

/** Where `file` reaches the SDK from outside the seam: each breach, worded with what to do instead. */
function sdkBreaches(file: string, text: string): string[] {
  if (inSeam(file)) return [];
  return specifiersIn(withoutComments(text))
    .filter((spec) => spec === SDK || spec.startsWith(`${SDK}/`))
    .map(
      (spec) =>
        `${file} imports ${spec}: only src/a2a/ speaks A2A, its face left out — reach a harness through RunnerOps, and put what needs the SDK in the seam`,
    );
}

/** The package's own source: what ships, tests left out (a test of the seam speaks its protocol). */
const sourceFiles = () =>
  ['src', 'bin'].flatMap((dir) =>
    fs
      .readdirSync(path.join(PKG, dir), { recursive: true, encoding: 'utf8' })
      .filter((f) => /\.(ts|mts|cts|js|mjs|cjs)$/.test(f) && !f.endsWith('.test.ts'))
      .map((f) => `${dir}/${f.split(path.sep).join('/')}`),
  );

test('the scan reads the seam and the rest of the package — or it would pass by reading nothing', () => {
  const files = sourceFiles();
  assert.deepEqual(files.filter(inSeam), [
    'src/a2a/card.ts',
    'src/a2a/client.ts',
    'src/a2a/entry.ts',
    'src/a2a/follow.ts',
    'src/a2a/handler.ts',
    'src/a2a/map.ts',
    'src/a2a/remote-client.ts',
    'src/a2a/remote-events.ts',
    'src/a2a/remote-follow.ts',
    'src/a2a/remote.ts',
    'src/a2a/said.ts',
    'src/a2a/sending.ts',
  ]);
  assert.ok(files.includes('src/index.ts') && files.includes('src/core/engine/engine.ts') && files.includes('bin/ae.ts'));
  const sdkOf = (f: string) => specifiersIn(fs.readFileSync(path.join(PKG, f), 'utf8')).some((s) => s.startsWith(SDK));
  assert.ok(
    files.filter((f) => inSeam(f) && !SDK_FREE.includes(f)).every(sdkOf),
    'and every other seam file imports the SDK, so the pattern matches an import of it',
  );
  assert.deepEqual(
    files.filter(inSeam).filter((f) => !sdkOf(f)),
    SDK_FREE,
    'the seam files that need no SDK, and only they',
  );
});

test('only src/a2a/ imports @a2a-js/sdk, by any entry', () => {
  assert.deepEqual(
    sourceFiles().flatMap((f) => sdkBreaches(f, fs.readFileSync(path.join(PKG, f), 'utf8'))),
    [],
  );
});

test('REFUSED: the SDK imported outside the seam — the root, a subpath, a type, a re-export, a dynamic import', () => {
  const why = 'only src/a2a/ speaks A2A, its face left out — reach a harness through RunnerOps, and put what needs the SDK in the seam';
  const planted: Array<[string, string, string]> = [
    ['src/core/engine/engine.ts', "import { TaskState } from '@a2a-js/sdk';", '@a2a-js/sdk'],
    ['src/cli/main.ts', "import { Client } from '@a2a-js/sdk/client';", '@a2a-js/sdk/client'],
    ['src/harness/seam.ts', "import type { A2ARequestHandler } from '@a2a-js/sdk/server';", '@a2a-js/sdk/server'],
    ['src/index.ts', "export { TaskNotFoundError } from '@a2a-js/sdk/errors';", '@a2a-js/sdk/errors'],
    ['bin/ae.ts', "const sdk = await import('@a2a-js/sdk');", '@a2a-js/sdk'],
    ['src/a2a.ts', "import { Role } from '@a2a-js/sdk';", '@a2a-js/sdk'],
    ['src/a2a/map.test.ts', "import { Role } from '@a2a-js/sdk';", '@a2a-js/sdk'],
    ['src/a2a/index.ts', "export { Role } from '@a2a-js/sdk';", '@a2a-js/sdk'],
    ['src/a2a-client.ts', "import { Client } from '@a2a-js/sdk/client';", '@a2a-js/sdk/client'],
  ];
  for (const [file, line, spec] of planted) {
    assert.deepEqual(sdkBreaches(file, `// the seam\n${line}\n`), [`${file} imports ${spec}: ${why}`], `${file}: ${line}`);
  }
  assert.deepEqual(sdkBreaches('src/a2a/client.ts', "import { Client } from '@a2a-js/sdk/client';"), [], 'not refused: the seam itself');
  assert.deepEqual(
    sdkBreaches('src/core/engine/engine.ts', "// import { TaskState } from '@a2a-js/sdk';\n * from '@a2a-js/sdk'"),
    [],
    'not refused: prose that names the SDK',
  );
});

/** Every name and value the SDK's entries export. */
const sdkExports = async () => {
  const names = new Set<string>();
  const values = new Set<unknown>();
  for (const entry of SDK_ENTRIES) {
    for (const [name, value] of Object.entries(await import(entry))) {
      names.add(name);
      if ((typeof value === 'function' || typeof value === 'object') && value !== null) values.add(value);
    }
  }
  return { names, values };
};

/** What an entry of the runtime hands a consumer of the SDK's: by name, or by value under a name of its own. */
function exportBreaches(entry: string, exported: Record<string, unknown>, sdk: { names: Set<string>; values: Set<unknown> }): string[] {
  return Object.entries(exported).flatMap(([name, value]) =>
    sdk.names.has(name) || sdk.values.has(value)
      ? [`${entry} exports ${name}, which is the A2A SDK's: a consumer of the runtime learns no protocol — keep it inside src/a2a/`]
      : [],
  );
}

test("neither of the runtime's entries exports an SDK name or value", async () => {
  const sdk = await sdkExports();
  assert.ok(sdk.names.has('TaskState') && sdk.names.has('Client') && sdk.names.has('TaskNotFoundError'), 'the SDK was read');
  for (const entry of ['agent-runtime', 'agent-runtime/vocabulary', 'agent-runtime/testing']) {
    assert.deepEqual(exportBreaches(entry, { ...(await import(entry)) }, sdk), [], entry);
  }
});

test('REFUSED: an entry that exports an SDK name, or an SDK value renamed', async () => {
  const sdk = await sdkExports();
  const { TaskState } = await import(SDK);
  const { Client } = await import(`${SDK}/client`);
  const root = { ...(await import('agent-runtime')) };
  assert.deepEqual(exportBreaches('agent-runtime', { ...root, TaskState }, sdk), [
    "agent-runtime exports TaskState, which is the A2A SDK's: a consumer of the runtime learns no protocol — keep it inside src/a2a/",
  ]);
  assert.deepEqual(exportBreaches('agent-runtime/vocabulary', { A2AClient: Client }, sdk), [
    "agent-runtime/vocabulary exports A2AClient, which is the A2A SDK's: a consumer of the runtime learns no protocol — keep it inside src/a2a/",
  ]);
});
