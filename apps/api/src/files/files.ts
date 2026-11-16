/**
 * A factory's files (`objects`' `FilesGroup`): one uploaded for a start in its namespace to hand its run's steps, as the model APIs'
 * Files API takes one — a form of one part, `file` (`multipart/form-data`), read as the stream of its parts and written to the store as
 * its bytes come (`fileBegun`, the package's), never held whole in memory, then kept (`fileKept`) and answered as the file object. A
 * start names it by its id (runs/start.ts, `withInputs`). The form's limits are its endpoint's (`FILE_LIMIT`, one part): a file past the
 * cap is `TooLarge`, a 413 naming it; a form with no file part, a second part or a file with no name, `Invalid`; one that does not parse,
 * `BadRequest`. What was written of a file refused is let go of (`fileDropped`).
 */
import path from 'node:path';
import { ByteSize, Cause, Effect, Exit, Stream } from 'effect';
import { Multipart } from 'effect/http';
import { type FileBegun, fileBegun, fileDropped, fileKept } from 'agent-orchestrator';
import { Api, BadRequest, FILE_LIMIT, type FileObject, Invalid, TooLarge } from 'objects';
import { readsBounded } from '../objects/answer-bound.ts';
import { answeredWriteIn } from '../objects/refused.ts';

/** The route, as a refusal names it. */
const ROUTE = 'POST /api/namespaces/<namespace>/files';

/** How a form is sent, as a refusal says it. */
const SEND = `Send one file as the form's part \`file\`, as \`curl -F file=@<path>\` sends it, or start with \`nemia start <brief> --input <file>\`, which uploads each.`;

/** A form whose parts are not one file, `file`, with a name: what it is refused as, in words that say what to send. */
class NotOneFile extends Error {}

/** A file whose bytes pass `FILE_LIMIT`, which the form's own limit leaves room past for the part's headers. */
class PastCap extends Error {}

/** What a form's failure is answered as: a file past the cap a 413, a form of other parts a 422, one that does not parse a 400. */
const refusalOf = (failure: unknown): TooLarge | Invalid | BadRequest => {
  if (failure instanceof NotOneFile) return new Invalid({ error: `${ROUTE} ${failure.message} ${SEND}` });
  const reason = Multipart.isMultipartError(failure) ? failure.reason._tag : undefined;
  if (failure instanceof PastCap || reason === 'FileTooLarge' || reason === 'BodyTooLarge')
    return new TooLarge({
      error: `${ROUTE} keeps a file of ${ByteSize.format(FILE_LIMIT)} (${Number(FILE_LIMIT)} bytes) at most, and this one is larger. Hand the run a smaller file; nothing was kept.`,
    });
  if (reason === 'TooManyParts') return new Invalid({ error: `${ROUTE} takes a form of one part, the file, and was sent more. ${SEND}` });
  return new BadRequest({ error: `${ROUTE} was sent a body that does not read as a multipart/form-data form. ${SEND}` });
};

/** What a form's file part was sent as: its name and media type. */
type Sent = { readonly name: string; readonly mediaType: string };

/**
 * The form `parts`' one file written to the file `begun` as its bytes come, its part closed once the form ends however it ends: what it
 * was sent as and how many bytes were written. Fails with the form's own error, `PastCap` for bytes past `FILE_LIMIT`, or `NotOneFile`
 * for a part that is no file named `file`, a second one, or a file with no name.
 */
const written = (parts: Stream.Stream<Multipart.Part, Multipart.MultipartError>, begun: FileBegun) =>
  Effect.gen(function* () {
    let sent: Sent | undefined;
    let size = 0;
    yield* Stream.runForEach(parts, (each) => {
      if (!Multipart.isFile(each) || each.key !== 'file')
        return Effect.fail(new NotOneFile(`takes the file as the form's part \`file\`, and was sent the part \`${each.key}\`.`));
      if (sent !== undefined) return Effect.fail(new NotOneFile('takes one file a request, and was sent two.'));
      const name = path.basename(each.name.replaceAll('\\', '/'));
      if (name === '' || name === '.' || name === '..')
        return Effect.fail(new NotOneFile("names each file by its own name, and this part's file has none."));
      sent = { name, mediaType: each.contentType || 'application/octet-stream' };
      return Stream.runForEach(each.content, (chunk) => {
        size += chunk.length;
        if (size > Number(FILE_LIMIT)) return Effect.fail(new PastCap());
        return Effect.sync(() => begun.write(chunk));
      });
    });
    if (sent === undefined) return yield* Effect.fail(new NotOneFile('was sent a form with no file in it.'));
    return { ...sent, size };
  }).pipe(Effect.ensuring(Effect.sync(() => begun.close())));

/**
 * The file the form `parts` sends, kept in `namespace`'s files and answered as its file object; refused as `refusalOf` says, what was
 * written of it let go of.
 * @param namespace The namespace it is uploaded to, a factory's or `default`.
 * @param parts The form's parts, as they are read.
 */
const uploaded = (namespace: string, parts: Stream.Stream<Multipart.Part, Multipart.MultipartError>) =>
  Effect.gen(function* () {
    const now = Date.now();
    const begun = yield* answeredWriteIn(namespace, async (s) => ({ home: s.home, at: fileBegun(s.home, namespace, now) }));
    if (begun.at === undefined)
      return yield* Effect.fail(
        new Invalid({
          error: `${ROUTE} keeps files for a factory, and \`${namespace}\` names none: upload it to a namespace nemia factory ls lists, or to default.`,
        }),
      );
    const { id } = begun.at;
    const exit = yield* Effect.exit(written(parts, begun.at));
    if (Exit.isFailure(exit)) {
      fileDropped(begun.home, namespace, id);
      const failure = exit.cause.reasons.find((r) => r._tag === 'Fail');
      if (failure === undefined) return yield* Effect.die(Cause.squash(exit.cause));
      return yield* Effect.fail(refusalOf(failure.error));
    }
    const file: FileObject = { id, ...exit.value, createdAt: new Date(now).toISOString() };
    return fileKept(begun.home, namespace, file);
  });

/** The files group's handlers: a file uploaded. */
export const filesHandlers = readsBounded(Api, 'files', (handlers) =>
  handlers.handle('upload', ({ params: { namespace }, payload }) => uploaded(namespace, payload)),
);
