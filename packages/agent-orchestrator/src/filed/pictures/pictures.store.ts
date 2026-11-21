/**
 * The pictures handed to a run, read off its `inputs/` for its first step's filing: each file whose name says it is a picture, its format
 * and sides read off its own header — PNG's IHDR, GIF's screen descriptor, WebP's VP8, VP8L and VP8X chunks, JPEG's SOFn marker — and
 * its size off the disk (`handedPictures`); then which the step is shown (`picturesFiled`, by `picturesShown`). A header that does not read
 * reads as no format or no sides, never a throw, so a bad file is held back and the filing goes on.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { HandedPicture, PictureHeld, PictureType } from '../../../contracts/pictures-shown.contract.ts';
import { declarationOf, isRemoteHarness } from '../../harness/harness.ts';
import { PICTURES } from '../../start/inputs.ts';
import { PICTURE_BOUNDS, picturesShown } from './pictures.ts';

/** The bytes of a header read: enough for every format's sides, a JPEG's SOF past its EXIF included. */
const HEAD_BYTES = 256 * 1024;

/** A header's format and sides, or what of them did not read. */
type HeaderRead = { readonly type: PictureType | null; readonly width: number | null; readonly height: number | null };

/** No format a model takes, and no sides. */
const NONE: HeaderRead = { type: null, width: null, height: null };

/** Whether `b` begins with `sig` at `at`. */
const has = (b: Buffer, sig: readonly number[], at = 0) => b.length >= at + sig.length && sig.every((x, i) => b[at + i] === x);

