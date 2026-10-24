/**
 * The place model: the kind of place a run's work is on, named (decisions Q8, Q16, Q20) and nothing reshaped. The runtime holds Mount and
 * ExecutionPlace; MountKind is the orchestrator's, the closed set the run records hold today (`PlaceKind`, record.ts): a repository run's,
 * which a record with no `place` is, and a folder run's. An attribute of a run, not an entity, so this part of the diagram names none.
 * A declaration in S1: no read path decodes through it.
 */
import { Schema } from 'effect';
import type { ErModel } from '../model/er.model.ts';
import type { PlaceKind } from '../record/record.ts';

/** The kinds of place a run's work is on, as the records hold them (`placeOf`). */
const MOUNT_KINDS = ['repository', 'folder'] as const satisfies ReadonlyArray<PlaceKind>;

/** The kind of place a run's work is on: `repository` or `folder` (`PlaceKind`, which it becomes the name of on decision 9's card). */
export const MountKind = Schema.Literals(MOUNT_KINDS).annotate({ identifier: 'MountKind' });
export type MountKind = typeof MountKind.Type;

/** The place context's part of the orchestrator's diagram: no entity, since a kind is an attribute of a run. */
export const placeModel = { entities: [], ids: {} } satisfies ErModel;
