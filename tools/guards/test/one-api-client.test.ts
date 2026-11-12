/**
 * One client of the api: `objects` makes the typed client of its `Api` (`apiClient`, `packages/objects/src/api-client.ts`), and nothing
 * else in the repository builds one. Every TypeScript file git holds is read, sources and tests alike, and a call of a constructor of
 * effect's `HttpApiClient` (`make`, `makeWith`, `group`, `endpoint`) anywhere but there is refused, under any name the file imports it
 * by, with no baseline: a second client is where what each sets up around the contract — a bodiless write's body, the token, the bound,
 * an error body's decoding — drifts from the other's, as it did when a forwarded `nemia chat allow` was refused 415.
 *
 * Turbo caches this package's pass by its inputs, so a change elsewhere alone replays it: `npx turbo run test --force`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { files, ours, textOf } from 'test-kit/repo';

/** The one file that makes a typed client of the `Api`. */
const MAKER = 'packages/objects/src/api-client.ts';

/** A TypeScript file, of a source or a test. */
const TYPESCRIPT = /\.(?:ts|tsx|mts|cts)$/;

/**
 * The names `text` calls `HttpApiClient` by: its own, each `as` it is renamed to where it is imported from `effect/http-api`, and each
 * namespace its module is imported as.
 */
function clientNames(text: string): string[] {
  const names = ['HttpApiClient'];
  for (const m of text.matchAll(/\bHttpApiClient\s+as\s+([A-Za-z_$][\w$]*)/g)) names.push(m[1] ?? '');
  for (const m of text.matchAll(/import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+['"]effect\/http-api\/HttpApiClient['"]/g))
    names.push(m[1] ?? '');
  return names.filter(Boolean);
}

/** Each line of `text` that calls a constructor of `HttpApiClient`, as `<line>: <text>`. */
function clientsMade(text: string): string[] {
  const names = clientNames(text).map((n) => n.replace(/\$/g, '\\$')).join('|');
  const made = new RegExp(`\\b(?:${names})\\s*\\.\\s*(?:make|makeWith|group|endpoint)\\s*\\(`);
  return text.split('\n').flatMap((line, i) => (made.test(line) ? [`${i + 1}: ${line.trim().slice(0, 160)}`] : []));
}

test('no file but objects’ own builds a typed client of the Api: every consumer makes it with `apiClient`', () => {
  const read = files().filter((f) => TYPESCRIPT.test(f) && ours(f));
  for (const consumer of ['apps/cli/src/objects.ts', 'packages/agent-orchestrator/src/command/forward.verb.ts', 'apps/web/src/lib/api/objects.ts'])
    assert.ok(read.includes(consumer), `${consumer} is read: it is a consumer of the api`);
  assert.ok(clientsMade(textOf(MAKER) ?? '').length > 0, `${MAKER} makes the client: the rule reads the call it refuses elsewhere`);
  const found = read
    .filter((f) => f !== MAKER)
    .flatMap((f) => clientsMade(textOf(f) ?? '').map((line) => `${f}:${line}`));
  assert.deepEqual(
    found,
    [],
    `these build a typed client of their own; make it with \`apiClient\` of 'objects' (${MAKER}), giving it the base url, the token, the headers and the bound:\n${found.join('\n')}`,
  );
});

test('REFUSED: a typed client built by HttpApiClient under a name it is imported as', () => {
  // The planted file's lines are joined from their words, so this file, which the rule reads too, holds no call it refuses.
  const renamed = ['HttpApiClient', 'as', 'Made'].join(' ');
  const made = `const client = ${['Made', 'make'].join('.')}(Api, { baseUrl: base });`;
  const file = [`import { ${renamed} } from 'effect/http-api';`, "import { Api } from 'objects';", made].join('\n');
  assert.deepEqual(clientsMade(file), [`3: ${made}`]);
});
