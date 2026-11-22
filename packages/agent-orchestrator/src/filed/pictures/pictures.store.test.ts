/**
 * The pictures handed to a run, read off its inputs folder (`pictures.store.ts`): each format's sides read off its own header — a PNG's
 * IHDR, a GIF's screen descriptor, a WebP's VP8, VP8L and VP8X chunks, a JPEG's SOF past an APP segment — and an SVG or a torn header
 * read as no format; then what a first step is shown of them, on a harness that shows pictures, and none on one that does not, nor on a
 * step that waits on another or resumes a session.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { handedPictures, headerOf, picturesFiled } from './pictures.store.ts';

/** A PNG's first bytes: its signature, then an IHDR of `w` by `h`. */
const png = (w: number, h: number) => {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
};

/** A GIF's first bytes, its screen `w` by `h`. */
const gif = (w: number, h: number) => {
  const b = Buffer.alloc(13);
  b.write('GIF89a', 0, 'latin1');
  b.writeUInt16LE(w, 6);
  b.writeUInt16LE(h, 8);
  return b;
};

/** A WebP's first bytes with its first chunk `chunk`, whose payload `payload` writes. */
const webp = (chunk: string, payload: (b: Buffer) => void) => {
  const b = Buffer.alloc(40);
  b.write('RIFF', 0, 'latin1');
  b.write('WEBP', 8, 'latin1');
  b.write(chunk, 12, 'latin1');
  payload(b);
  return b;
};

/** A JPEG's first bytes: an APP0 segment, then a SOF0 of `w` by `h`. */
const jpeg = (w: number, h: number) => {
  const app = Buffer.from([0xff, 0xe0, 0x00, 0x06, 0x4a, 0x46, 0x49, 0x46]);
  const sof = Buffer.alloc(19);
  sof[0] = 0xff;
  sof[1] = 0xc0;
  sof.writeUInt16BE(17, 2);
  sof[4] = 8;
  sof.writeUInt16BE(h, 5);
  sof.writeUInt16BE(w, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app, sof]);
};

describe("a picture's format and sides, off its own header", () => {
  for (const [row, head, read] of [
    ['a PNG', png(1280, 720), { type: 'image/png', width: 1280, height: 720 }],
    ['a GIF', gif(64, 32), { type: 'image/gif', width: 64, height: 32 }],
    [
      'a lossy WebP',
      webp('VP8 ', (b) => (b.writeUInt16LE(300, 26), b.writeUInt16LE(200, 28))),
      { type: 'image/webp', width: 300, height: 200 },
    ],
    ['a lossless WebP', webp('VP8L', (b) => b.writeUInt32LE(299 | (199 << 14), 21)), { type: 'image/webp', width: 300, height: 200 }],
    [
      'an extended WebP',
      webp('VP8X', (b) => (b.writeUIntLE(299, 24, 3), b.writeUIntLE(199, 27, 3))),
      { type: 'image/webp', width: 300, height: 200 },
    ],
    ['a JPEG, its SOF past an APP segment', jpeg(4000, 3000), { type: 'image/jpeg', width: 4000, height: 3000 }],
    ['an SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), { type: null, width: null, height: null }],
    ['a torn PNG', png(1, 1).subarray(0, 12), { type: 'image/png', width: null, height: null }],
  ] as const) {
    test(row, () => assert.deepEqual(headerOf(head), read));
  }
});

describe('what a first step is shown of the pictures handed to its run', () => {
  const dir = scratch('nemia-pictures-');
  fs.writeFileSync(path.join(dir, 'shot.png'), png(800, 600));
  fs.writeFileSync(path.join(dir, 'logo.svg'), '<svg/>');
  fs.writeFileSync(path.join(dir, 'notes.md'), '# notes\n');
  const names = ['shot.png', 'logo.svg', 'notes.md'];
  test('a file is a picture by its name, read with its size', () => {
    assert.deepEqual(
      handedPictures(dir, names).map((p) => [p.name, p.type, p.bytes]),
      [
        ['shot.png', 'image/png', 33],
        ['logo.svg', null, 6],
      ],
    );
  });
  test('on Claude Code, a first step is shown the PNG and held the SVG for its format', () => {
    const filed = picturesFiled({ after: [] }, false, dir, names);
    assert.deepEqual(filed?.pictures, [{ path: path.join(dir, 'shot.png'), mediaType: 'image/png' }]);
    assert.deepEqual(filed?.held, [{ name: 'logo.svg', reason: 'format' }]);
  });
  test('on Codex, both are held for its harness', () => {
    const filed = picturesFiled({ after: [], harness: 'codex' }, false, dir, names);
    assert.deepEqual([filed?.pictures, filed?.held.map((h) => h.reason)], [[], ['harness', 'harness']]);
  });
  test('a step that waits on another, or resumes a session, is shown none and told nothing', () => {
    assert.equal(picturesFiled({ after: ['plan'] }, false, dir, names), undefined);
    assert.equal(picturesFiled({ after: [] }, true, dir, names), undefined);
  });
});
