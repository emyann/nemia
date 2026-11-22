/**
 * The kit's stories (`src/kit/kit.ts`): fetched as GitHub's tarball of the release's tag, and read by a tar reader of its own, which
 * keeps the regular files by their paths, a pax long name included, and leaves out the global header and every other entry.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { gunzipSync, gzipSync } from 'node:zlib';
import { tarballOf, tarEntries } from '../src/kit/kit.ts';

/** One tar header of `name`, `size` and `type`, its checksum left blank: the reader trusts the archive GitHub sent. */
const header = (name: string, size: number, type: string) => {
  const block = Buffer.alloc(512);
  block.write(name.slice(0, 100), 0);
  block.write(size.toString(8).padStart(11, '0'), 124);
  block.write(type, 156);
  block.write('ustar', 257);
  return block;
};

/** An entry's header and its body, padded to the block. */
const entry = (name: string, body: string, type = '0') => {
  const bytes = Buffer.from(body);
  return Buffer.concat([header(name, bytes.length, type), bytes, Buffer.alloc((512 - (bytes.length % 512)) % 512)]);
};

test("the tarball is GitHub's archive of the release's tag", () => {
  assert.equal(tarballOf('0.11.0'), 'https://api.github.com/repos/french-tech-homies/design-system/tarball/v0.11.0');
});

test('the regular files are read by their paths, a pax path over a long name, and the global header and folders are left out', () => {
  const long = `top/stories/${'deep/'.repeat(25)}Long.stories.tsx`;
  const record = ` path=${long}\n`;
  const archive = Buffer.concat([
    entry('pax_global_header', '52 comment=4e3d758\n', 'g'),
    entry('top/', '', '5'),
    entry('top/stories/actions/Button.stories.tsx', 'export const Filled = {};\n'),
    entry('PaxHeader', `${record.length + 3}${record}`, 'x'),
    entry('top/stories/cut-name', 'long'),
    Buffer.alloc(1024),
  ]);
  const read = tarEntries(gunzipSync(gzipSync(archive)));
  assert.deepEqual(
    read.map((one) => one.name),
    ['top/stories/actions/Button.stories.tsx', long],
  );
  assert.equal(read[0]?.bytes.toString(), 'export const Filled = {};\n');
  assert.equal(read[1]?.bytes.toString(), 'long');
});
