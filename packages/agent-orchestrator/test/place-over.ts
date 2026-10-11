/**
 * A place with some verbs answered by the test: `placeOver(place, verbs)` answers each verb of `verbs` with what its function returns,
 * both ways of asking, and every other verb as `place` does. `unreadBy` is the outcome of a verb that was not heard, in `said`.
 * `placeHeld(place, verb)` holds each `ask` of one verb until the test lets it go, and counts those in flight.
 */
import { Effect } from 'effect';
import type { Place } from '../src/place/place.store.ts';
import type { PlaceOutcome, PlaceRequests, PlaceVerb } from '../src/place/place.ts';
import { bell, type Bell } from './waits.ts';

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

/** A place whose asks of one verb wait on the test (`placeHeld`): the place, and what the test reads and does of those asks. */
export type HeldPlace<V extends PlaceVerb> = {
  readonly place: Place;
  /** Rung each time an ask of the verb comes in and waits. */
  readonly bell: Bell;
  /** Each request of the verb, in the order asked. */
  readonly requests: PlaceRequests[V][];
  /** How many asks of the verb wait to be let go now. */
  readonly waiting: () => number;
  /** The most asks of the verb ever in flight at once: come in, and not answered yet. */
  readonly most: () => number;
  /** Let the ask that came in last go on to `place`; nothing, when none waits. */
  readonly letGo: () => void;
};

/**
 * `place`, with each `ask` of `verb` held when it comes in, until the test lets it go (`letGo`), and then asked of `place`: a test
 * waits on the bell for the asks it counts, never on a length of time. Every other verb, and `askNow`, as `place` does.
 */
export function placeHeld<V extends PlaceVerb>(place: Place, verb: V): HeldPlace<V> {
  const rung = bell();
  const requests: PlaceRequests[V][] = [];
  const held: Array<() => void> = [];
  let flying = 0;
  let most = 0;
  const entered = (request: PlaceRequests[V]) =>
    Effect.callback<void>((resume) => {
      requests.push(request);
      held.push(() => resume(Effect.void));
      flying += 1;
      most = Math.max(most, flying);
      rung.ring();
    });
  return {
    place: {
      declared: place.declared,
      ask: (asked, request, options) =>
        (asked as PlaceVerb) === verb
          ? entered(request as PlaceRequests[PlaceVerb] as PlaceRequests[V]).pipe(
              Effect.andThen(place.ask(asked, request, options)),
              Effect.ensuring(Effect.sync(() => void (flying -= 1))),
            )
          : place.ask(asked, request, options),
      askNow: place.askNow,
    },
    bell: rung,
    requests,
    waiting: () => held.length,
    most: () => most,
    letGo: () => held.pop()?.(),
  };
}
