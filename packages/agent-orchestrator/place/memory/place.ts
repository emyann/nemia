/**
 * The test place: what a place answers (`Place` in `src/place/place.store.ts`), answered from what it holds in memory, with no process.
 * `testPlace()` makes a new one, which holds no repository until its `world` makes one: the place, the layer that gives it to a program,
 * and the handle a test does a session's and a person's part with (`World`). Both ways of asking run the same body at once; a verb that
 * throws is unread in one sentence naming it.
 *
 * It models commits as whole files, a merge by file, and the directories a step works in, which are real. It does not model a merge
 * within one file, a rename, a binary file, a link, an ignore rule, a hook, a lock, a deadline, a request of the wrong shape, a checkout
 * on no branch, nor what a person does by hand past its handle, a branch deleted: a test that needs one of those asks the git place. A
 * conflict is resolved, and an edit added to a staged merge, with `world.resolve`; a person takes a staged merge back with
 * `world.takeBack` and puts a base back on an older commit with `world.putBack`.
 */
import { Effect, type Layer } from 'effect';
import { worldOf } from './handle.ts';
import { inventory, open, report, root, standing, status, trial, type Reply } from './reads.ts';
import { exported, handoff, land, make, remove, seal } from './writes.ts';
import type { Held, World } from './world.ts';
import { PlaceService, threwWords, unreadNow, type Place } from '../../src/place/place.store.ts';
import type { PlaceDeclared, PlaceOutcome, PlaceRequests, PlaceVerb } from '../../src/place/place.ts';

/** Each verb's body, over what the place holds. */
const VERBS: { readonly [V in PlaceVerb]: (held: Held, request: PlaceRequests[V]) => Reply<V> } = {
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

/** What the test place declares of itself: nothing denied, and each sentence in words that name the handle, never a command. */
export const declared: PlaceDeclared = {
  denyWhileLanding: [],
  say: {
    look: ['read the files of your workspace against the commit {baseRef} of the test place'],
    readResult: 'ask the test place of {repo} what {branch} changed since {baseRef} (report)',
    ship: 'stage {branch} in {repo} with world.stage, then land it',
    drop: 'ask the test place of {repo} to remove {branches}',
    conflicts: 'The files in conflict hold both texts between marks.',
    unlock: 'the test place locks no workspace: {path} of {repo} is free',
    stage: 'world.stage({repo}, {branches})',
    attach: 'the test place keeps every workspace on a branch: {path} is on one',
    commit: 'world.commit({path}, message)',
    inspect: 'ask the test place the inventory that lists {path}',
    orphans: 'ask the test place the inventory of their repository, and remove each',
    results: ['ask the test place how {branch} stands against {base} (standing)', 'ask it what {branch} changed since {base} (report)'],
    merge: 'world.stage(workspace, {sha}), then world.commit',
    mergeUncommitted: 'world.stage(workspace, {sha})',
    showMerge: 'world.read(repo, head)',
    lastMerge: 'world.read(repo, head)',
  },
};

/** A test place: the place, the layer that gives it, and the handle on what it holds. */
export type TestPlace = { readonly place: Place; readonly layer: Layer.Layer<PlaceService>; readonly world: World };

/** A new test place, which holds nothing yet and shares nothing with another. */
export function testPlace(): TestPlace {
  const held: Held = { repositories: new Map(), made: 0 };
  const askNow = <V extends PlaceVerb>(verb: V, request: PlaceRequests[V]): PlaceOutcome<V> => {
    try {
      const reply = VERBS[verb](held, request);
      return 'refused' in reply ? { refused: reply.refused } : { answer: reply };
    } catch (threw) {
      return unreadNow(verb, threwWords(verb, threw));
    }
  };
  const place: Place = { declared, askNow, ask: (verb, request) => Effect.sync(() => askNow(verb, request)) };
  return { place, layer: PlaceService.layer(place), world: worldOf(held) };
}
