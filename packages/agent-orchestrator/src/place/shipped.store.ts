/**
 * The place this package ships, as a layer: `gitPlaceLayer`, the git place (`place/git`) for whoever composes a program — the daemon, a
 * command, the api, a test that is about git. The one file of `src` that imports the place's code. Each question is counted in the
 * pass's `place` phase while a pass is metered: its time, and each process the place starts for it (`countSpawn`).
 */
import path from 'node:path';
import { Effect } from 'effect';
import { gitPlace } from '../../place/git/place.ts';
import { PlaceService, type Place } from './place.store.ts';
import { PLACE_SKILLS } from '../skills/read.store.ts';
import { countSpawn, within, withinEffect } from '../meter/tally.store.ts';

/** The folder of the skill a step's agent reads of the place the package ships. */
export const SHIPPED_PLACE = path.join(PLACE_SKILLS, 'git');

/** `place`, each question counted as the pass's `place` phase. */
export const meteredPlace = (place: Place): Place => ({
  declared: place.declared,
  ask: (verb, request, options) => withinEffect('place', place.ask(verb, request, options)),
  askNow: (verb, request, options) => within('place', () => place.askNow(verb, request, options)),
});

/** The git place, metered: one object for every factory and repository of the process it is given to. */
export const shippedGitPlace: Place = meteredPlace(gitPlace({ started: countSpawn }));

/** `shippedGitPlace` as the layer a program is given it by. */
export const gitPlaceLayer = PlaceService.layer(shippedGitPlace);

/** `program` given `shippedGitPlace`, and still to be run: how a command of the CLI gives its program the place, by name. */
export const shipped = <A, E, R>(program: Effect.Effect<A, E, R>): Effect.Effect<A, E, Exclude<R, PlaceService>> =>
  Effect.provide(program, gitPlaceLayer);
