/**
 * Her definition and her bin, off the disk: `ownBin` finds the folder whose `nemia` is the package's own, in a workspace and under a
 * global prefix, and passes over another package's; `readNemia` refuses a hand list of her rules, which her fence derives, as
 * `test/agent-fences.test.ts` refuses her a mode but `auto`. Focused on the real disk: npm's links are real symbolic links, and the
 * checkout's own is read. A store of its own, since `WF_ROOT` is read as the module loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import { names } from '../../test/assessed.ts';

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

test("`ownBin`: the folder whose nemia is the package's own, and none where every one on the way is another's", async (t) => {
  await t.test("a workspace's node_modules/.bin, and a global prefix's bin", () => {
    const root = scratch('wf-nemia-bin-');
    const own = pkg(path.join(root, 'packages', 'agent-orchestrator'));
    linked(path.join(root, 'node_modules', '.bin'), path.join(own, 'bin', 'nemia.ts'));
    assert.equal(ownBin(own), path.join(fs.realpathSync(root), 'node_modules', '.bin'));
    const prefix = scratch('wf-nemia-prefix-');
    const global = pkg(path.join(prefix, 'lib', 'node_modules', 'agent-orchestrator'));
    linked(path.join(prefix, 'bin'), path.join(global, 'bin', 'nemia.ts'));
    assert.equal(ownBin(global), path.join(fs.realpathSync(prefix), 'bin'));
  });
  await t.test("REFUSED: a nemia on the way that is another package's is passed over, and none of the package's own is undefined", () => {
    const root = scratch('wf-nemia-other-');
    const own = pkg(path.join(root, 'checkout', 'packages', 'agent-orchestrator'));
    const other = pkg(path.join(root, 'other', 'agent-orchestrator'));
    linked(path.join(root, 'checkout', 'node_modules', '.bin'), path.join(other, 'bin', 'nemia.ts'));
    assert.equal(ownBin(own), undefined);
    linked(path.join(root, 'node_modules', '.bin'), path.join(own, 'bin', 'nemia.ts'));
    assert.equal(ownBin(own), path.join(fs.realpathSync(root), 'node_modules', '.bin'));
  });
  await t.test('the checkout gives this package its own bin', () => {
    const bin = ownBin();
    assert.ok(bin !== undefined, 'the checkout links its nemia');
    assert.equal(fs.realpathSync(path.join(bin, 'nemia')), fs.realpathSync(path.join(import.meta.dirname, '..', '..', 'bin', 'nemia.ts')));
  });
});

test('`readNemia`: her shipped definition reads in auto, and a hand list of her rules on nemia is refused her', async (t) => {
  await t.test('her shipped definition reads in auto, with no hand list of rules on nemia', () => {
    const her = readNemia();
    assert.equal(her.permissionMode, 'auto');
    assert.deepEqual(
      (her.allowedTools ?? []).filter((rule) => rule.includes('nemia')),
      [],
    );
    assert.ok(her.disallowedTools?.includes('Bash(wf:*)') && her.disallowedTools.includes('Bash(ae:*)'), 'wf and ae out of her reach');
  });
  const dir = scratch('wf-nemia-asks-');
  const text = fs.readFileSync(nemiaDefinition(), 'utf8');
  const head = (line: string) => text.replace(/^claude:$/m, `${line}\nclaude:`);
  for (const [name, cut, facts] of [
    ['asks', head('askTools: Bash(nemia approve:*)'), ['askTools:']],
    ['allows', head('allowedTools: Read, Bash(nemia show:*)'), ['allowedTools: Bash(nemia show:*)']],
  ] as const)
    await t.test(
      `REFUSED: a definition with ${name === 'asks' ? 'an askTools:' : 'an allow on nemia'}, naming the file and the key`,
      () => {
        const file = path.join(dir, `${name}.md`);
        fs.writeFileSync(file, cut);
        assert.throws(
          () => readNemia(file),
          (err: Error) => {
            names(err.message, `${file}: `, ...facts, 'command table', 'nemia.md');
            return true;
          },
          name,
        );
      },
    );
  await t.test('an allow on no nemia is hers to have', () => {
    const file = path.join(dir, 'read.md');
    fs.writeFileSync(file, head('allowedTools: Read'));
    assert.deepEqual(readNemia(file).allowedTools, ['Read']);
  });
});
