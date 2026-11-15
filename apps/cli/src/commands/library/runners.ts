/**
 * The runners of the library's commands (`objects`' `LIBRARY_WORDS`, `LIBRARY_ADD_WORDS`, `LIBRARY_RM_WORDS`), by name: the table is total
 * over the group's names, so one left out does not compile.
 */
import type { LIBRARY_ADD_WORDS, LIBRARY_RM_WORDS, LIBRARY_WORDS } from 'objects';
import type { Runner } from '../runner.ts';
import { libraryAdd, libraryListed, libraryRm } from './library.ts';

/** A command of the library's. */
type LibraryCommand = (typeof LIBRARY_WORDS | typeof LIBRARY_ADD_WORDS | typeof LIBRARY_RM_WORDS)['name'];

/** Each of the group's commands' runner. */
export const LIBRARY_RUNNERS: Readonly<Record<LibraryCommand, Runner>> = {
  library: libraryListed,
  'library add': libraryAdd,
  'library rm': libraryRm,
};
