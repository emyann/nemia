/**
 * The person's folder listing (`GET /api/folders`, `objects`' `FolderNames`): the names of the folders under what was typed, which the
 * volume step's path field offers; a folder made a git repository (`POST /api/folders/repository`), and a new repository made in the
 * store (`POST /api/repositories`), each answering `RepositoryMade`.
 */
import { queryOptions } from '@tanstack/react-query';
import { FolderNames, RepositoryMade } from 'objects';
import { call, read, write } from './objects.ts';

/**
 * The folders under `path` as typed, read once a moment after the person stops typing (the field's own pace): none asked for an empty path.
 * @param path The path as typed, absolute.
 */
export const folderNamesQuery = (path: string) =>
  queryOptions({
    queryKey: ['folders', path],
    queryFn: () => call((c) => c.folders.list({ query: { path } }), read(FolderNames)),
    enabled: path.startsWith('/'),
    staleTime: 10_000,
  });

/**
 * The folder at `path` made a git repository, with one empty first commit and none of its files added.
 * @param path The folder, absolute.
 */
export const makeRepository = (path: string) =>
  call(
    (c) => c.folders.repository({ payload: { path } }),
    write(RepositoryMade, 'The folder may be a repository now: read the folder again before making it again.'),
  );

/**
 * A new, empty repository made in the store, named `name`: where it was made.
 * @param name The repository's name.
 */
export const newRepository = (name: string) =>
  call(
    (c) => c.folders.make({ payload: { name } }),
    write(RepositoryMade, 'The repository may be made: make it again under the same name, which finds it.'),
  );
