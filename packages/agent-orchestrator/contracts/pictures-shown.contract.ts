/**
 * Which of the pictures handed to a run its first step is shown in its session's first message, and why each other is held back
 * (`picturesShown`, src/filed/pictures/pictures.ts): asked when a step that waits on no other step (`after: []`) is filed a session of its
 * own — never one that resumes a session, which saw them — off the run's `inputs/` as the filing read them. The shown go on the task as
 * the harness argument `pictures`; the held are named in the step's brief, each with its reason, and both are written on the try, which
 * the stats count.
 *
 * A picture is a handed file whose name says it is one (src/start/inputs.ts, `PICTURES`). Its format, its bytes and its sides are read by
 * the store off the file's own header and handed in as data; the bounds are this package's (`PICTURE_BOUNDS`), set under what the model
 * takes in one request (platform.claude.com, Vision, *Request limits*), and handed in.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** A format a model takes a picture in, closed: what the Messages API's image block takes. */
export type PictureType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

/**
 * A picture handed to the run, as the filing read it: its name in the run's `inputs/`, its format read off its header (null where it is
 * none of `PictureType`, an SVG, a BMP, an AVIF, or a header that does not read), its size in bytes, and its sides in pixels (null where
 * the header does not give them).
 */
export type HandedPicture = {
  readonly name: string;
  readonly type: PictureType | null;
  readonly bytes: number;
  readonly width: number | null;
  readonly height: number | null;
};

/**
 * Why a picture is not shown, closed: `harness`, the step's harness shows none (its declaration lists no `pictures`, or it is a remote
 * agent); `format`, no format a model takes; `size`, more bytes than one picture may be; `sides`, a side past the bound or not read;
 * `count`, as many as one message shows were shown before it.
 */
export type HeldReason = 'harness' | 'format' | 'size' | 'sides' | 'count';

/** A picture held back: its name and why. */
export type PictureHeld = { readonly name: string; readonly reason: HeldReason };

/** What the first step is shown: the names of the pictures put in its first message, in the order handed, and each held back. */
export type PicturesShown = { readonly shown: readonly string[]; readonly held: readonly PictureHeld[] };

/** How many pictures one message shows (`count`), how many bytes one may be (`bytes`), and the longest side one may have (`side`). */
export type PictureBounds = { readonly count: number; readonly bytes: number; readonly side: number };

/** Whether `p` may be put before a model as it is: a format it takes, its bytes and both its sides within the bounds. */
const fits = (p: HandedPicture, bounds: PictureBounds) =>
  p.type !== null && p.bytes <= bounds.bytes && p.width !== null && p.height !== null && p.width <= bounds.side && p.height <= bounds.side;

/** Whether the picture named `a` is handed before the one named `b`: `b` at a place after `a`'s (names are each handed once). */
const handedBefore = (handed: readonly HandedPicture[], a: string, b: string) =>
  handed.some((p, j) => p.name === a && handed.some((q, k) => k > j && q.name === b));

const picturesShownSpec = spec<(handed: readonly HandedPicture[], shows: boolean, bounds: PictureBounds) => PicturesShown>({
  requires: ({ input: [handed, , bounds] }) =>
    handed.every((p, i) => handed.every((o, j) => j <= i || o.name !== p.name)) &&
    handed.every((p) => Number.isSafeInteger(p.bytes) && p.bytes >= 0) &&
    handed.every((p) => (p.width === null || Number.isSafeInteger(p.width)) && (p.height === null || Number.isSafeInteger(p.height))) &&
    Number.isSafeInteger(bounds.count) &&
    bounds.count > 0 &&
    Number.isSafeInteger(bounds.bytes) &&
    bounds.bytes > 0 &&
    Number.isSafeInteger(bounds.side) &&
    bounds.side > 0,
  ensures: {
    noneLost: {
      description: 'Every picture handed is either shown or held back',
      condition: ({ input: [handed], output }) =>
        handed.every((p) => output.shown.includes(p.name) || output.held.some((h) => h.name === p.name)),
    },
    heldIsNotShown: {
      description: 'No picture held back is shown',
      condition: ({ output }) => output.held.every((h) => !output.shown.includes(h.name)),
    },
    onlyWhatWasHanded: {
      description: 'Every picture said, shown or held, was handed',
      condition: ({ input: [handed], output }) =>
        output.shown.every((s) => handed.some((p) => p.name === s)) && output.held.every((h) => handed.some((p) => p.name === h.name)),
    },
    noneShownTwice: {
      description: 'No picture is shown twice',
      condition: ({ output }) => output.shown.every((s, i) => output.shown.every((o, j) => j <= i || o !== s)),
    },
    noneHeldTwice: {
      description: 'No picture is held back twice',
      condition: ({ output }) => output.held.every((h, i) => output.held.every((o, j) => j <= i || o.name !== h.name)),
    },
    noHarnessShowsNone: {
      description: 'A step whose harness shows no picture is shown none, each held back for its harness',
      condition: ({ input: [, shows], output }) => shows || (output.shown.length === 0 && output.held.every((h) => h.reason === 'harness')),
    },
    harnessOnlyWhereItShowsNone: {
      description: 'A picture is held back for its harness only where the harness shows none',
      condition: ({ input: [, shows], output }) => !shows || output.held.every((h) => h.reason !== 'harness'),
    },
    whatIsShownFits: {
      description: 'A picture shown is in a format a model takes, within the bytes and the sides a picture may have',
      condition: ({ input: [handed, , bounds], output }) =>
        output.shown.every((name) => handed.some((p) => p.name === name && fits(p, bounds))),
    },
    asManyAsAMessageShows: {
      description: 'No more pictures are shown than one message shows',
      condition: ({ input: [, , bounds], output }) => output.shown.length <= bounds.count,
    },
    heldForWhatItIs: {
      description: 'A picture held back is held for what is true of it: no format, too many bytes, a side past the bound or not read',
      condition: ({ input: [handed, , bounds], output }) =>
        output.held.every((h) =>
          handed.some(
            (p) =>
              p.name === h.name &&
              (h.reason === 'harness' ||
                (h.reason === 'format' && p.type === null) ||
                (h.reason === 'size' && p.type !== null && p.bytes > bounds.bytes) ||
                (h.reason === 'sides' &&
                  p.type !== null &&
                  p.bytes <= bounds.bytes &&
                  (p.width === null || p.height === null || p.width > bounds.side || p.height > bounds.side)) ||
                (h.reason === 'count' && fits(p, bounds))),
          ),
        ),
    },
    countOnlyOnceFull: {
      description: 'A picture that fits is held back for the count only once as many as a message shows are shown',
      condition: ({ input: [, , bounds], output }) =>
        output.held.every((h) => h.reason !== 'count' || output.shown.length === bounds.count),
    },
    theFirstAreShown: {
      description: 'Where more fit than a message shows, the first handed are shown: each held for the count comes after every one shown',
      condition: ({ input: [handed], output }) =>
        output.held.every((h) => h.reason !== 'count' || output.shown.every((s) => handedBefore(handed, s, h.name))),
    },
    shownInTheOrderHanded: {
      description: 'The pictures shown are in the order they were handed',
      condition: ({ input: [handed], output }) =>
        output.shown.every((s, i) => i === 0 || handedBefore(handed, output.shown[i - 1] ?? '', s)),
    },
  },
});

/** Which pictures handed to a run its first step is shown, and why each other is held back. */
export type PicturesShownOf = Implementation<typeof picturesShownSpec>;
