/**
 * `nemia doctor carry`'s handler (`DOCTOR_CARRY`), run through the command table's seat (`handled`) on a scratch store installed before
 * the tools folder held `nemia`: its pointer names a release holding `bin/nemia`, its tools folder is there with no `nemia` in it, and
 * every harness is deactivated, so the carry installs nothing. After the carry, which an upgrade runs, the tools folder's `nemia` names
 * the launcher under `releases/current`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { handled } from '../../test/typed.ts';
import { toolsBinDir } from '../config/root.store.ts';
import type { Env } from '../config/config.store.ts';
import { harnessesDir, pinnedHarnesses } from '../release/carry.store.ts';
import { currentNemia, toolsNemia } from '../release/nemia-link.store.ts';
import { releaseDir, switchCurrent } from '../release/release.store.ts';
import { DEACTIVATED } from './harness.ts';
import { DOCTOR_CARRY } from './commands.verb.ts';

test("nemia doctor carry links the tools folder's nemia of a store that has none to the launcher under releases/current", async () => {
  const home = fs.realpathSync(scratch('wf-doctor-carry-'));
  const ENV: Env = { ...process.env, WF_ROOT: home };
  const bin = path.join(releaseDir('v1.9.0', home), 'bin');
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'nemia'), '#!/bin/sh\n', { mode: 0o755 });
  switchCurrent('v1.9.0', home);
  fs.mkdirSync(toolsBinDir(home), { recursive: true });
  for (const h of pinnedHarnesses()) {
    fs.mkdirSync(path.join(harnessesDir(home), h.name), { recursive: true });
    fs.writeFileSync(path.join(harnessesDir(home), h.name, DEACTIVATED), '');
  }
  assert.equal(fs.existsSync(toolsNemia(home)), false, 'installed before the link was made');

  const carried = await handled(DOCTOR_CARRY, undefined, { env: ENV });
  assert.deepEqual(carried.harnesses, [], 'every harness is deactivated: nothing is installed');
  assert.equal(fs.readlinkSync(toolsNemia(home)), currentNemia(home));
  assert.equal(fs.realpathSync(toolsNemia(home)), path.join(bin, 'nemia'));
});
