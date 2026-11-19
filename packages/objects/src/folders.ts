/**
 * The person's folder listing and the two writes it serves, for a page that asks where a factory's work is: the names of the folders under
 * a typed path (`GET /api/folders`), a folder made a git repository (`POST /api/folders/repository`), and a new, empty repository made in
 * the store (`POST /api/repositories`). Each is the person's alone, never an agent's. The group that serves them is `FoldersGroup`.
 */
import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from 'effect/http-api';
import { BadRequest, Failed, Forbidden, Invalid, Missing } from './api-errors.ts';

/** `GET /api/folders`' query: the path the person typed. */
const folderQuery = {
  path: Schema.String.annotate({
    description:
      'The absolute path as typed: the folders of its folder whose names begin with the piece after its last slash are named; ending in a slash, every folder of it.',
  }),
};

/**
 * What the listing answers of a typed path: the folder listed, the names of the folders in it that begin with what was typed after the
 * last slash (no file, at most 50), whether more were left out, and whether the typed path is itself a folder the listing reaches, and
 * one in a git repository.
 */
export const FolderNames = Schema.Struct({
  path: Schema.String.annotate({ description: 'The folder listed, an absolute path.' }),
  names: Schema.Array(Schema.String).annotate({
    description:
      'The names of the folders in it that begin with what was typed after the last slash, in order, at most 50; hidden ones only when that piece opens with a dot. Never a file.',
  }),
  more: Schema.Boolean.annotate({ description: 'Whether more folders would be named than the 50 answered.' }),
  folder: Schema.Boolean.annotate({ description: 'Whether the typed path is itself a folder the listing reaches.' }),
  repository: Schema.Boolean.annotate({ description: 'Whether the typed path is a folder in a git repository.' }),
});
export type FolderNames = typeof FolderNames.Type;

/** `POST /api/folders/repository`'s body: the folder to make a git repository. */
export const RepositoryMake = Schema.Struct({
  path: Schema.String.annotate({ description: 'The folder to make a git repository, an absolute path under the folders Nemia lists.' }),
});
export type RepositoryMake = typeof RepositoryMake.Type;

/** `POST /api/repositories`' body: the name of the new repository. */
export const RepositoryNew = Schema.Struct({
  name: Schema.String.annotate({
    description: "The new repository's name: lowercase letters, digits, dots, dashes and underscores, from a letter or a digit.",
  }),
});
export type RepositoryNew = typeof RepositoryNew.Type;

/** A repository made, or found made: its folder, and whether anything was made now. */
export const RepositoryMade = Schema.Struct({
  path: Schema.String.annotate({ description: "The repository's folder, an absolute path." }),
  made: Schema.Boolean.annotate({
    description: 'Whether it was made now; false where the folder was a repository with a commit already, and nothing was touched.',
  }),
});
export type RepositoryMade = typeof RepositoryMade.Type;

/** What the listing and its writes refuse with. */
const folderErrors = [BadRequest, Invalid, Missing, Forbidden, Failed];

/** The person's folder listing, and the repositories it makes. */
export class FoldersGroup extends HttpApiGroup.make('folders').add(
  HttpApiEndpoint.get('list', '/api/folders', { query: folderQuery, success: FolderNames, error: folderErrors }).annotate(
    OpenApi.Description,
    "Lists the names of the folders under the typed path, the person's alone: only under the folders the store lists (WF_FOLDER_ROOTS, else the daemon user's home), never inside a store, names of folders only, at most 50. Answers FolderNames.",
  ),
  HttpApiEndpoint.post('repository', '/api/folders/repository', {
    payload: RepositoryMake,
    success: RepositoryMade,
    error: folderErrors,
  }).annotate(
    OpenApi.Description,
    "Makes a folder under the listed folders a git repository with one empty first commit, adding none of its files, the person's alone. Answers RepositoryMade.",
  ),
  HttpApiEndpoint.post('make', '/api/repositories', { payload: RepositoryNew, success: RepositoryMade, error: folderErrors }).annotate(
    OpenApi.Description,
    "Makes a new, empty git repository in the store, at <store>/repositories/<name>, with one empty first commit, the person's alone. Answers RepositoryMade.",
  ),
) {}
