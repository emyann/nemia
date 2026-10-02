/** Where a run on a repository looks for its steps' agents and skills, beside its folder's own: a store file, since it names the store. */
import { HOME } from '../record/record.store.ts';
import type { Places } from './folder.store.ts';

/** Where a run on `repo` looks for its steps' agents and skills beside its folder's own (`lookupRoots`): the repository, then the store. */
export const placesOf = (repo: string | undefined): Places => ({ ...(repo ? { repo } : {}), home: HOME });
