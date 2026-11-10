/**
 * The place model: the kind of place a run's work is on, named (decisions Q8, Q16, Q20, and decision 9's `PlaceKind`, the step key's
 * words). The runtime holds Mount and ExecutionPlace; PlaceKind is the orchestrator's, the closed set the run records hold: a git run's,
 * which a record with no `place` is, and a folder run's, listed once in record.ts (`PLACE_KINDS`), a pure file
 * the package's entries reach. An attribute of a run, not an entity, so the diagram has no part of the place's.
 * The follow-up intent renames the place to the runtime's mount (place → mount); until then it is the place's own word.
 */
import { Schema } from 'effect';
import { PLACE_KINDS } from '../record/record.ts';

/** The kind of place a run's work is on: `git`, branches of a repository, or `folder`, folders the run makes. */
export const PlaceKind = Schema.Literals(PLACE_KINDS).annotate({ identifier: 'PlaceKind' });
export type PlaceKind = typeof PlaceKind.Type;
