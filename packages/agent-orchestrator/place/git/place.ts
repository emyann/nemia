/**
 * The git place: what a place answers (`Place` in `src/place/place.store.ts`), answered by running git. `gitPlace` holds nothing between
 * questions: each one is a verb's body (`verbs/`) run over git by `answered` or `answeredNow` (`git.ts`), within the verb's deadline.
 */
import { readable } from './asked.ts';
import { declared } from './declared.ts';
import { answered, answeredNow, type Asking, type Reply } from './git.ts';
import { exported } from './verbs/export.ts';
import { handoff } from './verbs/handoff.ts';
import { inventory } from './verbs/inventory.ts';
import { land } from './verbs/land.ts';
import { make } from './verbs/make.ts';
import { open } from './verbs/open.ts';
import { remove } from './verbs/remove.ts';
import { report } from './verbs/report.ts';
import { root } from './verbs/root.ts';
import { seal } from './verbs/seal.ts';
import { standing } from './verbs/standing.ts';
import { status } from './verbs/status.ts';
import { trial } from './verbs/trial.ts';
import { STOP_GRACE_MS, type AskOptions, type Place } from '../../src/place/place.store.ts';
import { PLACE_DEADLINE_MS, type PlaceRequests, type PlaceVerb } from '../../src/place/place.ts';

/** Each verb's body. */
const VERBS: { readonly [V in PlaceVerb]: (request: PlaceRequests[V]) => Asking<Reply<V>> } = {
  root,
  open,
  make,
  handoff,
  report,
  standing,
  trial,
  status,
  land,
  inventory,
  remove,
  export: exported,
  seal,
};

/** `verb`'s body for `request`, which it reads first: one it cannot read is `Malformed` before any command is run. */
function* body<V extends PlaceVerb>(verb: V, request: PlaceRequests[V]): Asking<Reply<V>> {
  readable(verb, request);
  return yield* VERBS[verb](request);
}

/** What `gitPlace` may be given: the environment git runs in, this process's by default, and what to call for each process it starts. */
export type GitPlaceOptions = { readonly env?: NodeJS.ProcessEnv; readonly started?: () => void };

/** A git place: one object that answers every repository it is asked of, and keeps nothing of any. */
export function gitPlace(options: GitPlaceOptions = {}): Place {
  const asked = (verb: PlaceVerb, given: AskOptions | undefined) => ({
    deadlineMs: given?.deadlineMs ?? PLACE_DEADLINE_MS[verb],
    graceMs: given?.graceMs ?? STOP_GRACE_MS,
    env: options.env ?? process.env,
    started: options.started ?? (() => undefined),
  });
  return {
    declared,
    ask: (verb, request, given) => answered(verb, () => body(verb, request), asked(verb, given)),
    askNow: (verb, request, given) => answeredNow(verb, body(verb, request), asked(verb, given)),
  };
}
