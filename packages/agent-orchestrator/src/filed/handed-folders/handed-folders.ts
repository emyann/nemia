/** Each folder the pass found of the runs a run is handed, by its absolute path (`contracts/handed-folders.contract.ts`). */
import type { HandedFolders } from '../../../contracts/handed-folders.contract.ts';

/**
 * Each folder the pass found of the runs a run is handed (`found`), by its absolute path: each run's `artifacts/`, then each run's
 * `inputs/`.
 * @param found Each run handed and its folders as the pass found them, a folder absent where it was not found.
 */
export const handedFolders: HandedFolders = (found) => {
  const folders: string[] = [];
  for (const f of found) if (f.artifacts !== undefined) folders.push(f.artifacts);
  for (const f of found) if (f.inputs !== undefined) folders.push(f.inputs);
  return folders;
};
