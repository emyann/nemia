/**
 * Her definition and her bin, off the disk: `ownBin` finds the folder whose `nemia` is the bin of the package's own tree — the client
 * its workspace links, a global prefix's — and passes over one of another tree; `readNemia` refuses a hand
 * list of her rules, which her fence derives, as
 * `test/agent-fences.test.ts` refuses her a mode but `auto`. Focused on the real disk: npm's links are real symbolic links, and the
 * checkout's own is read. And the keeper's record of her session: denied her, read as none where it does not decode, her tasks adopted
 * from an older store's level file, and her chat waking her but while her folder's trust is refused.
 */
import { beforeAll, describe, test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { names } from '../../test/assessed.ts';
import {
  herTasks,
  nemiaChatPlace,
  nemiaDefinition,
  ownBin,
  readNemia,
  readSession,
  sessionFile,
  storeDenies,
  writeLevel,
  writeSession,
  writeUntrusted,
} from './level.store.ts';

/** A package at `dir` whose `package.json` says its `nemia` is `bin/nemia.ts`, as the client in `apps/cli` does. */
const pkg = (dir: string): string => {
  fs.mkdirSync(path.join(dir, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'cli', bin: { nemia: 'bin/nemia.ts' } }));
  fs.writeFileSync(path.join(dir, 'bin', 'nemia.ts'), '');
  return dir;
};

/** A `nemia` in the folder `bin`, linked to `target` by a relative path, as npm links one. */
const linked = (bin: string, target: string): void => {
  fs.mkdirSync(bin, { recursive: true });
  fs.symlinkSync(path.relative(bin, target), path.join(bin, 'nemia'));
};

describe("`ownBin`: the folder whose nemia is its own tree's client, and none where every one on the way is another tree's", () => {
  test("a workspace's node_modules/.bin, and a global prefix's bin", () => {
    const root = scratch('wf-nemia-bin-');
    const own = path.join(root, 'packages', 'agent-orchestrator');
    fs.mkdirSync(own, { recursive: true });
    const client = pkg(path.join(root, 'apps', 'cli'));
    linked(path.join(root, 'node_modules', '.bin'), path.join(client, 'bin', 'nemia.ts'));
    assert.equal(ownBin(own), path.join(fs.realpathSync(root), 'node_modules', '.bin'));
    const prefix = scratch('wf-nemia-prefix-');
    const global = path.join(prefix, 'lib', 'node_modules', 'agent-orchestrator');
    fs.mkdirSync(global, { recursive: true });
    const globalClient = pkg(path.join(prefix, 'lib', 'node_modules', 'cli'));
    linked(path.join(prefix, 'bin'), path.join(globalClient, 'bin', 'nemia.ts'));
    assert.equal(ownBin(global), path.join(fs.realpathSync(prefix), 'bin'));
  });
  test("REFUSED: a nemia on the way that is another tree's is passed over, and none of the tree's own is undefined", () => {
    const root = scratch('wf-nemia-other-');
    const own = path.join(root, 'checkout', 'packages', 'agent-orchestrator');
    fs.mkdirSync(own, { recursive: true });
    const client = pkg(path.join(root, 'checkout', 'apps', 'cli'));
    const other = pkg(path.join(root, 'other', 'cli'));
    linked(path.join(root, 'checkout', 'node_modules', '.bin'), path.join(other, 'bin', 'nemia.ts'));
    assert.equal(ownBin(own), undefined);
    fs.rmSync(path.join(root, 'checkout', 'node_modules', '.bin', 'nemia'));
    linked(path.join(root, 'checkout', 'node_modules', '.bin'), path.join(client, 'bin', 'nemia.ts'));
    assert.equal(ownBin(own), path.join(fs.realpathSync(root), 'checkout', 'node_modules', '.bin'));
  });
  test('REFUSED: a nemia whose package.json is no JSON is declared by none, and passed over', () => {
    const root = scratch('wf-nemia-unread-');
    const own = path.join(root, 'packages', 'agent-orchestrator');
    fs.mkdirSync(own, { recursive: true });
    const client = pkg(path.join(root, 'apps', 'cli'));
    fs.writeFileSync(path.join(client, 'package.json'), '{ "bin": ');
    linked(path.join(root, 'node_modules', '.bin'), path.join(client, 'bin', 'nemia.ts'));
    assert.equal(ownBin(own), undefined);
  });
  test("the checkout gives this package its own tree's client", () => {
    const bin = ownBin();
    assert.ok(bin !== undefined, 'the checkout links its nemia');
    assert.equal(
      fs.realpathSync(path.join(bin, 'nemia')),
      fs.realpathSync(path.join(import.meta.dirname, '..', '..', '..', '..', 'apps', 'cli', 'bin', 'nemia.ts')),
    );
  });
});

