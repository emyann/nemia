/**
 * The board's mirror of the api is one file per concern under src/lib/api/, which src/lib/api.ts re-exports. None of them may reach the
 * re-exporting file at run time, and a sibling only one level deep: a file may import values from a sibling that imports values from no
 * sibling (the schemas of judged.ts and graph.ts, which runs.ts decodes with), so no runtime import cycle can form among them. A type
 * crosses by `import type`, which is erased; the other values they import are react-query's, effect's, the feed's pace, their reads
 * (read.ts), `decodes` (decodes.ts) and the codes of where a step stands (reasons.ts); read.ts imports effect alone, decodes.ts no value at
 * all, and reasons.ts effect and decodes.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(import.meta.dirname, '../src/lib/api');

/** What the files under src/lib/api/ may import values from. */
const ALLOWED = new Set(['@tanstack/react-query', 'effect', '../feed.ts', './read.ts', './decodes.ts', './reasons.ts']);

/** What read.ts, the reads every file imports, may import values from. */
const READ_ALLOWED = new Set(['effect']);

/**
 * What each file every other file imports may import values from: read.ts effect alone, decodes.ts nothing, and reasons.ts — the codes
 * the runs' and the tries' schemas both decode with — effect and decodes.ts.
 */
const SHARED: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['read.ts', READ_ALLOWED],
  ['decodes.ts', new Set<string>()],
  ['reasons.ts', new Set(['effect', './decodes.ts'])],
]);

/** A specifier naming a sibling under src/lib/api/, other than the shared files (`SHARED`). */
const sibling = (s: string) => /^\.\/[^/]+\.ts$/.test(s) && !SHARED.has(s.slice(2));

/**
 * What the files under src/lib/api/ import that they may not, given each file's text: a line each, `<file> imports <specifier>`. A sibling
 * may be imported only where it imports values from no sibling itself; read.ts and decodes.ts import only what `SHARED` gives each.
 */
export function importFaults(texts: ReadonlyMap<string, string>): string[] {
  const values = new Map([...texts].map(([f, text]) => [f, valueImports(text)]));
  const leaf = (s: string) => !(values.get(s.slice(2)) ?? []).some(sibling);
  return [...values].flatMap(([f, specs]) =>
    specs
      .filter((s) => {
        const shared = SHARED.get(f);
        return shared ? !shared.has(s) : !ALLOWED.has(s) && !(sibling(s) && texts.has(s.slice(2)) && leaf(s));
      })
      .map((s) => `${f} imports ${s}`),
  );
}

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

test('REFUSED: a value import of a sibling that imports a sibling, of anything but effect in read.ts, and of anything in decodes.ts', () => {
  const texts = new Map([
    ['runs.ts', "import { RunGraphSchema } from './graph.ts';\nimport { Schema } from 'effect';"],
    ['graph.ts', "import { EdgeSchema } from './edges.ts';\nimport type { Spent } from './judged.ts';"],
    ['edges.ts', "import { Schema } from 'effect';"],
    ['judged.ts', "import { runsQuery } from './runs.ts';"],
    ['read.ts', "import { Schema } from 'effect';\nimport { pace } from '../feed.ts';"],
    ['decodes.ts', "import { Schema } from 'effect';"],
    ['quota.ts', "import { decodes } from './decodes.ts';\nimport { get } from './read.ts';"],
  ]);
  assert.deepEqual(importFaults(texts), [
    'runs.ts imports ./graph.ts',
    'judged.ts imports ./runs.ts',
    'read.ts imports ../feed.ts',
    'decodes.ts imports effect',
  ]);
});

test('the files under src/lib/api/ import values from react-query, effect, the feed, read.ts and a leaf sibling alone, and read.ts from effect', () => {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.ts'));
  assert.ok(files.length > 10 && files.includes('read.ts'), `the mirror's files: ${files.join(', ')}`);
  const texts = new Map(files.map((f) => [f, fs.readFileSync(path.join(DIR, f), 'utf8')]));
  assert.ok(valueImports(texts.get('runs.ts') ?? '').includes('./judged.ts'), 'runs.ts decodes with the schemas of judged.ts');
  assert.deepEqual(
    importFaults(texts),
    [],
    "import a sibling's type with `import type`; a value two of them need goes in read.ts, or in a sibling that imports no sibling",
  );
});
