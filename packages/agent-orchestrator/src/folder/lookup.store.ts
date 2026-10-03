/**
 * Where a run on a repository looks for its steps' agents and skills, beside its folder's own, and the workflow folders a place holds: a
 * store file, since it names the store and lists a folder.
 */
import fs from 'node:fs';
import path from 'node:path';
import { AGENTS_FOLDER, SKILLS_FOLDER } from '../step/step.ts';
import { HOME } from '../record/record.store.ts';
import type { Places } from './folder.store.ts';

/** Where a run on `repo` looks for its steps' agents and skills beside its folder's own (`lookupRoots`): the repository, then the store. */
export const placesOf = (repo: string | undefined): Places => ({ ...(repo ? { repo } : {}), home: HOME });

/**
 * The folders directly in `dir`, sorted, a link to one included. None when `dir` is not there. A hidden folder is not a
 * workflow — `.git`, where a person keeps their workflows in git, or an editor's `.vscode` — so it is not listed, and no start
 * can name it; nor is `agents/`, whose files are the agents the workflows beside it name, nor `skills/`, the skills those agents give.
 */
export function foldersIn(dir: string): string[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch (err) {
    if (['ENOENT', 'ENOTDIR'].includes((err as NodeJS.ErrnoException).code ?? '')) return [];
    throw new Error(
      `${dir} could not be listed (${err instanceof Error ? err.message : String(err)}), so no workflow in it is shown. Check its permissions.`,
      {
        cause: err,
      },
    );
  }
  return names
    .filter((name) => {
      if (name.startsWith('.') || name === AGENTS_FOLDER || name === SKILLS_FOLDER) return false;
      try {
        return fs.statSync(path.join(dir, name)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort();
}
