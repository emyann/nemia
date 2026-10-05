/**
 * The package's entries are Effect: no function an entry exports hands back a Promise, or an object whose methods do — the shapes of a
 * plain face that runs a program for its caller, and of a Promise engine — but the few named in `PROMISED`. A pure or store function
 * answers a plain value, as it may; a controller is an Effect program its caller runs with `runWith`. Read by the TypeScript checker,
 * over the entries `package.json` names.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const PACKAGE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const ENTRIES = ['src/runner.ts', 'src/run.ts', 'src/workflow.ts'];

/**
 * The functions an entry may export that answer a Promise: `runWith` runs a program over an engine, `runMain` runs the daemon's program
 * until the process stops, and `provisionDeps` is a store's install into a worktree, which reads no engine.
 */
const PROMISED = new Set(['runWith', 'runMain', 'provisionDeps']);

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

test('no function an entry exports answers a Promise, or methods that do, but the ones PROMISED names', () => {
  const promised = promisedExports(ENTRIES);
  assert.ok(
    promised.some((p) => p.endsWith(': runWith')),
    `the checker read the entries' exports: ${promised.join(', ')}`,
  );
  assert.deepEqual(
    promised.filter((p) => !PROMISED.has(p.slice(p.indexOf(': ') + 2))),
    [],
    'an entry exports a plain face: make it an Effect program its caller runs with `runWith`',
  );
});
