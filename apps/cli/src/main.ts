/**
 * `nemia`, a client of the api: a moved read asks the api serving this store over HTTP; the client's own verbs (`CLIENT_VERBS`: `get`,
 * `apply`, `explain`, `propose`, `proposals`, `decide`) ask it whatever else is typed, each saying its own help and refusing
 * `--local`; every other verb, a help, and a read typed with `--local` run on the orchestrator's own CLI, spawned with the same words
 * (`local.ts`), so the writes it has not moved keep their path exactly.
 */
import { type Entry, spawned, unlocal } from './local.ts';
import { type ClientVerb, nameOf, type ReadVerb, routeOf } from './route.ts';
import { apply } from './objects/apply.ts';
import { decide } from './objects/decide.ts';
import { explain } from './objects/explain.ts';
import { get } from './objects/get.ts';
import { propose, proposals } from './objects/propose.ts';
import { closeout } from './reads/closeout.ts';
import { inbox } from './reads/inbox.ts';
import { ls } from './reads/ls.ts';
import { show } from './reads/show.ts';
import { watch } from './watch/watch.ts';

/** What the `wf` alias says first, on stderr, the same words the orchestrator's alias says. */
export const WF_HINT = 'wf is now nemia: type `nemia <args>`; wf stays an alias until a later release removes it.';

/** Each moved read's runner, on the words after its name: it prints, and answers its exit code. */
const READS: Readonly<Record<ReadVerb, (args: readonly string[]) => Promise<number>>> = { show, closeout, ls, inbox, watch };

/** Each of the client's own verbs' runner, on the words after its name, `--local` among them where it was typed, which it refuses. */
const own = (entry: Entry): Readonly<Record<ClientVerb, (args: readonly string[]) => Promise<number>>> => ({
  get,
  apply,
  explain,
  propose,
  proposals,
  decide: (args) => decide(args, (argv) => main(argv, entry)),
});

/** Runs `argv` and answers the exit code: on the api for a moved read, else on the old path under `entry`. */
export async function main(argv: readonly string[], entry: Entry = 'nemia'): Promise<number> {
  const words = unlocal(argv);
  const name = nameOf(words);
  const route = routeOf({ name, local: words.length !== argv.length, help: words.includes('--help') });
  if (route === 'process') return spawned(words, entry);
  if (entry === 'wf') process.stderr.write(`${WF_HINT}\n`);
  const verb = Object.entries(own(entry)).find(([word]) => word === name)?.[1];
  if (verb !== undefined) return verb([...words.slice(1), ...(words.length !== argv.length ? ['--local'] : [])]);
  const read = Object.entries(READS).find(([verb]) => verb === name)?.[1];
  return read === undefined ? spawned(words, entry) : read(words.slice(1));
}
