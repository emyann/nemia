/**
 * The person's folder listing and the two writes it serves, as programs the api runs for the person alone: the names of the folders
 * under what they typed (`foldersNamed`), a folder of theirs made a git repository (`repositoryMade`), and a new repository made in the
 * store (`repositoryNew`, `<WF_ROOT>/repositories/<name>`). The listing reads only under the roots the store names
 * (`StoreConfig.folderRoots`, `WF_FOLDER_ROOTS`), judged where a link leads, never inside a store, and answers names of folders alone.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { StoreConfig } from '../../config/config.store.ts';
import { StoreRoot } from '../../config/root.store.ts';
import { PlaceService } from '../../place/place.store.ts';
import { unansweredWords } from '../../place/place.ts';
import { Invalid } from '../../refusal/refusal.ts';
import { rootOf } from '../../trust/untrusted.verb.ts';
import {
  FOLDER_NAMES_MOST,
  folderNamesShown,
  folderReach,
  REPOSITORIES,
  repositoryNameRefusal,
  typedFolder,
  type FolderEntry,
} from './folders.ts';

/** What the listing answers of what was typed. */
export type FolderNamesRead = {
  readonly path: string;
  readonly names: readonly string[];
  readonly more: boolean;
  readonly folder: boolean;
  readonly repository: boolean;
};

/** A repository made, or found made: its folder, and whether anything was made now. */
export type RepositoryMadeRead = { readonly path: string; readonly made: boolean };

/**
 * `at` resolved through its links: where it is not there, its deepest folder that is, resolved, with the rest of the path under it, and a
 * link that leads nowhere followed to where it would lead, so every link on the path is judged where it leads. A path the disk
 * cannot follow (a loop of links, a file on the way) is answered as it is written, and the write refuses it.
 */
const realOr = (at: string): string => {
  const whole = path.resolve(at);
  try {
    return fs.realpathSync(whole);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') return whole;
    const up = path.dirname(whole);
    if (fs.lstatSync(whole, { throwIfNoEntry: false })?.isSymbolicLink()) return realOr(path.resolve(up, fs.readlinkSync(whole)));
    return up === whole ? whole : path.join(realOr(up), path.basename(whole));
  }
};

/** Whether `at` is a folder, a link followed. */
const isFolder = (at: string): boolean => fs.statSync(at, { throwIfNoEntry: false })?.isDirectory() ?? false;

/** The roots and the stores, each resolved through its links, as the listing judges by them. */
const bounds = Effect.fnUntraced(function* () {
  const config = yield* StoreConfig;
  const home = yield* StoreRoot;
  return { roots: config.folderRoots.map(realOr), stores: [home, config.engineStore].map(realOr), configured: config.folderRoots };
});

/** `real` refused `Invalid` where the listing may not read it, in words that name what to do. */
const reached = Effect.fnUntraced(function* (typed: string, real: string) {
  const { roots, stores, configured } = yield* bounds();
  const reach = folderReach(real, roots, stores);
  if (reach === 'store')
    return yield* Effect.fail(
      new Invalid({ message: `${typed} is inside Nemia's store, which no listing reads: name a folder of your own work outside it.` }),
    );
  if (reach === 'outside')
    return yield* Effect.fail(
      new Invalid({
        message: `${typed} is under none of the folders Nemia lists (${configured.join(', ')}): type its whole path, or set WF_FOLDER_ROOTS on the daemon to the folders to list.`,
      }),
    );
});

/** `typed` refused `Invalid` where it is no absolute path. */
const absolute = (typed: string) =>
  path.isAbsolute(typed)
    ? Effect.void
    : Effect.fail(new Invalid({ message: `${typed} is not an absolute path: type the folder from the root, /home/me/code say.` }));

/**
 * The names of the folders under what the person typed, the folder listed, and whether what they typed is itself a folder, and one in a
 * git repository. A folder that is not there answers no names. Refused `Invalid` for a relative path, one under no root, and one in a
 * store.
 * @param typed The path the person typed, absolute.
 */
export const foldersNamed = Effect.fn('foldersNamed')(function* (typed: string) {
  yield* absolute(typed);
  const { dir, prefix } = typedFolder(typed);
  const real = realOr(dir);
  yield* reached(dir, real);
  const entries: FolderEntry[] = isFolder(real)
    ? fs
        .readdirSync(real, { withFileTypes: true })
        .filter((e) => e.name.startsWith(prefix))
        .map((e) => ({ name: e.name, folder: e.isDirectory() || (e.isSymbolicLink() && isFolder(path.join(real, e.name))) }))
    : [];
  const shown = folderNamesShown(entries, prefix, FOLDER_NAMES_MOST);
  const chosen = realOr(typed);
  const { roots, stores } = yield* bounds();
  const folder = isFolder(chosen) && folderReach(chosen, roots, stores) === 'within';
  const rooted = folder ? yield* rootOf(yield* PlaceService, chosen) : undefined;
  const repository = rooted !== undefined && 'root' in rooted && rooted.root !== undefined;
  return { path: dir, names: shown.names, more: shown.more, folder, repository } satisfies FolderNamesRead;
});

/** The place's `init` of `dir`, its refusal or silence `Invalid` in its words. */
const initialized = Effect.fnUntraced(function* (dir: string) {
  const outcome = yield* (yield* PlaceService).ask('init', { dir });
  if ('answer' in outcome) return { path: dir, made: outcome.answer.made } satisfies RepositoryMadeRead;
  return yield* Effect.fail(new Invalid({ message: unansweredWords(outcome) }));
});

/**
 * The folder `at` of the person's made a git repository with one empty first commit, none of its files added (the place's `init`).
 * Refused `Invalid` for a relative path, one under no root the listing reads, one in a store, and where the place will not make it.
 * @param at The folder, absolute.
 */
export const repositoryMade = Effect.fn('repositoryMade')(function* (at: string) {
  yield* absolute(at);
  const dir = path.resolve(at);
  yield* reached(dir, realOr(dir));
  return yield* initialized(dir);
});

/**
 * A new, empty git repository made in the store, at `<WF_ROOT>/repositories/<name>`, with one empty first commit; one there already is
 * answered as it is. Refused `Invalid` for a name that is no repository's name.
 * @param name The repository's name.
 */
export const repositoryNew = Effect.fn('repositoryNew')(function* (name: string) {
  const bad = repositoryNameRefusal(name);
  if (bad !== undefined) return yield* Effect.fail(new Invalid({ message: bad }));
  return yield* initialized(path.join(yield* StoreRoot, REPOSITORIES, name));
});
