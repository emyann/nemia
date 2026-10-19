/**
 * The package's entries are Effect: no function an entry exports hands back a Promise, or an object whose methods do — the shapes of a
 * plain face that runs a program for its caller, and of a Promise engine — but one named in `PROMISED`, by its entry and its name,
 * where only the testing door's wait is. A pure function
 * answers a plain value, as it may; a verb is an Effect of the engine. Read by the TypeScript checker, over the entries `package.json`
 * names, and proven on `fixtures/promise-face.ts`, which exports both shapes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const PACKAGE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The source files `package.json` exports as the package's entries. */
const ENTRIES = Object.values(
  (JSON.parse(fs.readFileSync(path.join(PACKAGE, 'package.json'), 'utf8')) as { exports: Record<string, string> }).exports,
)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => path.normalize(f));

/**
 * What an entry may export that answers a Promise, or methods that do, each by the entry that exports it and its name, as
 * `promisedExports` answers them: the testing door's `until` alone, the wait a test makes on its event (`src/waits/`), which
 * `agent-runtime/testing` gives a test of a layer above. A test awaits it in its own process, with the runner's signal as its one
 * bound; it is composed into no program, and the door that gives it is for tests alone (`test/contract.test.ts`). The entry is part of
 * the name, so the same `until` on `src/index.ts` or `src/vocabulary.ts` is refused: a verb is an Effect of the engine.
 */
const PROMISED = new Set<string>(['src/testing.ts: until']);

/** The names of the functions each entry in `files` exports whose call answers a Promise, or methods that do, as `entry: name`. */
const promisedExports = (files: string[]): string[] => {
  const roots = files.map((f) => path.join(PACKAGE, f));
  const program = ts.createProgram(roots, {
    allowImportingTsExtensions: true,
    noEmit: true,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
    strict: true,
    skipLibCheck: true,
  });
  const checker = program.getTypeChecker();
  const answers = (type: ts.Type): ts.Type[] => type.getCallSignatures().map((s) => s.getReturnType());
  const promise = (type: ts.Type) => checker.typeToString(type).startsWith('Promise<');
  const methods = (type: ts.Type) => type.getProperties().flatMap((p) => answers(checker.getTypeOfSymbol(p)));
  return roots.flatMap((root) => {
    const entry = checker.getSymbolAtLocation(program.getSourceFile(root)!)!;
    return checker.getExportsOfModule(entry).flatMap((name) => {
      const symbol = name.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(name) : name;
      const faced = answers(checker.getTypeOfSymbol(symbol)).some((a) => promise(a) || methods(a).some(promise));
      return faced ? [`${path.relative(PACKAGE, root)}: ${name.name}`] : [];
    });
  });
};

test('the entries read are the ones package.json exports', () => {
  assert.deepEqual(ENTRIES, ['src/index.ts', 'src/vocabulary.ts', 'src/testing.ts']);
});

/** Of `answers`, each `<entry>: <name>` that `PROMISED` does not name whole: a plain face no entry may export. */
const unexempted = (answers: readonly string[]): string[] => answers.filter((p) => !PROMISED.has(p));

test('no function an entry exports answers a Promise, or methods that do, but the ones PROMISED names', () => {
  assert.deepEqual(unexempted(promisedExports(ENTRIES)), [], "an entry exports a plain face: make it an Effect, as the engine's verbs are");
});

test('REFUSED: a function that answers a Promise, and one that answers an object of Promise methods, each named', () => {
  assert.deepEqual(promisedExports(['test/fixtures/promise-face.ts']), [
    'test/fixtures/promise-face.ts: promiseFace',
    'test/fixtures/promise-face.ts: promiseEngine',
  ]);
  assert.deepEqual(
    unexempted(['src/index.ts: until', 'src/vocabulary.ts: until', 'src/testing.ts: until', 'src/testing.ts: promiseFace']),
    ['src/index.ts: until', 'src/vocabulary.ts: until', 'src/testing.ts: promiseFace'],
    "REFUSED: the wait's name on another entry, and another name on the testing door: `PROMISED` exempts the one it names, whole",
  );
});
