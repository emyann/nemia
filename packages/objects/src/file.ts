/**
 * A file a factory keeps for a start to hand its run's steps, as the model APIs' Files API keeps one: uploaded once, each file its own
 * request (`POST /api/namespaces/<namespace>/files`, a form of one part, `file`), streamed to disk and never held whole in memory or in a
 * JSON body, and answered as a file object (`FileObject`) whose id a start names in an input (`RunInput`'s `file`). How large one may be
 * (`FILE_LIMIT`), and how long one is kept (`FILE_KEPT_FOR`). A record that carries a file names it by one pointer (`FilePointer`), OCI's
 * content descriptor with the File's id in place of its `urls`.
 */
import { ByteSize, Schema } from 'effect';

/**
 * The most one file may be: 64 MiB. A full-width screenshot is about 1 MB as a PNG, and a design export a few MB; the largest a person
 * hands whole is a screenshot of a 5K display (5120×2880), 56.25 MiB as raw RGBA, which a PNG of it does not pass even where it does not
 * compress. 64 MiB holds that, never shrunk, and the body goes to disk as it is read, so the cap bounds the disk, not the api's memory.
 */
export const FILE_LIMIT = ByteSize.mebibytes(64);

/**
 * How long a file no card names is kept from its last write: a day, in milliseconds. A File an inbox card names (its id anywhere in the
 * card's text) is kept as long as the card stays in the inbox. Long enough to upload and start, and to start again after a start
 * refused for something else, with the same ids; short enough that a store does not grow with the files of starts never made. A run copies
 * each file it is handed into its own `inputs/` as it starts, so letting a file go takes nothing from a run.
 */
export const FILE_KEPT_FOR = 24 * 60 * 60 * 1000;

/** How many files one card may carry: a card past it is refused at filing, attach or edit (`count`). */
export const CARD_FILES_MOST = 32;

/** How many bytes all of a card's files together may be: 256 MiB, four files at the cap (`bytes`). */
export const CARD_FILES_BYTES_MOST = 256 * 1024 * 1024;

/** The media types a picture is drawn and shown in: what the Messages API's image block takes, and what the board draws inline. */
export const PICTURE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;

/** A media type a picture is drawn and shown in. */
export type PictureMediaType = (typeof PICTURE_TYPES)[number];

/** The prefix of every file's id, as the model APIs' ids say what they name (`file_…`). */
export const FILE_ID_PREFIX = 'file_';

/** A file's digest as OCI's descriptor writes one, `<algorithm>:<encoded>`: sha256 of its bytes, in 64 lowercase hexadecimal digits. */
export const FILE_DIGEST = /^sha256:[0-9a-f]{64}$/;

/** A file's digest, `sha256:<hex>`, checked by `FILE_DIGEST`. */
const FileDigest = Schema.String.annotate({
  description: 'sha256 of its bytes, written sha256:<64 lowercase hexadecimal digits>, as an OCI descriptor writes a digest.',
}).check(
  Schema.isPattern(FILE_DIGEST, {
    message: 'a digest is sha256:<64 lowercase hexadecimal digits> of the bytes, as the upload answered it',
  }),
);

/** A file kept for a start: its id, the name and media type it was sent with, its size, its digest, and when it was uploaded. */
export const FileObject = Schema.Struct({
  id: Schema.String.annotate({ description: "The file's id, file_…, which a start names as an input's file in the same namespace." }),
  name: Schema.String.annotate({
    description: "The file's own name, as the form's part named it, no folder in it: what a run's steps find it by.",
  }),
  mediaType: Schema.String.annotate({ description: "Its media type, as the form's part said it (application/octet-stream where none)." }),
  size: Schema.Int.annotate({ description: 'Its size in bytes, as the api kept it.' }),
  digest: FileDigest,
  createdAt: Schema.String.annotate({
    description: 'When it was uploaded, as an ISO 8601 time: a day later it is let go of, whether a run took it or not.',
  }),
}).annotate({ identifier: 'File' });
export type FileObject = typeof FileObject.Type;

/**
 * How a record names a file it carries, which the record never holds itself: OCI's content descriptor (`mediaType`, `digest`, `size`),
 * with the File's id in its record's namespace (`file`) where OCI gives the places it is downloaded from (`urls`), since a File is served
 * by its id. The store refuses a record whose pointer names no File it holds, and keeps a File while a record points to it.
 */
export const FilePointer = Schema.Struct({
  file: Schema.String.annotate({ description: "The File's id, file_…, in the namespace of the record that points to it." }),
  mediaType: Schema.String.annotate({ description: "The File's media type, as it was uploaded." }),
  size: Schema.Int.annotate({ description: "The File's size in bytes." }),
  digest: FileDigest,
}).annotate({ identifier: 'FilePointer' });
export type FilePointer = typeof FilePointer.Type;
