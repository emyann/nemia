/**
 * The tools folder's `nemia` (`linkNemia`), on scratch stores: a store whose pointer names a release holding `bin/nemia` gets the link,
 * naming the launcher under `releases/current`, and it resolves to the next release once the pointer is switched (`switchCurrent`, as an
 * upgrade switches it); a store with no pointer, as a checkout's, gets none; a link already there is left, and a file of another kind
 * there is replaced.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { toolsBinDir } from '../config/root.store.ts';
import { releaseDir, switchCurrent } from './release.store.ts';
import { currentNemia, linkNemia, toolsNemia } from './nemia-link.store.ts';

/** A release `tag` unpacked in the store at `home`, its launcher a script. */
const unpacked = (home: string, tag: string): string => {
  const bin = path.join(releaseDir(tag, home), 'bin');
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'nemia'), `#!/bin/sh\necho ${tag}\n`, { mode: 0o755 });
  return fs.realpathSync(path.join(bin, 'nemia'));
};

test("the tools folder's nemia names the launcher under releases/current, and follows the pointer to the next release", () => {
  const home = fs.realpathSync(scratch('wf-nemia-link-'));
  const first = unpacked(home, 'v1.0.0');
  const second = unpacked(home, 'v1.1.0');
  switchCurrent('v1.0.0', home);

  assert.equal(linkNemia(home), true);
  assert.equal(fs.readlinkSync(toolsNemia(home)), currentNemia(home), 'the pointer, never a release folder');
  assert.equal(fs.realpathSync(toolsNemia(home)), first);
  assert.equal(linkNemia(home), false, 'a link that names it already is left');

  switchCurrent('v1.1.0', home);
  assert.equal(fs.realpathSync(toolsNemia(home)), second, 'the upgrade switched the pointer, and the link follows it');
  assert.deepEqual(
    fs.readdirSync(toolsBinDir(home)).filter((name) => name !== 'nemia'),
    [],
    'no link made beside it is left',
  );
});

test('a store with no pointer gets no link, and a file of another kind in its place is replaced', () => {
  const home = fs.realpathSync(scratch('wf-nemia-link-checkout-'));
  assert.equal(linkNemia(home), false);
  assert.equal(fs.existsSync(toolsNemia(home)), false, "a checkout's person has their own nemia");

  unpacked(home, 'v1.0.0');
  switchCurrent('v1.0.0', home);
  fs.mkdirSync(toolsBinDir(home), { recursive: true });
  fs.writeFileSync(toolsNemia(home), 'not a link\n');
  assert.equal(linkNemia(home), true);
  assert.equal(fs.readlinkSync(toolsNemia(home)), currentNemia(home));
});
