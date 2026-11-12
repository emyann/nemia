/**
 * A route that is the person's alone: a session's token is refused it (`Forbidden`, 403), as a step's session must not act on the
 * machine outside its agent's fence — approve a pairing, make a first-visit link, start a need's fix.
 */
import { Forbidden } from 'objects';
import type { Served } from '../layer.ts';

/** Throws `Forbidden` unless the caller of `route` is the person, naming `instead`, what the person types at the store's machine. */
export const personOnly = (s: Served, route: string, instead: string): void => {
  if (s.caller.kind === 'person') return;
  throw new Forbidden({
    error: `${route} is the person's alone, and this request carries a session's token: run ${instead} at the store's machine, or send a token of yours (\`nemia token add <name>\` mints one).`,
  });
};
