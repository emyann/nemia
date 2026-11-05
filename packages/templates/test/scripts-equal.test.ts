/**
 * sdlc's `quick` carries `build`'s four scripts byte for byte (`landing.ts`, `parts.ts`, `pull-request.ts`, `probe.ts`), and the module
 * one of them imports (`ci-log.ts`, read by `pull-request.ts`): a run
 * freezes its own workflow's folder alone, so quick's checks run its own copies, and a fix made to one is made to both. Held first on a
 * scratch copy with one copy a byte apart, then on sdlc as it ships, each pair read for a name it must hold, so an emptied pair cannot
 * pass.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';
import { SDLC } from './template.ts';

/** The scripts of `build` that `quick`'s checks run, which `quick` carries as copies of its own. */
const QUICK_COPIES = ['landing.ts', 'parts.ts', 'probe.ts', 'pull-request.ts'];

/** The modules of `build` a script of its imports beside it, by the script: carried by `quick` as its own copies too. */
const QUICK_MODULES = { 'ci-log.ts': 'pull-request.ts' };

/** Quick's copies in the template `root` that are not `build`'s byte for byte, a missing one among them. */
function unequal(root: string): string[] {
  return [...Object.keys(QUICK_MODULES), ...QUICK_COPIES]
    .filter((name) => {
      const [copy = '', original = ''] = ['quick', 'build'].map((workflow) => path.join(root, 'workflows', workflow, name));
      return !fs.existsSync(copy) || !fs.readFileSync(copy).equals(fs.readFileSync(original));
    })
    .map((name) => `workflows/quick/${name}`);
}

test("REFUSED: a copy of build's script in quick that differs from it by one byte, or is missing", () => {
  const root = path.join(scratch('nemia-scripts-equal-'), 'sdlc');
  fs.cpSync(SDLC, root, { recursive: true });
  fs.appendFileSync(path.join(root, 'workflows', 'quick', 'probe.ts'), ' ');
  fs.rmSync(path.join(root, 'workflows', 'quick', 'landing.ts'));
  assert.deepEqual(unequal(root), ['workflows/quick/landing.ts', 'workflows/quick/probe.ts']);
});

test("sdlc's quick carries build's four scripts byte for byte", () => {
  for (const name of QUICK_COPIES)
    assert.ok(fs.readFileSync(path.join(SDLC, 'workflows', 'build', name), 'utf8').includes(`node ${name}`), `build/${name} is read`);
  for (const [name, by] of Object.entries(QUICK_MODULES))
    assert.ok(
      fs.readFileSync(path.join(SDLC, 'workflows', 'build', by), 'utf8').includes(`from './${name}'`),
      `build/${by} imports ${name}`,
    );
  assert.deepEqual(unequal(SDLC), []);
});
