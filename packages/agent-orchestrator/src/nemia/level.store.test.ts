/**
 * Her definition and her bin, off the disk: `ownBin` finds the folder whose `nemia` is the package's own, in a workspace and under a
 * global prefix, and passes over another package's; `readNemia` refuses a mode but `auto` and a file with no `askTools:`. A store of its
 * own, since `WF_ROOT` is read as the module loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';

process.env.WF_ROOT = scratch('wf-nemia-store-');
const { nemiaDefinition, ownBin, readNemia } = await import('./level.store.ts');

/** A package named `name` at `dir`, whose `package.json` says its `nemia` is `bin/nemia.ts`. */
const pkg = (dir: string): string => {
  fs.mkdirSync(path.join(dir, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'agent-orchestrator', bin: { nemia: 'bin/nemia.ts' } }));
  fs.writeFileSync(path.join(dir, 'bin', 'nemia.ts'), '');
  return dir;
};

/** A `nemia` in the folder `bin`, linked to `target` by a relative path, as npm links one. */
const linked = (bin: string, target: string): void => {
  fs.mkdirSync(bin, { recursive: true });
  fs.symlinkSync(path.relative(bin, target), path.join(bin, 'nemia'));
};

test("the package's own bin: a workspace's node_modules/.bin, and a global prefix's bin", () => {
  const root = scratch('wf-nemia-bin-');
  const own = pkg(path.join(root, 'packages', 'agent-orchestrator'));
  linked(path.join(root, 'node_modules', '.bin'), path.join(own, 'bin', 'nemia.ts'));
  assert.equal(ownBin(own), path.join(fs.realpathSync(root), 'node_modules', '.bin'));
  const prefix = scratch('wf-nemia-prefix-');
  const global = pkg(path.join(prefix, 'lib', 'node_modules', 'agent-orchestrator'));
  linked(path.join(prefix, 'bin'), path.join(global, 'bin', 'nemia.ts'));
  assert.equal(ownBin(global), path.join(fs.realpathSync(prefix), 'bin'));
});

test("REFUSED: a nemia on the way that is another package's is passed over, and none of the package's own is undefined", () => {
  const root = scratch('wf-nemia-other-');
  const own = pkg(path.join(root, 'checkout', 'packages', 'agent-orchestrator'));
  const other = pkg(path.join(root, 'other', 'agent-orchestrator'));
  linked(path.join(root, 'checkout', 'node_modules', '.bin'), path.join(other, 'bin', 'nemia.ts'));
  assert.equal(ownBin(own), undefined);
  linked(path.join(root, 'node_modules', '.bin'), path.join(own, 'bin', 'nemia.ts'));
  assert.equal(ownBin(own), path.join(fs.realpathSync(root), 'node_modules', '.bin'));
});

test('the checkout gives this package its own bin', () => {
  const bin = ownBin();
  assert.ok(bin !== undefined, 'the checkout links its nemia');
  assert.equal(fs.realpathSync(path.join(bin, 'nemia')), fs.realpathSync(path.join(import.meta.dirname, '..', '..', 'bin', 'nemia.ts')));
});

test('her shipped definition reads in auto, with her ask rules', () => {
  const her = readNemia();
  assert.equal(her.permissionMode, 'auto');
  assert.ok(her.askTools.includes('Bash(nemia approve:*)'), her.askTools.join(', '));
});

test('REFUSED: a mode but auto, and a definition with no askTools, are refused her', () => {
  const dir = scratch('wf-nemia-mode-');
  const text = fs.readFileSync(nemiaDefinition(), 'utf8');
  for (const mode of ['default', 'dontAsk', 'acceptEdits', 'bypassPermissions']) {
    const file = path.join(dir, `${mode}.md`);
    fs.writeFileSync(file, text.replace('permissionMode: auto', `permissionMode: ${mode}`));
    assert.throws(
      () => readNemia(file),
      (err: Error) => err.message.includes(`her permissionMode is ${mode}`) && err.message.endsWith('permissionMode: auto.'),
      mode,
    );
  }
  for (const [name, cut] of [
    ['none', text.replace(/^askTools:.*\n/m, '')],
    ['empty', text.replace(/^askTools:.*$/m, 'askTools: ')],
  ] as const) {
    const file = path.join(dir, `${name}.md`);
    fs.writeFileSync(file, cut);
    assert.throws(
      () => readNemia(file),
      (err: Error) => err.message.startsWith(`${file}: her askTools: names no rule`),
      name,
    );
  }
});
