/**
 * The testing door, `src/testing.ts`, and what it gives — the engine's stand-in, `src/service/test-engine.ts`, and the wait a test
 * makes on its event, `src/waits/` — start nothing and name no harness: each imports, for a value, `effect`, the engine service's own
 * files, the core's engine face and the wait's own folder alone. So the stand-in can
 * spawn no process, read no file and ask no harness by its own code. Loading it still loads the runtime: the `Engine` tag it serves
 * sits in the file that builds the real engine. Type-only imports are erased and let through.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const PKG = path.join(import.meta.dirname, '..');

/** The door's files: the entry, the stand-in it gives, and the wait it gives. */
const DOOR_FILES = ['src/testing.ts', 'src/service/test-engine.ts', 'src/waits/index.ts', 'src/waits/waits.ts'];

/**
 * What a door file may import for a value: Effect, a file of the engine's service, the face of the core's engine, and a file of the
 * wait's own folder.
 */
const allowed = (target: string): boolean =>
  target === 'effect' ||
  /^src\/service\/[^/]+\.ts$/.test(target) ||
  target === 'src/core/engine/index.ts' ||
  /^src\/waits\/[^/]+\.ts$/.test(target);

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

/** Where a door file, read through `read`, imports for a value what it may not, each worded with what to do instead. */
const doorBreaches = (read: (file: string) => string): string[] =>
  DOOR_FILES.flatMap((file) =>
    valueImports(read(file))
      .map((spec) => (spec.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)) : spec))
      .filter((target) => !allowed(target))
      .map(
        (target) =>
          `${file} imports ${target}: the engine's stand-in starts nothing and names no harness, so its files import effect, ` +
          "the engine service's files, the core's engine face and the wait's own folder alone",
      ),
  );

const onDisk = (file: string): string => fs.readFileSync(path.join(PKG, file), 'utf8');

test('REFUSED: a door file that imports a module of node, a harness, A2A or another package', () => {
  const planting = (file: string, line: string) => (f: string) => (f === file ? `${line}\n${onDisk(f)}` : onDisk(f));
  const why =
    "the engine's stand-in starts nothing and names no harness, so its files import effect, the engine service's files, the " +
    "core's engine face and the wait's own folder alone";
  const made = 'src/service/test-engine.ts';
  for (const [line, target] of [
    ["import { spawn } from 'node:child_process';", 'node:child_process'],
    ["import fs from 'node:fs';", 'node:fs'],
    ["import { testOps } from '../harness/seam.ts';", 'src/harness/seam.ts'],
    ["import { claudeOps } from '../harness/claude/bg.ts';", 'src/harness/claude/bg.ts'],
    ["import { nameParts } from '../a2a/map.ts';", 'src/a2a/map.ts'],
    ["const core = await import('../core/domain.ts');", 'src/core/domain.ts'],
    ["import { Client } from '@a2a-js/sdk';", '@a2a-js/sdk'],
  ])
    assert.deepEqual(doorBreaches(planting(made, line)), [`${made} imports ${target}: ${why}`], line);
  assert.deepEqual(doorBreaches(planting('src/testing.ts', "export { testOps } from './harness/index.ts';")), [
    `src/testing.ts imports src/harness/index.ts: ${why}`,
  ]);
  assert.deepEqual(doorBreaches(planting('src/waits/waits.ts', "import fs from 'node:fs';")), [
    `src/waits/waits.ts imports node:fs: ${why}`,
  ]);
  assert.deepEqual(
    doorBreaches(planting(made, "import type { Sighting } from '../core/domain.ts';")),
    [],
    'not refused: a type-only import',
  );
  assert.deepEqual(doorBreaches(planting(made, "import { type RunnerOps } from '../harness/seam.ts';")), [], 'nor braces of types');
});

test("the testing door, the engine's stand-in and the wait import effect, the service's files, the core's engine face and the wait alone", () => {
  assert.ok(valueImports(onDisk('src/service/test-engine.ts')).includes('effect'), 'the stand-in was read');
  assert.ok(valueImports(onDisk('src/testing.ts')).includes('./service/index.ts'), 'and the entry');
  assert.ok(valueImports(onDisk('src/waits/index.ts')).includes('./waits.ts'), "and the wait's face");
  assert.deepEqual(doorBreaches(onDisk), []);
});