/** A PNG's sides, off its IHDR, the first chunk. */
const png = (b: Buffer): HeaderRead =>
  b.length >= 24 && b.toString('latin1', 12, 16) === 'IHDR'
    ? { type: 'image/png', width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
    : { type: 'image/png', width: null, height: null };

/** A GIF's sides, off its logical screen descriptor. */
const gif = (b: Buffer): HeaderRead =>
  b.length >= 10
    ? { type: 'image/gif', width: b.readUInt16LE(6), height: b.readUInt16LE(8) }
    : { type: 'image/gif', width: null, height: null };

/** A WebP's sides, off its first chunk: VP8 (lossy), VP8L (lossless) or VP8X (extended). */
const webp = (b: Buffer): HeaderRead => {
  const chunk = b.toString('latin1', 12, 16);
  if (chunk === 'VP8 ' && b.length >= 30)
    return { type: 'image/webp', width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8L' && b.length >= 25) {
    const bits = b.readUInt32LE(21);
    return { type: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X' && b.length >= 30) return { type: 'image/webp', width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
  return { type: 'image/webp', width: null, height: null };
};

/** The JPEG markers that start a frame and say its sides: SOF0 to SOF15, but DHT (C4), JPG (C8) and DAC (CC). */
const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

/** A JPEG's sides, off its first SOFn marker, walking the segments before it. */
const jpeg = (b: Buffer): HeaderRead => {
  let at = 2;
  while (at + 9 < b.length) {
    if (b[at] !== 0xff) return { type: 'image/jpeg', width: null, height: null };
    const marker = b[at + 1] ?? 0;
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    if (SOF.has(marker)) return { type: 'image/jpeg', width: b.readUInt16BE(at + 7), height: b.readUInt16BE(at + 5) };
    at += 2 + b.readUInt16BE(at + 2);
  }
  return { type: 'image/jpeg', width: null, height: null };
};

/**
 * What a file's first bytes say it is: its format among those a model takes, and its sides; none for any other (an SVG, a BMP, an AVIF).
 * @param head The file's first bytes.
 */
export function headerOf(head: Buffer) {
  try {
    if (has(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return png(head);
    if (head.toString('latin1', 0, 6) === 'GIF87a' || head.toString('latin1', 0, 6) === 'GIF89a') return gif(head);
    if (head.toString('latin1', 0, 4) === 'RIFF' && head.toString('latin1', 8, 12) === 'WEBP') return webp(head);
    if (has(head, [0xff, 0xd8, 0xff])) return jpeg(head);
  } catch {
    return NONE;
  }
  return NONE;
}

/**
 * Each picture of the run's inputs folder `dir` among `names` (by its name's extension, `PICTURES`), as its header and the disk say it.
 * A file gone since reads as none of its format.
 * @param dir The run's inputs folder.
 * @param names The files handed, by name in that folder, in their order.
 */
export function handedPictures(dir: string, names: readonly string[]) {
  return names
    .filter((n) => PICTURES.has(path.extname(n).toLowerCase()))
    .map((name) => {
      const at = path.join(dir, name);
      let head = Buffer.alloc(0);
      let bytes = 0;
      try {
        bytes = fs.statSync(at).size;
        const fd = fs.openSync(at, 'r');
        try {
          const buf = Buffer.alloc(Math.min(HEAD_BYTES, bytes));
          head = buf.subarray(0, fs.readSync(fd, buf, 0, buf.length, 0));
        } finally {
          fs.closeSync(fd);
        }
      } catch {
        head = Buffer.alloc(0);
      }
      return { name, bytes, ...headerOf(head) } satisfies HandedPicture;
    });
}

/** What a step's filing does with the run's pictures: those it is shown, as its harness takes them, and each held back with why. */
export type PicturesFiled = {
  readonly pictures: readonly { readonly path: string; readonly mediaType: PictureType }[];
  readonly shown: readonly string[];
  readonly held: readonly PictureHeld[];
};

/**
 * The pictures a step is shown in its first message, and each held back with why, for a step that waits on no other step and is filed a
 * session of its own; undefined for any other step, or a run handed no picture.
 * @param step The step filed: whether it waits on another (`after`), and its harness.
 * @param resumes Whether its session resumes another, which saw them.
 * @param dir The run's inputs folder.
 * @param names The files handed to the run, by name.
 */
export function picturesFiled(
  step: { readonly after: readonly string[]; readonly harness?: string | undefined },
  resumes: boolean,
  dir: string,
  names: readonly string[] | undefined,
) {
  if (step.after.length > 0 || resumes || !names?.length) return undefined;
  const handed = handedPictures(dir, names);
  if (!handed.length) return undefined;
  const shows = !isRemoteHarness(step.harness) && (declarationOf(step.harness)?.can.includes('pictures') ?? false);
  const { shown, held } = picturesShown(handed, shows, PICTURE_BOUNDS);
  const filed: PicturesFiled = {
    pictures: shown.flatMap((name) => {
      const type = handed.find((p) => p.name === name)?.type;
      return type ? [{ path: path.join(dir, name), mediaType: type }] : [];
    }),
    shown,
    held,
  };
  return filed;
}

/** What each reason a picture is held back for says, in a brief. */
const HELD_WORDS: Readonly<Record<PictureHeld['reason'], string>> = {
  harness: "this session's harness shows no picture",
  format: 'its format is none a model takes (PNG, JPEG, GIF or WebP)',
  size: `it is larger than ${PICTURE_BOUNDS.bytes / 1024 / 1024} MiB`,
  sides: `a side is past ${PICTURE_BOUNDS.side} pixels, or did not read`,
  count: `${PICTURE_BOUNDS.count} pictures were shown before it`,
};

/**
 * The line a brief says of the pictures held back from its first message, each with why, and where to open it; undefined where none was.
 * @param held The pictures held back, with why.
 */
export const heldLine = (held: readonly PictureHeld[]) =>
  held.length
    ? `You are shown the pictures given with what was asked for in this first message, but these, which are in the run's inputs with the rest: ${held.map((h) => `\`${h.name}\` (${HELD_WORDS[h.reason]})`).join('; ')}. Open one with Read where you need it.`
    : undefined;
