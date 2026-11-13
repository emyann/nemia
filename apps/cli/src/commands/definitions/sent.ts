/**
 * What the definitions' runners send of what was typed: the repository `--repo` names, else the one the command is typed in, as the
 * endpoint's `?repo=` query (`repoQueryOf`); and the words a file holds, `--file <path>`, or `-` for stdin, read here and sent as words,
 * never a path.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Args } from 'objects';
import { Refused } from '../../refused.ts';
import { repoQueryOf, textArg } from '../requests.ts';

/**
 * The `repo` query of what `--repo` named, sent as `pathSent` sends a path; none typed, under this machine's context the repository the
 * command is typed in, and none in a folder of no repository or under a remote context, which the api answers on its own repository
 * (`repoQueryOf`).
 */
export const repoQuery = (args: Args): { readonly repo?: string } => repoQueryOf(textArg(args, 'repo'), undefined, 'none');

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
