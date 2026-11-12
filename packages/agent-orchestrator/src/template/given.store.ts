/**
 * A template as it travels to another machine's api (`objects`' `TemplateGiven`), and as that api takes it. On the machine a command is
 * typed on, a `--template` word is made the request's (`templateGiven`): a builtin template's name sent as it is, an archive's bytes as
 * they are, and a folder packed as `nemia template pack` packs it, each archive in base64; nothing of that machine's paths is sent. On the
 * api's, the template given is made the source a verb reads (`withTemplateTaken`): a name as it is, and an archive kept under the store
 * by its name and the digest of its content (`sentTemplatesDir`), since a factory made from it reads it again on every pass of the
 * controller; one kept by this request alone is removed as the request ends where nothing was made of it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Exit } from 'effect';
import type { TemplateGiven } from 'objects';
import { fromThrow as tried } from '../door/door.store.ts';
import { Invalid, type Refusal } from '../refusal/refusal.ts';
import { StoreRoot } from '../config/root.store.ts';
import { ARCHIVE_LIMIT, packArchive, unpackArchive } from '../archive/archive.ts';
import { templateFiles } from './door/templates.store.ts';
import { templateNameRefusal } from './door/templates.ts';

/** The folder of the store the templates sent to its api are kept in, each `<name>-<digest>.tgz`. */
export const sentTemplatesDir = (home: string): string => path.join(home, 'templates-sent');

/**
 * The request's template of the `--template` word `given`, as `sourceGiven` reads it: a template's name is a builtin template's, sent by
 * its name; a file is an archive, sent as its bytes; a folder is packed as `nemia template pack` packs it. Refused: a place that is
 * neither (`Missing`, as an apply here refuses it), and a folder whose files cannot be packed (`Invalid`, each problem at its file).
 */
export const templateGiven = (given: string): Effect.Effect<TemplateGiven, Refusal> =>
  tried((): TemplateGiven => {
    if (templateNameRefusal(given) === null) return { name: given };
    const at = path.resolve(given);
    if (fs.statSync(at, { throwIfNoEntry: false })?.isFile()) return { archive: fs.readFileSync(at).toString('base64') };
    const tree = templateFiles().templates.read(at);
    if (tree.problems.length)
      throw new Invalid({
        message: `${at} cannot be sent, since it cannot be packed:\n${tree.problems.map((p) => `  ${p.file}: ${p.message}`).join('\n')}\nNothing was sent.`,
      });
    return { archive: packArchive(tree.name, tree.files).archive.toString('base64') };
  });

/** A template taken: the source a verb reads it at, and whether this request wrote it there. */
type Taken = { readonly source: string; readonly wrote: string | null };

/**
 * The template `given` as a source under the store `home`: a name as it is, refused where it names no template (`Invalid`); an archive
 * unpacked to be checked, refused as `unpackArchive` refuses it (`Invalid`), and kept at `<name>-<digest>.tgz`, written by this request
 * where none is there yet.
 */
function taken(home: string, given: TemplateGiven): Taken {
  if ('name' in given) {
    if (templateNameRefusal(given.name) !== null)
      throw new Invalid({
        message: `${JSON.stringify(given.name)} names no builtin template: name one by its folder's name, lowercase words joined by dashes, or send the template packed, { "archive": <base64 of nemia template pack's archive> }.`,
      });
    return { source: given.name, wrote: null };
  }
  const bytes = Buffer.from(given.archive, 'base64');
  const { name, digest } = unpackArchive(bytes, ARCHIVE_LIMIT, 'the template sent');
  const dir = sentTemplatesDir(home);
  const at = path.join(dir, `${name}-${digest.replace(/^sha256:/, '')}.tgz`);
  if (fs.existsSync(at)) return { source: at, wrote: null };
  fs.mkdirSync(dir, { recursive: true });
  const part = `${at}.${process.pid}.part`;
  fs.writeFileSync(part, bytes);
  fs.renameSync(part, at);
  return { source: at, wrote: at };
}

/**
 * `use` given the source of the template `given`, taken under the store (`taken`). An archive this request wrote is removed as it ends
 * where `keep` is `never` — a preview, which records nothing — or where `use` failed; else it stays where the factory names it.
 */
export const withTemplateTaken = <A, E, R>(
  given: TemplateGiven,
  keep: 'never' | 'made',
  use: (source: string) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E | Refusal, R | StoreRoot> =>
  Effect.gen(function* () {
    const home = yield* StoreRoot;
    return yield* Effect.acquireUseRelease(
      tried(() => taken(home, given)),
      ({ source }) => use(source),
      ({ wrote }, exit) =>
        Effect.sync(() => {
          if (wrote !== null && (keep === 'never' || Exit.isFailure(exit))) fs.rmSync(wrote, { force: true });
        }),
    );
  });

/**
 * A forwarded call's input with its `--template` word made the request's (`templateGiven`), as a link's `request` takes it: the other
 * keys as they are, and an input that names no template as it is, for the verb there to refuse in its own words.
 */
export const templatePacked = (input: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>> => {
  const given = input['template'];
  return typeof given === 'string'
    ? Effect.runPromise(Effect.map(templateGiven(given), (template) => ({ ...input, template })))
    : Promise.resolve(input);
};
