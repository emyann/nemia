/**
 * The vocabulary door, `src/vocabulary.ts`, is pure: the files its value imports reach, the door's own among them, are the harnesses'
 * vocabulary files, `harness/choices.ts`, `harness/reach.ts` and `harness/config-folders.ts` alone, and none imports Effect or a module
 * of node's. A caller that only judges words loads it without loading a runner. Type-only imports are erased and let through.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const PKG = path.join(import.meta.dirname, '..');

/** The files the door may load: itself, the harnesses' vocabularies, and the choices and the reach that read them. */
const DOOR_FILES = [
  'src/vocabulary.ts',
  'src/harness/choices.ts',
  'src/harness/reach.ts',
  'src/harness/config-folders.ts',
  'src/harness/claude/vocabulary.ts',
  'src/harness/codex/vocabulary.ts',
];

/** Every module `text` imports for a value: a type-only import, or braces of `type` names only, is erased and left out. */
function valueImports(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/^\s*(?:import|export)\s+(type\s+)?([^'"`;]*?)\s*\bfrom\s*['"]([^'"]+)['"]/gm)) {
    const braces = /^\{([\s\S]*)\}$/.exec(m[2].trim());
    const members = braces
      ? braces[1]
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    if (!m[1] && !(members.length > 0 && members.every((s) => /^type\s/.test(s)))) out.push(m[3]);
  }
  for (const m of text.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) out.push(m[1]);
  for (const m of text.matchAll(/\bimport\s*\(\s*['"`]([^'"`]+)['"`]/g)) out.push(m[1]);
  return out;
}

/**
 * Where the door's value graph, read through `read`, reaches what it may not: a file outside `DOOR_FILES`, Effect, or any module that is
 * not a file of the package, each worded with what to do instead.
 */
function doorBreaches(read: (file: string) => string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const queue = ['src/vocabulary.ts'];
  for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
    if (seen.has(file)) continue;
    seen.add(file);
    if (!DOOR_FILES.includes(file)) {
      out.push(
        `the vocabulary door loads ${file}: keep it to the vocabulary files, choices.ts, reach.ts and config-folders.ts, or the door loads a runner`,
      );
      continue;
    }
    for (const spec of valueImports(read(file))) {
      if (spec.startsWith('.')) queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)));
      else out.push(`${file} imports ${spec}: the vocabulary door has no Effect and no I/O, so its files import nothing but each other`);
    }
  }
  return out;
}

const onDisk = (file: string): string => fs.readFileSync(path.join(PKG, file), 'utf8');

test('REFUSED: a door file that imports a module of node, Effect, or a runner', () => {
  const planting = (file: string, line: string) => (f: string) => (f === file ? `${line}\n${onDisk(f)}` : onDisk(f));
  assert.deepEqual(doorBreaches(planting('src/harness/codex/vocabulary.ts', "import fs from 'node:fs';")), [
    'src/harness/codex/vocabulary.ts imports node:fs: the vocabulary door has no Effect and no I/O, so its files import nothing but each other',
  ]);
  assert.deepEqual(doorBreaches(planting('src/harness/config-folders.ts', "import path from 'node:path';")), [
    'src/harness/config-folders.ts imports node:path: the vocabulary door has no Effect and no I/O, so its files import nothing but each other',
  ]);
  assert.deepEqual(doorBreaches(planting('src/harness/reach.ts', "import { Effect } from 'effect';")), [
    'src/harness/reach.ts imports effect: the vocabulary door has no Effect and no I/O, so its files import nothing but each other',
  ]);
  assert.deepEqual(doorBreaches(planting('src/harness/reach.ts', "import { codex } from './codex/codex.ts';")), [
    'the vocabulary door loads src/harness/codex/codex.ts: keep it to the vocabulary files, choices.ts, reach.ts and config-folders.ts, or the door loads a runner',
  ]);
  assert.deepEqual(doorBreaches(planting('src/harness/choices.ts', "import { codex } from './codex/codex.ts';")), [
    'the vocabulary door loads src/harness/codex/codex.ts: keep it to the vocabulary files, choices.ts, reach.ts and config-folders.ts, or the door loads a runner',
  ]);
  assert.deepEqual(
    doorBreaches(planting('src/harness/reach.ts', "import type { HarnessSpec } from './detached/detached.ts';")),
    [],
    'not refused: a type-only import, which is erased',
  );
});

test('the vocabulary door loads the vocabulary files, choices.ts, reach.ts and config-folders.ts alone, with no Effect and no I/O', () => {
  assert.deepEqual(doorBreaches(onDisk), []);
});
