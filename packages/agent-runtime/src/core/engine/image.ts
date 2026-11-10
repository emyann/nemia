/**
 * The code an attempt in flight runs on, its harness's version and the mode it runs in, journalled as its sighting says them
 * (`image`): a Pod's `containerStatuses[].image`, which a reader of records — which session runs on which release, in which mode —
 * needs while the session still works, not only at its end. Pure, and apart from `domain.ts`, whose `decide` reads none of them.
 */
import type { Event, Sighting, State } from '../domain.ts';

/**
 * What the engine journals of the code an attempt runs on off its sighting, before it decides: one `image` entry naming each of
 * `image`, `harnessVersion` and `ranIn` the sighting says and the attempt does not hold as said — level-triggered, so the same reading
 * on any number of passes is written once, and a new holder, a resumed process on another version or a turn in another mode is written
 * again. Nothing for a settled task, an ended attempt, a session the pass did not see, or a sighting that says none of them or says what
 * the attempt holds.
 */
export function imageFacts(state: State, sighting: Sighting | undefined, at: string): Event[] {
  const last = state.attempts.at(-1);
  if (state.settled || !last || last.ended !== null || !sighting) return [];
  const image = sighting.image !== undefined && sighting.image !== last.image ? sighting.image : undefined;
  const harnessVersion =
    sighting.harnessVersion !== undefined && sighting.harnessVersion !== last.harnessVersion ? sighting.harnessVersion : undefined;
  const ranIn = sighting.ranIn !== undefined && sighting.ranIn !== last.ranIn ? sighting.ranIn : undefined;
  if (image === undefined && harnessVersion === undefined && ranIn === undefined) return [];
  return [
    {
      kind: 'image',
      at,
      attempt: last.n,
      ...(image !== undefined ? { image } : {}),
      ...(harnessVersion !== undefined ? { harnessVersion } : {}),
      ...(ranIn !== undefined ? { ranIn } : {}),
    },
  ];
}
