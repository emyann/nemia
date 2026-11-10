/**
 * The board's reads of the api are one file per concern under src/lib/api/, each imported by its own path (no barrel re-exports them). A
 * file reaches a sibling only one level deep: it may import values from a sibling that imports values from no sibling (the objects'
 * client, objects.ts, which every read goes through), so no runtime import cycle can form among them. A type crosses by `import type`,
 * which is erased; the other values they import are react-query's, effect's, the objects' (`objects`, by its entry, whose words and
 * schemas the board reads rather than copies), the feed's pace, the refusals and the decode (read.ts) and `decodes` (decodes.ts); read.ts
 * imports effect alone and decodes.ts no value at all. The objects' client alone imports effect's HTTP client and HttpApi modules
 * besides, which make it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Schema, SchemaAST } from 'effect';
import * as objects from 'objects';
import ts from 'typescript';

const DIR = path.resolve(import.meta.dirname, '../src/lib/api');

/** The board's source, as a file's path under apps/web to its text. */
const SRC = path.resolve(import.meta.dirname, '../src');

/** What the files under src/lib/api/ may import values from. */
const ALLOWED = new Set(['@tanstack/react-query', 'effect', 'objects', '../feed.ts', './read.ts', './decodes.ts']);

/** What one file alone may import besides: the objects' client, effect's modules that make it. */
const OWN: ReadonlyMap<string, ReadonlySet<string>> = new Map([['objects.ts', new Set(['effect/http', 'effect/http-api'])]]);

/** What read.ts, the reads every file imports, may import values from. */
const READ_ALLOWED = new Set(['effect']);

/** What each file every other file imports may import values from: read.ts effect alone, and decodes.ts nothing. */
const SHARED: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['read.ts', READ_ALLOWED],
  ['decodes.ts', new Set<string>()],
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
        return shared ? !shared.has(s) : !ALLOWED.has(s) && !OWN.get(f)?.has(s) && !(sibling(s) && texts.has(s.slice(2)) && leaf(s));
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
    [
      'objects.ts',
      "import { HttpApiClient } from 'effect/http-api';\nimport { Api } from 'objects';\nimport { Run } from 'objects/src/run.ts';",
    ],
    ['cards.ts', "import { cards } from './objects.ts';\nimport { FetchHttpClient } from 'effect/http';"],
  ]);
  assert.deepEqual(importFaults(texts), [
    'runs.ts imports ./graph.ts',
    'judged.ts imports ./runs.ts',
    'read.ts imports ../feed.ts',
    'decodes.ts imports effect',
    'objects.ts imports objects/src/run.ts',
    'cards.ts imports effect/http',
  ]);
});

test('the files under src/lib/api/ import values from react-query, effect, objects, the feed, read.ts and a leaf sibling alone, and read.ts from effect', () => {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.ts'));
  assert.ok(files.length > 10 && files.includes('read.ts'), `the mirror's files: ${files.join(', ')}`);
  const texts = new Map(files.map((f) => [f, fs.readFileSync(path.join(DIR, f), 'utf8')]));
  assert.ok(valueImports(texts.get('decision.ts') ?? '').includes('./objects.ts'), "decision.ts reads through the objects' client");
  assert.deepEqual(
    importFaults(texts),
    [],
    "import a sibling's type with `import type`; a value two of them need goes in read.ts, or in a sibling that imports no sibling",
  );
});

/** The one file that may call `fetch`: the objects' client, every read and write of the api. */
const CLIENT = 'src/lib/api/objects.ts';

/** The fewest keys a struct has for its shape to say what it is: two keys alone (`{ error, retrying }`) say too little. */
const SHAPED = 3;

/** Every `.ts` and `.tsx` file under `dir`, by its path under apps/web, to its text. */
const sourceTexts = (dir = SRC): Map<string, string> =>
  new Map(
    fs
      .readdirSync(dir, { recursive: true, encoding: 'utf8' })
      .filter((f) => /\.tsx?$/.test(f))
      .map((f) => [
        path.relative(path.dirname(SRC), path.join(dir, f)).split(path.sep).join('/'),
        fs.readFileSync(path.join(dir, f), 'utf8'),
      ]),
  );

/** The key set of a struct, as a shape is compared: its keys sorted and joined. */
const shapeOf = (keys: readonly string[]): string => [...keys].sort().join(',');

/**
 * Every struct an exported schema of `objects` holds, however deep, by its shape (`shapeOf`), with the export it was found under: what the
 * api answers, which the board reads through the objects' client rather than spells again.
 */
