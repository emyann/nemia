/**
 * A template's archive as bytes: what `packArchive` writes unpacks to the same files, the same bytes from the same files in any order,
 * and every entry `unpackArchive` refuses refused by name, each with a tar built by hand that breaks one rule.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { rawTar, type Entry } from '../../test/tar.ts';
import { ARCHIVE_LIMIT, contentDigest, packArchive, unpackArchive, type TreeFile } from './archive.ts';

/** A file of a tree. */
const file = (path: string, text: string | Uint8Array, mode = 0o644): TreeFile => ({
  path,
  mode,
  bytes: typeof text === 'string' ? Buffer.from(text) : text,
});

/** The message `unpackArchive` refuses `entries` with, as a gzipped tar; it fails the test where they are not refused. */
function refusal(entries: Entry[]): string {
  try {
    unpackArchive(gzipSync(rawTar(entries)));
  } catch (err) {
    assert.equal((err as { _tag?: string })._tag, 'Invalid');
    return (err as Error).message;
  }
  assert.fail('the archive was not refused');
}

/** A manifest, so a tree holds one. */
const MANIFEST: Entry = { name: 't/nemia.yaml', body: 'kind: FactoryTemplate\n' };

const ALL_BYTES = Uint8Array.from({ length: 256 }, (_, i) => i);
const LONG = `skills/${'a'.repeat(60)}/scripts/${'b'.repeat(60)}/${'c'.repeat(40)}.sh`;

test('what packArchive writes unpacks to the same name, paths, modes and bytes: a script, all 256 bytes, an empty file, UTF-8 and a long path', () => {
  const files = [
    file('nemia.yaml', 'kind: FactoryTemplate\n'),
    file('skills/x/scripts/run.sh', '#!/bin/sh\n', 0o755),
    file('skills/x/data.bin', ALL_BYTES),
    file('skills/x/empty.md', ''),
    file('skills/x/résumé-ü.md', 'é\n'),
    file(LONG, 'long\n', 0o700),
  ];
  assert.ok(Buffer.byteLength(`team/${LONG}`) > 100, 'the long path needs ustar prefix');
  const { archive, digest } = packArchive('team', files);
  const back = unpackArchive(archive);
  assert.equal(back.name, 'team');
  assert.equal(back.digest, digest);
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : 1));
  assert.deepEqual(
    back.files.map((f) => [f.path, f.mode, Buffer.from(f.bytes).toString('hex')]),
    sorted.map((f) => [f.path, f.mode, Buffer.from(f.bytes).toString('hex')]),
  );
});

test('the same files in any order pack to the same bytes, and the digest is the sha256 of the tar inside', () => {
  const files = [file('nemia.yaml', 'a'), file('agents/x/agent.yaml', 'b'), file('NEMIA.md', 'c'), file('workflows/w/s.md', 'd')];
  const once = packArchive('team', files);
  const shuffled = packArchive('team', [files[2], files[0], files[3], files[1]]);
  assert.deepEqual(shuffled.archive, once.archive);
  assert.equal(shuffled.digest, once.digest);
  assert.equal(once.digest, `sha256:${createHash('sha256').update(gunzipSync(once.archive)).digest('hex')}`);
  assert.equal(contentDigest('team', files), once.digest);
  assert.notEqual(contentDigest('team', [...files.slice(1), file('nemia.yaml', 'A')]), once.digest);
});

test('entries are sorted by code unit, never by locale: B.md before a.md', () => {
  const tar = gunzipSync(packArchive('team', [file('a.md', 'a'), file('B.md', 'b')]).archive);
  assert.equal(tar.subarray(0, 100).toString('utf8').replace(/\0+$/, ''), 'team/B.md');
  assert.equal(tar.subarray(1024, 1124).toString('utf8').replace(/\0+$/, ''), 'team/a.md');
});

test('a path no ustar header holds is refused at pack, by name', () => {
  const long = `skills/${'x'.repeat(101)}`;
  assert.throws(
    () => packArchive('team', [file('nemia.yaml', 'a'), file(long, 'b')]),
    (err: Error & { _tag?: string }) =>
      err._tag === 'Invalid' && err.message.includes(`${long}: team/${long} is longer than an archive holds`),
  );
});

test('a tar over the limit is refused at pack, naming it', () => {
  assert.throws(
    () => packArchive('team', [file('nemia.yaml', 'x'.repeat(4096))], 1024),
    (err: Error) => /over the 1024 an archive holds/.test(err.message),
  );
});

test('a mode is kept to its permission bits: 0o4755 comes back 0o755', () => {
  assert.deepEqual(
    unpackArchive(packArchive('team', [file('run.sh', '', 0o4755)]).archive).files.map((f) => f.mode),
    [0o755],
  );
  assert.deepEqual(
    unpackArchive(gzipSync(rawTar([{ name: 't/run.sh', mode: 0o4755 }]))).files.map((f) => f.mode),
    [0o755],
  );
});

