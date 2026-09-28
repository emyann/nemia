/**
 * The board's mirror of the api is one file per concern under src/lib/api/, which src/lib/api.ts re-exports. None of them may reach the
 * re-exporting file or each other at run time: a type crosses between them by `import type`, which is erased, and the only values they
 * import are react-query's, the feed's pace and their one read (`get`, read.ts). So no runtime import cycle can form among them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(import.meta.dirname, '../src/lib/api');

/** What the files under src/lib/api/ may import values from. */
const ALLOWED = new Set(['@tanstack/react-query', '../feed.ts', './read.ts']);

/** The specifiers `text` imports or re-exports values from: every `import`/`export … from` but `import type` and `export type`. */
export function valueImports(text: string): string[] {
  return [
    ...text.matchAll(/^(import|export)\s+(type\s+)?(?:\{[^}]*\}|\*(?:\s+as\s+\w+)?|\w+(?:\s*,\s*\{[^}]*\})?)\s+from\s+['"]([^'"]+)['"]/gm),
  ]
    .filter((m) => !m[2])
    .map((m) => m[3]);
}

test('REFUSED: a value import of the re-exporting file or of a sibling is found; a type import is not', () => {
  const text = [
    "import { get } from '../api.ts';",
    "import { runsQuery } from './runs.ts';",
    "import type { RunGraph } from './graph.ts';",
    "export * from './steps.ts';",
    "export type { Said } from './asks.ts';",
  ].join('\n');
  assert.deepEqual(
    valueImports(text).filter((s) => !ALLOWED.has(s)),
    ['../api.ts', './runs.ts', './steps.ts'],
  );
});

test('the files under src/lib/api/ import values from react-query, the feed and read.ts alone, and read.ts from nothing', () => {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.ts'));
  assert.ok(files.length > 10 && files.includes('read.ts'), `the mirror's files: ${files.join(', ')}`);
  const found = files.flatMap((f) => {
    const text = fs.readFileSync(path.join(DIR, f), 'utf8');
    const values = valueImports(text);
    return (f === 'read.ts' ? values : values.filter((s) => !ALLOWED.has(s))).map((s) => `${f} imports ${s}`);
  });
  assert.deepEqual(found, [], "import a sibling's type with `import type`; a value two of them need goes in read.ts");
});
