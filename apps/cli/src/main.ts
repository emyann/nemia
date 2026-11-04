/**
 * `nemia`, a client of the api: a moved read asks the api serving this store over HTTP; every other verb, a help, and a read typed
 * with `--local` run on the orchestrator's own CLI, spawned with the same words (`local.ts`), so writes keep their path exactly.
 */
import { type Entry, spawned, unlocal } from './local.ts';
import { nameOf, type ReadVerb, routeOf } from './route.ts';
import { closeout } from './reads/closeout.ts';
import { inbox } from './reads/inbox.ts';
import { ls } from './reads/ls.ts';
import { show } from './reads/show.ts';
import { watch } from './watch/watch.ts';

/** What the `wf` alias says first, on stderr, the same words the orchestrator's alias says. */
export const WF_HINT = 'wf is now nemia: type `nemia <args>`; wf stays an alias until a later release removes it.';

/** Each moved read's runner, on the words after its name: it prints, and answers its exit code. */
const READS: Readonly<Record<ReadVerb, (args: readonly string[]) => Promise<number>>> = { show, closeout, ls, inbox, watch };

/** Runs `argv` and answers the exit code: on the api for a moved read, else on the old path under `entry`. */
export async function main(argv: readonly string[], entry: Entry = 'nemia'): Promise<number> {
  const words = unlocal(argv);
  const name = nameOf(words);
  const route = routeOf({ name, local: words.length !== argv.length, help: words.includes('--help') });
  if (route === 'process') return spawned(words, entry);
  if (entry === 'wf') process.stderr.write(`${WF_HINT}\n`);
  const read = Object.entries(READS).find(([verb]) => verb === name)?.[1];
  return read === undefined ? spawned(words, entry) : read(words.slice(1));
}
