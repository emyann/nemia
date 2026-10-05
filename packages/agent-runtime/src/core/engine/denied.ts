/**
 * What the harness denied an attempt in flight, journalled as it reports it (`denied`): a session that carries on past a refusal
 * would otherwise say so only at its end, too late for anyone to grant the call while it works. Pure, and apart from `domain.ts`,
 * whose `decide` reads no denial.
 */
import { denialText, type Event, type Sighting, type State } from '../domain.ts';

/**
 * What the engine journals of an attempt's denials off its sighting, before it decides: one `denied` entry for each denial the
 * sighting names past those the attempt holds, in order — the same reading seen on any number of passes is written once.
 * Nothing for a settled task, an ended attempt, a session the pass did not see or that is no longer working, whose end carries
 * the denials, a sighting that names none, or one whose denials do not begin with the attempt's: another reading than the one
 * written, which the end sets right.
 */
export function deniedFacts(state: State, sighting: Sighting | undefined, at: string): Event[] {
  const last = state.attempts.at(-1);
  if (state.settled || !last || last.ended !== null || sighting?.state !== 'working' || !sighting.denials) return [];
  const held = (last.denials ?? []).map(denialText);
  const said = sighting.denials.map(denialText);
  if (held.some((text, i) => text !== said[i])) return [];
  return sighting.denials.slice(held.length).map((d) => ({ kind: 'denied', at, attempt: last.n, ...d }));
}
