/**
 * `yaml` is the orchestrator's one YAML parser, and src/template/template.store.ts alone imports it, among the package's `src` and
 * `bin`: a pure file reads a template's documents as the store hands them over. A test beside its file is of no kind, and may read
 * back what a store wrote. Imports are read by TypeScript's own scan, so an import broken over lines, an `export … from` and a dynamic
 * `import()` are each found.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { scratch } from './scratch.ts';

const PACKAGE = path.join(import.meta.dirname, '..');

/** The file that may import `yaml`, by path from the package. */
const IMPORTER = 'src/template/template.store.ts';

/** Every `.ts` file under `dir`'s `src` and `bin` but a test, by path from `dir`. */
function sourcesOf(dir: string): string[] {
  return ['src', 'bin'].flatMap((top) =>
    fs.existsSync(path.join(dir, top))
      ? fs
          .readdirSync(path.join(dir, top), { recursive: true, encoding: 'utf8' })
          .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
          .map((file) => `${top}/${file.split(path.sep).join('/')}`)
      : [],
  );
}

/** The files of `dir`'s `src` and `bin` that import `yaml`, or a path inside it, by path from `dir`, sorted. */
function yamlImporters(dir: string): string[] {
  return sourcesOf(dir)
    .filter((file) =>
      ts
        .preProcessFile(fs.readFileSync(path.join(dir, file), 'utf8'), true, true)
        .importedFiles.some(({ fileName }) => fileName === 'yaml' || fileName.startsWith('yaml/')),
    )
    .sort();
}

test('yaml is imported by src/template/template.store.ts alone, among the src and bin of agent-orchestrator', () => {
  assert.ok(sourcesOf(PACKAGE).length > 100, 'the scan reads the package, or it would pass by reading nothing');
  assert.deepEqual(yamlImporters(PACKAGE), [IMPORTER]);
});

test('REFUSED: a yaml import outside the store, broken over lines, re-exported, by a subpath or dynamic, in src or bin', () => {
  const dir = scratch('wf-yaml-import-');
  const plant = (file: string, text: string): void => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  };
  plant(IMPORTER, "import { parseAllDocuments } from 'yaml';\n");
  plant('src/template/check.ts', "import {\n  parse,\n  stringify,\n} from\n  'yaml';\n");
  plant('src/folder/read.ts', "export { parse } from 'yaml';\n");
  plant('src/folder/lines.ts', "import type { LineCounter } from 'yaml/util';\n");
  plant('bin/late.ts', "const yaml = await import(\n  'yaml'\n);\n");
  plant('src/template/check.test.ts', "import { parse } from 'yaml';\n");
  plant('src/template/words.ts', 'const said = "from \'yaml\'";\n');
  assert.deepEqual(yamlImporters(dir), ['bin/late.ts', 'src/folder/lines.ts', 'src/folder/read.ts', 'src/template/check.ts', IMPORTER]);
});
