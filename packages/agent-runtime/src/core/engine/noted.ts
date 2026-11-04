/**
 * What a task's sighting says of its attempt in flight, gathered for the record before `decide` reads the fold (`notedOf`): each
 * writer is a pure function of the fold and the sighting, in a file of its own.
 */
import { nameFor, sightingFacts, type Event, type Sighting, type State } from '../domain.ts';
import type { Monotonic } from '../clock.ts';
import { countedFacts } from './counted.ts';
import { deniedFacts } from './denied.ts';
import { imageFacts } from './image.ts';

/** The sighting of a task's last attempt in one observation, as the harness gave it. */
const lastSighting = (state: State, observed: ReadonlyMap<string, Sighting>): Sighting | undefined => {
  const last = state.attempts.at(-1);
  return last ? observed.get(nameFor(state.taskId, last.n)) : undefined;
};

/**
 * What a task's sighting says of an attempt in flight, for the record: a long-lived one's process (`sightingFacts`), what it
 * has consumed so far (`countedFacts`), what the harness has denied any (`deniedFacts`), and the code and harness version it
 * runs on (`imageFacts`).
 */
export const notedOf = (state: State, observed: ReadonlyMap<string, Sighting>, at: string, mono?: Monotonic): Event[] => {
  const sighting = lastSighting(state, observed);
  return [
    ...sightingFacts(state, sighting, at, mono),
    ...countedFacts(state, sighting, at),
    ...deniedFacts(state, sighting, at),
    ...imageFacts(state, sighting, at),
  ];
};
