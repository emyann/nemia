/**
 * What the definitions' runners send of what was typed: the repository `--repo` names, else the one the command is typed in, as the
 * endpoint's `?repo=` query (`repoQueryOf`); and the words a file holds, `--file <path>`, or `-` for stdin, read here and sent as words,
 * never a path.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { type Args, Invalid } from 'objects';
import { Refused } from '../../refused.ts';
import { repoQueryOf, textArg } from '../requests.ts';

/** A `repo` query, or none. */
type RepoQuery = { readonly repo?: string };

/**
 * `ask` made on the repository a definitions' command is about: the one `--repo` names, sent as `pathSent` sends a path; none typed,
 * under this machine's context the folder the command is typed in, which the api places on the repository it knows that holds it
 * (`repoQueryOf`), and where it knows none (`Invalid`) asked again with no repository, which the api answers on its own. Under a remote
 * context no repository is sent.
 */
export const onRepo = <A, E, R>(args: Args, ask: (repo: RepoQuery) => Effect.Effect<A, E, R>): Effect.Effect<A, E, R> => {
  const typed = textArg(args, 'repo');
  const query = repoQueryOf(typed, undefined);
  if (typed !== undefined || query.repo === undefined) return ask(query);
  return ask(query).pipe(
    Effect.catchIf(
      (err): err is E & Invalid => err instanceof Invalid,
      () => ask({}),
    ),
  );
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
