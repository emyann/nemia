/**
 * What the definitions' runners send of what was typed: the repository `--repo` names, as the endpoint's `?repo=` query, a path on the
 * daemon's machine (`pathSent`); and the words a file holds, `--file <path>`, or `-` for stdin, read here and sent as words, never a path.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Args } from 'objects';
import { Refused } from '../../refused.ts';
import { pathSent, textArg } from '../requests.ts';

/**
 * The `repo` query of what `--repo` named, sent as `pathSent` sends a path: none where none was typed, which the api answers on its own
 * repository.
 */
export const repoQuery = (args: Args): { readonly repo?: string } => {
  const typed = textArg(args, 'repo');
  return typed === undefined ? {} : { repo: pathSent(typed) };
};

/** The words `file` holds, or stdin's for `-`, for `nemia <command>`; refused, exit 2, naming the file, where it cannot be read. */
export function wordsRead(file: string, command: string): string {
  try {
    return fs.readFileSync(file === '-' ? 0 : file, 'utf8');
  } catch (err) {
    throw new Refused(
      `nemia ${command} cannot read ${file === '-' ? 'stdin' : path.resolve(file)}: ${err instanceof Error ? err.message : String(err)}. Name a file that is there.`,
    );
  }
}
