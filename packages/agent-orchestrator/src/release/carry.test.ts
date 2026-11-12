/**
 * What `nemia doctor carry` reads and does on a scratch store (`carryHarnesses`): the harnesses held activated in the tools folder or
 * carried by a release's tree, each installed by its declared install unless it is at its pin already, and the exit it ends with. The
 * installs run against a stand-in `npm` first on the PATH, which records its arguments and exits as the row says, so no row fetches.
 * Which harnesses are carried is `upgradeCarries`' contract; this is its reading of the disk and its running. What a deactivation leaves is
 * run through a real shell in `carry.boundary.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CODEX_PIN } from 'agent-runtime/vocabulary';
import { scratch } from 'test-kit/scratch';
import { toolsBinDir, toolsDir } from '../config/root.store.ts';
import { bundledProgramIn, carryHarnesses, type HarnessCarried } from './carry.store.ts';

/** A store whose tools folder holds what `held` says, a tree that carries what `bundled` says, and an `npm` that exits `npm`. */
type Row = {
  readonly name: string;
  readonly activated?: 'at-pin' | 'elsewhere';
  readonly bundled?: boolean;
  readonly npm: number;
  readonly carried: readonly Pick<HarnessCarried, 'name' | 'kind'>[];
  readonly code: 0 | 1;
  readonly npmRan: boolean;
};

const ROWS: readonly Row[] = [
  { name: 'a store that holds no harness carries none', npm: 0, carried: [], code: 0, npmRan: false },
  {
    name: 'a harness activated at its pin is left there',
    activated: 'at-pin',
    npm: 0,
    carried: [{ name: 'codex', kind: 'at-pin' }],
    code: 0,
    npmRan: false,
  },
  {
    name: 'a harness activated at another version is installed at the pin',
    activated: 'elsewhere',
    npm: 0,
    carried: [{ name: 'codex', kind: 'installed' }],
    code: 0,
    npmRan: true,
  },
  {
    name: 'a harness the running tree carries is installed, and an install that fails ends the carry 1',
    bundled: true,
    npm: 1,
    carried: [{ name: 'claude', kind: 'failed' }],
    code: 1,
    npmRan: true,
  },
];

test('carryHarnesses reads what the store holds and the tree carries, and installs each at its pin', async (t) => {
  for (const row of ROWS)
    await t.test(row.name, () => {
      const home = scratch('wf-carry-');
      const tree = scratch('wf-carry-tree-');
      const stubs = scratch('wf-carry-stubs-');
      const ran = path.join(stubs, 'npm-ran.txt');
      fs.writeFileSync(path.join(stubs, 'npm'), `#!/bin/sh\necho "$*" >> '${ran}'\nexit ${row.npm}\n`, { mode: 0o755 });
      if (row.activated !== undefined) {
        const version = row.activated === 'at-pin' ? CODEX_PIN : '0.0.1';
        const dir = path.join(toolsDir(home), 'harnesses', 'codex', version, 'bin');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'codex'), '#!/bin/sh\n', { mode: 0o755 });
        fs.mkdirSync(toolsBinDir(home), { recursive: true });
        fs.symlinkSync(path.join(dir, 'codex'), path.join(toolsBinDir(home), 'codex'));
      }
      if (row.bundled) {
        const dir = path.join(tree, 'node_modules', '@anthropic-ai', `claude-agent-sdk-${process.platform}-${process.arch}`);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'claude'), '#!/bin/sh\n', { mode: 0o755 });
        assert.equal(bundledProgramIn(tree, 'claude'), path.join(dir, 'claude'));
      }
      const said: string[] = [];
      const done = carryHarnesses(home, { ...process.env, PATH: `${stubs}${path.delimiter}${process.env.PATH ?? ''}` }, tree, (line) =>
        said.push(line),
      );
      assert.deepEqual(
        done.harnesses.map((h) => ({ name: h.name, kind: h.kind })),
        row.carried,
      );
      assert.equal(done.code, row.code);
      assert.equal(fs.existsSync(ran), row.npmRan, said.join('\n'));
      assert.ok(said.length > 0, 'the carry says what it did');
    });
});
