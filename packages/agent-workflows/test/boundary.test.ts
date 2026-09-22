/**
 * The package's boundary, as a test rather than a sentence in the README.
 *
 * `runner.ts` is the only file that knows the engine exists. `run.ts` and `check.ts` are pure: they
 * read no disk and spawn nothing, which is what lets `assess` and the verdict be tested as data. The
 * CLI parses, calls and prints, so it reaches the package through `runner.ts` and the format through
 * `workflow.ts`, and nothing else. A rule a session can re-break is a rule this suite refuses.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const PKG = path.join(import.meta.dirname, '..');

/** Every module a piece of source names: imports and re-exports, type-only included, and `import()`. */
function importsIn(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/^\s*(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/gm)) found.add(m[1]!);
  for (const m of text.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) found.add(m[1]!);
  for (const m of text.matchAll(/\bimport\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g)) found.add(m[1]!);
  return [...found].sort();
}

const sources = (): Array<{ file: string; imports: string[] }> =>
  ['src', 'bin'].flatMap((dir) => fs.readdirSync(path.join(PKG, dir))
    .filter((f) => f.endsWith('.ts'))
    .map((f) => ({ file: `${dir}/${f}`, imports: importsIn(fs.readFileSync(path.join(PKG, dir, f), 'utf8')) })));

const importsOf = (file: string) => sources().find((s) => s.file === file)!.imports;

test('the scanner sees every way a file can name a module — or the rules below would pass by seeing nothing', () => {
  const text = [
    "import type { TaskView } from 'agent-engine';",
    'import {',
    '  a,',
    '  b,',
    "} from './multi-line.ts';",
    "export { verdictWord } from './check.ts';",
    "import 'side-effect';",
    "const fs = await import('node:fs');",
    "// a comment that mentions from 'nowhere' is not an import",
  ].join('\n');
  assert.deepEqual(importsIn(text), ['./check.ts', './multi-line.ts', 'agent-engine', 'node:fs', 'side-effect']);
});

test('only runner.ts imports agent-engine — not even for a type', () => {
  const offenders = sources()
    .filter(({ file, imports }) => file !== 'src/runner.ts' && imports.some((m) => m === 'agent-engine' || m.startsWith('agent-engine/')))
    .map(({ file }) => file);
  assert.deepEqual(offenders, []);
  assert.ok(importsOf('src/runner.ts').includes('agent-engine'), 'and runner.ts does, so this is looking at the right files');
});

test('run.ts, timeline.ts, closeout.ts, daemon.ts, check.ts, radius.ts, plan.ts and inbox.ts read no disk, spawn nothing, and do not reach for the I/O module', () => {
  const impure = ['fs', 'node:fs', 'fs/promises', 'node:fs/promises', 'child_process', 'node:child_process', './runner.ts'];
  for (const file of ['src/run.ts', 'src/timeline.ts', 'src/closeout.ts', 'src/daemon.ts', 'src/check.ts', 'src/radius.ts', 'src/plan.ts', 'src/inbox.ts']) {
    assert.deepEqual(importsOf(file).filter((m) => impure.includes(m)), [], file);
  }
});

test('cli.ts reaches the package only through runner.ts and workflow.ts', () => {
  const local = importsOf('src/cli.ts').filter((m) => !m.startsWith('node:'));
  assert.deepEqual(local.filter((m) => m !== './runner.ts' && m !== './workflow.ts'), []);
});