describe('`readNemia`: her shipped definition reads in auto, and a hand list of her rules on nemia is refused her', () => {
  let dir!: string;
  test('her shipped definition reads in auto, with no hand list of rules on nemia', () => {
    const her = readNemia();
    assert.equal(her.permissionMode, 'auto');
    assert.deepEqual(
      (her.allowedTools ?? []).filter((rule) => rule.includes('nemia')),
      [],
    );
    assert.ok(her.disallowedTools?.includes('Bash(wf:*)') && her.disallowedTools.includes('Bash(ae:*)'), 'wf and ae out of her reach');
  });
  const text = fs.readFileSync(nemiaDefinition(), 'utf8');
  const head = (line: string) => text.replace(/^claude:$/m, `${line}\nclaude:`);
  for (const [name, cut, facts] of [
    ['asks', head('askTools: Bash(nemia approve:*)'), ['askTools:']],
    ['allows', head('allowedTools: Read, Bash(nemia show:*)'), ['allowedTools: Bash(nemia show:*)']],
  ] as const)
    test(`REFUSED: a definition with ${name === 'asks' ? 'an askTools:' : 'an allow on nemia'}, naming the file and the key`, () => {
      dir = scratch('wf-nemia-asks-');
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
    });
  test('an allow on no nemia is hers to have', () => {
    const file = path.join(dir, 'read.md');
    fs.writeFileSync(file, head('allowedTools: Read'));
    assert.deepEqual(readNemia(file).allowedTools, ['Read']);
  });
});

describe("the keeper's record of her session: hers to read, never to write, and an older store's task adopted", () => {
  let root!: string;
  beforeAll(() => {
    root = scratch('wf-nemia-session-');
  });
  test('no record and no level: she has no task, and a message wakes her', () => {
    assert.deepEqual(herTasks(root), []);
    assert.deepEqual(nemiaChatPlace(root).tasks, []);
    assert.equal(nemiaChatPlace(root).wakes, true);
  });
  test("an older store's level file names her task: adopted as her first", () => {
    writeLevel(root, { level: 'semi-auto', since: '2026-10-06T08:00:00.000Z', task: 'nemia-1' });
    assert.deepEqual(herTasks(root), ['nemia-1']);
  });
  test('the record, once written, names her tasks', () => {
    writeSession(root, { tasks: ['nemia-1', 'nemia-2'], idleSince: '2026-10-06T09:00:00.000Z' });
    assert.deepEqual(herTasks(root), ['nemia-1', 'nemia-2']);
    assert.deepEqual(readSession(root), { tasks: ['nemia-1', 'nemia-2'], idleSince: '2026-10-06T09:00:00.000Z' });
  });
  test('REFUSED: a record that does not decode is read as none, its next write replacing it', () => {
    fs.writeFileSync(sessionFile(root), '{ "tasks": 3 }');
    assert.equal(readSession(root), undefined);
    fs.writeFileSync(sessionFile(root), 'not json');
    assert.equal(readSession(root), undefined);
    assert.deepEqual(herTasks(root), ['nemia-1'], "read as none: the level file's task again");
  });
  test('REFUSED: her session denies her an edit of the record', () => {
    assert.ok(storeDenies(root).includes(`Edit(/${sessionFile(root)})`));
  });
  test("REFUSED: while the keeper's record says her folder's trust was refused, a message does not wake her", () => {
    writeUntrusted(root, 'her folder could not be trusted');
    assert.equal(nemiaChatPlace(root).wakes, false);
    writeUntrusted(root, undefined);
    assert.equal(nemiaChatPlace(root).wakes, true);
  });
});
