/**
 * The files group of the `Api` (`FilesGroup`): a file uploaded to a factory for a start to hand its run's steps, as a form of one part,
 * `file` (`multipart/form-data`), read as a stream and written to disk as it is read, never held whole in memory. Served by the api's
 * files handlers (`apps/api/src/files/files.ts`).
 */
import { ByteSize, Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from 'effect/http-api';
import { BadRequest, Invalid, Missing, TooLarge } from './api-errors.ts';
import { FILE_LIMIT, FileObject, PICTURE_TYPES } from './file.ts';

/**
 * What a form takes beside the file's bytes: its boundaries and the part's own headers, which the parser counts in the part's size, never a
 * second file. The handler holds the file's bytes to `FILE_LIMIT` itself.
 */
const FORM_FRAME = ByteSize.kibibytes(64);

/**
 * A file's upload: a form of one part, `file`, of `FILE_LIMIT` at most, its frame beside it; read as the stream of its parts, the handler
 * writing the file's bytes to disk as they come.
 */
const FileForm = Schema.Unknown.pipe(
  HttpApiSchema.asMultipartStream({
    maxParts: 1,
    maxFileSize: ByteSize.bytes(Number(FILE_LIMIT) + Number(FORM_FRAME)),
    maxTotalSize: ByteSize.bytes(Number(FILE_LIMIT) + Number(FORM_FRAME)),
  }),
);

/** The namespace a file is uploaded to, a factory's, where a start in it names the file by its id. */
const namespaceParams = {
  namespace: Schema.String.annotate({ description: 'The namespace, a factory (default for none), whose starts may name the file.' }),
};

/** One file of a namespace, by its id. */
const fileParams = {
  ...namespaceParams,
  id: Schema.String.annotate({ description: "The file's id, file_…." }),
};

/** A file's bytes as they are kept, streamed: a picture as its own type, inline, any other as an attachment. */
const FileContent = HttpApiSchema.StreamUint8Array({ contentType: ['application/octet-stream', ...PICTURE_TYPES] });

/** A factory's files: one uploaded, for a start in the same namespace to name by its id. */
export class FilesGroup extends HttpApiGroup.make('files').add(
  HttpApiEndpoint.post('upload', '/api/namespaces/:namespace/files', {
    params: namespaceParams,
    payload: FileForm,
    success: FileObject.pipe(Schema.annotate({ httpApiStatus: 201 })),
    error: [BadRequest, Missing, Invalid, TooLarge],
  }).annotate(
    OpenApi.Description,
    "Keeps one file for a start in the namespace to hand its run's steps: a multipart/form-data body of one part, file, of 64 MiB at most, written to disk as it is read. A start then names it by its id as an input's file. Kept a day from its upload, or while an inbox card names it. Answers the File with a 201; a file past the cap is TooLarge, a 413.",
  ),
  HttpApiEndpoint.get('content', '/api/namespaces/:namespace/files/:id/content', {
    params: fileParams,
    success: FileContent,
    error: [Missing],
  }).annotate(
    OpenApi.Description,
    "Streams a kept file's bytes: a PNG, JPEG, GIF or WebP picture as its own type, inline, and any other as application/octet-stream, an attachment, never sniffed and never run.",
  ),
) {}