export function objectsShapes(): Map<string, string> {
  const found = new Map<string, string>();
  const seen = new Set<SchemaAST.AST>();
  const walk = (ast: SchemaAST.AST, under: string): void => {
    if (seen.has(ast)) return;
    seen.add(ast);
    if (SchemaAST.isObjects(ast)) {
      const keys = ast.propertySignatures.map((p) => String(p.name));
      if (keys.length >= SHAPED && !found.has(shapeOf(keys))) found.set(shapeOf(keys), under);
      for (const p of ast.propertySignatures) walk(p.type, under);
    } else if (SchemaAST.isUnion(ast)) for (const t of ast.types) walk(t, under);
    else if (SchemaAST.isArrays(ast)) for (const t of [...ast.elements, ...ast.rest]) walk(t, under);
    else if (SchemaAST.isDeclaration(ast)) for (const t of ast.typeParameters) walk(t, under);
    else if (SchemaAST.isSuspend(ast)) walk(ast.thunk(), under);
  };
  for (const [name, value] of Object.entries(objects)) if (Schema.isSchema(value)) walk(value.ast, name);
  return found;
}

/**
 * What the board's source does that only the objects' client may, or spells what `objects` already says, given each file's text: a
 * `fetch`, bare or off an object, anywhere but the client (`CLIENT`); and a `Schema.Struct` whose keys are the keys of a struct `objects`
 * answers (`shapes`, `objectsShapes`), whatever it is named. A line each, `<file>:<line> …`, saying the fix.
 */
export function clientBreaks(texts: ReadonlyMap<string, string>, shapes: ReadonlyMap<string, string>): string[] {
  const out: string[] = [];
  for (const [file, text] of texts) {
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const at = (node: ts.Node) => `${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`;
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        const fetches =
          (ts.isIdentifier(callee) && callee.text === 'fetch') || (ts.isPropertyAccessExpression(callee) && callee.name.text === 'fetch');
        if (fetches && file !== CLIENT)
          out.push(
            `${at(node)} calls fetch: read the api through the objects' client (${CLIENT}), as call((c) => c.<group>.<endpoint>(…))`,
          );
        const struct = callee.getText(source) === 'Schema.Struct' ? node.arguments[0] : undefined;
        if (struct && ts.isObjectLiteralExpression(struct) && !struct.properties.some(ts.isSpreadAssignment)) {
          const keys = struct.properties.flatMap((p) =>
            p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? [p.name.text] : [],
          );
          const mirrored = keys.length >= SHAPED ? shapes.get(shapeOf(keys)) : undefined;
          if (mirrored !== undefined)
            out.push(
              `${at(node)} decodes a struct of the shape objects answers in ${mirrored}: import that schema from 'objects' and read it`,
            );
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return out;
}

test("the board's source calls fetch in the objects' client alone, and spells no struct objects answers", () => {
  const shapes = objectsShapes();
  assert.ok(shapes.size > 100 && shapes.has(shapeOf(['pause', 'finishing', 'parked', 'staged', 'held'])), `${shapes.size} shapes`);
  const texts = sourceTexts();
  assert.ok(texts.has(CLIENT) && texts.has('src/routes/__root.tsx'), [...texts.keys()].slice(0, 5).join(', '));
  assert.deepEqual(clientBreaks(texts, shapes), []);
});

test('REFUSED: a fetch outside the client, bare or off an object, and a struct of the shape objects answers, under any name', () => {
  const shapes = objectsShapes();
  const planted = new Map([
    ['src/lib/api/pause.ts', "export const paused = () => fetch('/api/pause').then((r) => r.json());"],
    ['src/lib/x.ts', "export const x = () => globalThis.fetch('/api/x', { method: 'POST' });"],
    [
      'src/lib/api/quota.ts',
      'const Held = Schema.Struct({ run: Schema.String, inFlight: Schema.Number, cap: Schema.Number, word: Schema.String });',
    ],
    ['src/lib/y.ts', "const Mine = Schema.Struct({ held: S, staged: S, parked: S, finishing: S, 'pause': S });"],
  ]);
  assert.deepEqual(
    clientBreaks(planted, shapes).map((f) => f.split(' ').slice(0, 2).join(' ')),
    ['src/lib/api/pause.ts:1 calls', 'src/lib/x.ts:1 calls', 'src/lib/api/quota.ts:1 decodes', 'src/lib/y.ts:1 decodes'],
  );
  const kept = new Map([
    [CLIENT, 'const seen: typeof fetch = (input, init) => globalThis.fetch(String(input), init);'],
    ['src/lib/z.ts', 'const Own = Schema.Struct({ mine: S, yours: S, theirs: S });\nconst Two = Schema.Struct({ error: S, retrying: S });'],
    ['src/lib/w.ts', 'const Spread = Schema.Struct({ ...fields, run: S, inFlight: S, cap: S, word: S });\nvoid refetch();'],
  ]);
  assert.deepEqual(clientBreaks(kept, shapes), [], "the client's fetch, a shape of the board's own, two keys, a spread and a refetch");
});