test('a path that climbs out of the folder is refused by name', () => {
  assert.match(refusal([MANIFEST, { name: 't/../escape', body: 'x' }]), /t\/\.\.\/escape: has a part that is empty, \. or \.\./);
});

test('an absolute path is refused by name', () => {
  assert.match(refusal([MANIFEST, { name: '/etc/passwd', body: 'x' }]), /\/etc\/passwd: is absolute/);
});

test('a backslash and an empty part are refused by name', () => {
  assert.match(refusal([MANIFEST, { name: 't\\..\\x', body: 'x' }]), /t\\\.\.\\x: holds a backslash/);
  assert.match(refusal([MANIFEST, { name: 't//x', body: 'x' }]), /t\/\/x: has a part that is empty/);
  assert.match(refusal([MANIFEST, { name: 't/./x', body: 'x' }]), /t\/\.\/x: has a part that is empty, \. or \.\./);
});

test('a second top folder is refused, naming both', () => {
  assert.match(refusal([MANIFEST, { name: 'other/x', body: 'x' }]), /other, t: are two top folders or more/);
});

test('a top folder that is no name is refused', () => {
  assert.match(refusal([{ name: 'T x/nemia.yaml', body: 'x' }]), /T x: is the top folder, and is no name/);
  assert.match(refusal([{ name: '../nemia.yaml', body: 'x' }]), /\.\.\/nemia\.yaml: has a part that is empty, \. or \.\./);
});

test('a file beside the folder, not in it, is refused', () => {
  assert.match(refusal([{ name: 'nemia.yaml', body: 'x' }]), /nemia\.yaml: is a file beside the template's folder/);
});

test('a symbolic link, a hard link, a device, a pax header and a GNU long name are each refused by type', () => {
  for (const type of ['2', '1', '3', '6', 'x', 'g', 'L', 'K'])
    assert.match(
      refusal([MANIFEST, { name: 't/odd', type }]),
      new RegExp(`t/odd: is of type "${type}", and a template holds files and folders only[^]*nemia template pack`),
      type,
    );
});

test('a path given twice, and a file another entry stands under, are refused by name', () => {
  assert.match(refusal([MANIFEST, MANIFEST]), /t\/nemia\.yaml: is given twice/);
  assert.match(refusal([MANIFEST, { name: 't/a', body: 'x' }, { name: 't/a/b', body: 'y' }]), /\n {2}t\/a: is a file, and another entry/);
  assert.match(refusal([MANIFEST, { name: 't/a/', type: '5' }, { name: 't/a', body: 'x' }]), /t\/a: is given twice/);
});

test('a bad checksum, a body cut short and bytes that are no gzip are refused', () => {
  assert.match(refusal([{ ...MANIFEST, checksum: 1 }]), /the block at byte 0: has a header whose checksum does not add up/);
  const cut = rawTar([MANIFEST, { name: 't/big', body: 'x'.repeat(2000) }], 512 * 4);
  assert.throws(
    () => unpackArchive(gzipSync(cut)),
    (err: Error) => /t\/big: is cut short: 2000 bytes/.test(err.message),
  );
  assert.throws(
    () => unpackArchive(Buffer.from('not an archive'), ARCHIVE_LIMIT, 'x.tgz'),
    (err: Error & { _tag?: string }) => err._tag === 'Invalid' && err.message.startsWith('x.tgz is no archive: its bytes are not gzip'),
  );
});

test('a tar larger than the limit is refused, naming the limit', () => {
  const tar = rawTar([MANIFEST, { name: 't/big', body: 'x'.repeat(3000) }]);
  assert.ok(tar.length >= 4096);
  assert.throws(
    () => unpackArchive(gzipSync(tar), 1024),
    (err: Error & { _tag?: string }) => err._tag === 'Invalid' && /unpacks to more than 1024 bytes/.test(err.message),
  );
  assert.equal(unpackArchive(gzipSync(tar), tar.length).files.length, 2);
});

test('every refused entry is said at once', () => {
  const message = refusal([MANIFEST, { name: 't/../a', body: 'x' }, { name: 't/l', type: '2' }, { name: '/b', body: 'y' }]);
  assert.match(message, /t\/\.\.\/a: has a part[^]*t\/l: is of type "2"[^]*\/b: is absolute/);
});

test("GNU tar's magic and its folder entries are read", () => {
  const gnu = 'ustar  \u0000';
  const back = unpackArchive(
    gzipSync(
      rawTar([
        { name: 't/', type: '5', magic: gnu },
        { ...MANIFEST, magic: gnu },
      ]),
    ),
  );
  assert.equal(back.name, 't');
  assert.deepEqual(
    back.files.map((f) => f.path),
    ['nemia.yaml'],
  );
  assert.match(refusal([{ ...MANIFEST, magic: 'nope\u0000\u0000\u0000\u0000' }]), /is no ustar header/);
});
