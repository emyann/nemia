/**
 * A place with some verbs answered by the test: `placeOver(place, verbs)` answers each verb of `verbs` with what its function returns,
 * both ways of asking, and every other verb as `place` does. `unreadBy` is the outcome of a verb that was not heard, in `said`.
 */
import { Effect } from 'effect';
import type { Place } from '../src/place/place.store.ts';
import type { PlaceOutcome, PlaceRequests, PlaceVerb } from '../src/place/place.ts';

/** The verbs a test answers itself, each from its request. */
export type OwnVerbs = { readonly [V in PlaceVerb]?: (request: PlaceRequests[V]) => PlaceOutcome<V> };

/** `verb` unread, in `said`. */
export const unreadBy = <V extends PlaceVerb>(verb: V, said: string): PlaceOutcome<V> => ({
  unread: { verb, said, at: new Date().toISOString() },
});

/** `place`, with each verb of `verbs` answered by its function. */
export function placeOver(place: Place, verbs: OwnVerbs): Place {
  const own = <V extends PlaceVerb>(verb: V): ((request: PlaceRequests[V]) => PlaceOutcome<V>) | undefined => verbs[verb];
  return {
    declared: place.declared,
    ask: (verb, request, options) => {
      const answer = own(verb);
      return answer ? Effect.sync(() => answer(request)) : place.ask(verb, request, options);
    },
    askNow: (verb, request, options) => {
      const answer = own(verb);
      return answer ? answer(request) : place.askNow(verb, request, options);
    },
  };
}

/** `place`, with each verb of `verbs` asked of `other` instead, both ways of asking. */
export function placeSplit(place: Place, other: Place, verbs: readonly PlaceVerb[]): Place {
  const of = (verb: PlaceVerb): Place => (verbs.includes(verb) ? other : place);
  return {
    declared: place.declared,
    ask: (verb, request, options) => of(verb).ask(verb, request, options),
    askNow: (verb, request, options) => of(verb).askNow(verb, request, options),
  };
}
