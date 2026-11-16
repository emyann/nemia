/**
 * A file a factory keeps for a start to hand its run's steps, as the model APIs' Files API keeps one: uploaded once, each file its own
 * request (`POST /api/namespaces/<namespace>/files`, a form of one part, `file`), streamed to disk and never held whole in memory or in a
 * JSON body, and answered as a file object (`FileObject`) whose id a start names in an input (`RunInput`'s `file`). How large one may be
 * (`FILE_LIMIT`), and how long one is kept (`FILE_KEPT_FOR`).
 */
import { ByteSize, Schema } from 'effect';

/**
 * The most one file may be: 64 MiB. A full-width screenshot is about 1 MB as a PNG, and a design export a few MB; the largest a person
 * hands whole is a screenshot of a 5K display (5120×2880), 56.25 MiB as raw RGBA, which a PNG of it does not pass even where it does not
 * compress. 64 MiB holds that, never shrunk, and the body goes to disk as it is read, so the cap bounds the disk, not the api's memory.
 */
export const FILE_LIMIT = ByteSize.mebibytes(64);

/**
 * How long a file is kept from its upload: a day, in milliseconds. Long enough to upload and start, and to start again after a start
 * refused for something else, with the same ids; short enough that a store does not grow with the files of starts never made. A run copies
 * each file it is handed into its own `inputs/` as it starts, so letting a file go takes nothing from a run.
 */
export const FILE_KEPT_FOR = 24 * 60 * 60 * 1000;

/** The prefix of every file's id, as the model APIs' ids say what they name (`file_…`). */
export const FILE_ID_PREFIX = 'file_';

/** A file kept for a start: its id, the name and media type it was sent with, its size, and when it was uploaded. */
export const FileObject = Schema.Struct({
  id: Schema.String.annotate({ description: "The file's id, file_…, which a start names as an input's file in the same namespace." }),
  name: Schema.String.annotate({
    description: "The file's own name, as the form's part named it, no folder in it: what a run's steps find it by.",
  }),
  mediaType: Schema.String.annotate({ description: "Its media type, as the form's part said it (application/octet-stream where none)." }),
  size: Schema.Int.annotate({ description: 'Its size in bytes, as the api kept it.' }),
  createdAt: Schema.String.annotate({
    description: 'When it was uploaded, as an ISO 8601 time: a day later it is let go of, whether a run took it or not.',
  }),
}).annotate({ identifier: 'File' });
export type FileObject = typeof FileObject.Type;
