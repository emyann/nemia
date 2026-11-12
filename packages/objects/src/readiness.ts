/**
 * The readiness read (`GET /api/readiness`, `nemia doctor`): every piece a person's server needs before a factory's first run, each in
 * place or missing, with the fix that puts it there — a command to type, or a fix the server runs itself (`POST /api/readiness/fixes`),
 * its output followed as it runs (`GET /api/readiness/fixes/:id/output`). The group that serves them is `ReadinessGroup`.
 */
import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api';
import { BadRequest, Conflict, Failed, Forbidden, Invalid, Missing } from './api-errors.ts';
import { NeedAsk } from './workflow.ts';
import { ADDRESS_KINDS, FIX_KINDS, FIX_PHASES, FIX_STREAM_EVENTS, HARNESS_PARTS, READINESS_AREAS, READINESS_STATES } from './words.ts';

/**
 * A way to put a piece in place: what it does in words and its command — typed by the person where `startable` is false (`nemia
 * claude-token set`, `loginctl enable-linger`), or started by the server where it is true, which `index` names among the need's fixes —
 * with the answers it asks first, the pattern of a code its output shows, and its kind where it is no `puts` (`typed`, a command the
 * person types on the server; `removes`, one that takes a met piece away, a harness deactivated).
 */
export const ReadinessFix = Schema.Struct({
  message: Schema.String,
  command: Schema.String,
  startable: Schema.Boolean,
  index: Schema.optionalKey(Schema.Number),
  asks: Schema.optionalKey(Schema.Array(NeedAsk)),
  code: Schema.optionalKey(Schema.String),
  kind: Schema.optionalKey(Schema.Literals(FIX_KINDS)),
});
export type ReadinessFix = typeof ReadinessFix.Type;

/**
 * One piece of the read: its name (a need's name for a declared need), its area, its state, a sentence of what it is or why it is not in
 * place, its fixes, the factory and workflow of a workflow's need (the factory alone of a repository's), the kind of the bind's address
 * for the `bind` piece, and, for a harness's piece, the harness it is of and which of its two needs (`harness`), so a reader groups a
 * harness's pieces without naming one.
 */
export const ReadinessPiece = Schema.Struct({
  name: Schema.String,
  area: Schema.Literals(READINESS_AREAS),
  state: Schema.Literals(READINESS_STATES),
  message: Schema.String,
  fixes: Schema.Array(ReadinessFix),
  factory: Schema.optionalKey(Schema.String),
  workflow: Schema.optionalKey(Schema.String),
  addressKind: Schema.optionalKey(Schema.Literals(ADDRESS_KINDS)),
  harness: Schema.optionalKey(Schema.Struct({ name: Schema.String, part: Schema.Literals(HARNESS_PARTS) })),
});
export type ReadinessPiece = typeof ReadinessPiece.Type;

/** `GET /api/readiness`: whether every piece is in place (`ready`: none is `missing`; an `inactive` one is not), and the pieces, in the read's order. */
export const Readiness = Schema.Struct({ ready: Schema.Boolean, pieces: Schema.Array(ReadinessPiece) });
export type Readiness = typeof Readiness.Type;

/**
 * `POST /api/readiness/fixes`' body: the need whose fix to start, the factory and workflow of a workflow's need (the factory alone of a
 * repository's need, none for a place's or a harness's),
 * which of its fixes (`index`, the first where left out), and the answers its asks were given, by their names.
 */
export const FixStart = Schema.Struct({
  need: Schema.String,
  factory: Schema.optionalKey(Schema.String),
  workflow: Schema.optionalKey(Schema.String),
  index: Schema.optionalKey(Schema.Number),
  answers: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
});
export type FixStart = typeof FixStart.Type;

/**
 * A fix started: its id, the need, factory and workflow it fixes, its phase, the tail of what it printed, the pattern of the code its
 * output shows (the declared `code`), and its exit code once it ended.
 */
export const Fix = Schema.Struct({
  id: Schema.String,
  need: Schema.String,
  factory: Schema.optionalKey(Schema.String),
  workflow: Schema.optionalKey(Schema.String),
  phase: Schema.Literals(FIX_PHASES),
  output: Schema.String,
  code: Schema.optionalKey(Schema.String),
  exitCode: Schema.optionalKey(Schema.Number),
});
export type Fix = typeof Fix.Type;

/** One event of a fix's output stream: a chunk of what it printed (`output`), or its end (`ended`, its data the `Fix` as JSON). */
export const FixStreamEvent = Schema.Struct({ event: Schema.Literals(FIX_STREAM_EVENTS), data: Schema.String });
export type FixStreamEvent = typeof FixStreamEvent.Type;

/** A fix's id in a path. */
const fixParams = { id: Schema.String };

/** The readiness read and its fixes. */
export class ReadinessGroup extends HttpApiGroup.make('readiness').add(
  HttpApiEndpoint.get('read', '/api/readiness', { success: Readiness, error: [Invalid, Failed] }),
  HttpApiEndpoint.post('fix', '/api/readiness/fixes', {
    payload: FixStart,
    success: Fix,
    error: [BadRequest, Invalid, Missing, Conflict, Forbidden, Failed],
  }),
  HttpApiEndpoint.get('fixOf', '/api/readiness/fixes/:id', { params: fixParams, success: Fix, error: [Missing, Failed] }),
  HttpApiEndpoint.get('fixOutput', '/api/readiness/fixes/:id/output', {
    params: fixParams,
    success: HttpApiSchema.StreamSse({ events: FixStreamEvent }),
    error: [Missing],
  }),
) {}
