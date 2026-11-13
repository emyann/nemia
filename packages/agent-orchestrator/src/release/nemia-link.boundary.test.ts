/**
 * The command of the store's `tools` need (`toolsNeed`), run through a real `sh` in a scratch store's folder as `nemia doctor fix tools`
 * runs it: it fails, linking nothing, on a store with no pointer, as a checkout's; and on a store whose pointer names a release holding
 * `bin/nemia`, it links the tools folder's `nemia` to the launcher under `releases/current`, which the need's own check then reads met.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { scratch } from 'test-kit/scratch';
import { releaseDir, switchCurrent } from './release.store.ts';
import { currentNemia, toolsNeed, toolsNemia } from './nemia-link.store.ts';

/** The exit of `command` run by `sh -c` in the store at `home`. */
const ran = (home: string, command: string): number | null =>
  spawnSync('sh', ['-c', command], { cwd: home, stdio: 'ignore', timeout: 10_000 }).status;

test("nemia doctor fix tools's command fails with no pointer, and links the pointer's launcher where there is one", () => {
  const home = fs.realpathSync(scratch('wf-nemia-fix-'));
  const need = toolsNeed(home);
  const fix = need.fixes?.[0]?.command ?? assert.fail('the tools need declares a fix');

  assert.notEqual(ran(home, fix), 0, "no releases/current: a checkout's store gets no link");
  assert.equal(fs.existsSync(toolsNemia(home)), false);
  assert.notEqual(ran(home, need.check), 0, 'its check reads it missing');

  const bin = path.join(releaseDir('v1.0.0', home), 'bin');
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'nemia'), '#!/bin/sh\n', { mode: 0o755 });
  switchCurrent('v1.0.0', home);

  assert.equal(ran(home, fix), 0);
  assert.equal(fs.readlinkSync(toolsNemia(home)), currentNemia(home));
  assert.equal(fs.realpathSync(toolsNemia(home)), path.join(bin, 'nemia'));
  assert.equal(ran(home, need.check), 0, 'its check reads it met');
});
