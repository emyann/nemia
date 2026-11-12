/**
 * The readiness read (`GET /api/readiness`, `nemia doctor`): every piece a person's server needs to run its factories, each in place,
 * missing or not activated, and what it costs while missing (`cost`), with the fix that puts it there — a command to type, or a fix the
 * server runs itself (`POST /api/readiness/fixes`), its output followed as it runs (`GET /api/readiness/fixes/:id/output`). The group
 * that serves them is `ReadinessGroup`.
 */
import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api';
import { BadRequest, Conflict, Failed, Forbidden, Invalid, Missing } from './api-errors.ts';
import { NeedAsk } from './workflow.ts';
import {
  ADDRESS_KINDS,
  FIX_KINDS,
  FIX_PHASES,
  FIX_STREAM_EVENTS,
  HARNESS_PARTS,
  READINESS_AREAS,
  READINESS_COSTS,
  READINESS_STATES,
  type ReadinessCost,
} from './words.ts';

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
 * for the `bind` piece, for a harness's piece the harness it is of and which of its two needs (`harness`), so a reader groups a
 * harness's pieces without naming one, and what it costs while it is missing (`cost`, one of `READINESS_COSTS`; a server that declares
 * none is read as `run`).
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
  cost: Schema.optionalKey(Schema.Literals(READINESS_COSTS)),
});
export type ReadinessPiece = typeof ReadinessPiece.Type;

/**
 * `GET /api/readiness`: whether every piece is in place (`ready`: none is `missing`; an `inactive` one is not), the pieces, in the
 * read's order, and whether a run was ever started on this server (`ran`; not known where it is left out).
 */
export const Readiness = Schema.Struct({
  ready: Schema.Boolean,
  pieces: Schema.Array(ReadinessPiece),
  ran: Schema.optionalKey(Schema.Boolean),
});
export type Readiness = typeof Readiness.Type;

/** `n` pieces, as a sentence counts them. */
const counted = (n: number): string => (n === 1 ? 'a piece' : `${n} pieces`);

/** The read's missing pieces. */
const missingOf = (read: Readiness): Readiness['pieces'] => read.pieces.filter((piece) => piece.state === 'missing');

/** A piece's cost, a piece that declares none (an older server's) read as `run`. */
const costOf = (piece: Readiness['pieces'][number]): ReadinessCost => piece.cost ?? 'run';

/**
 * Whether a run waits on the read: a missing piece costs `run`. Only then is the server not ready to run, and the board's banner
 * raised; a missing piece of another cost is advised, listed on Setup and by `nemia doctor` with its fix.
 */
export const runsWait = (read: Readiness): boolean => missingOf(read).some((piece) => costOf(piece) === 'run');

/** What `n` missing pieces of `cost` cost, as a phrase; `firstRun` where no run was ever started on the server. */
const phraseOf = (cost: ReadinessCost, n: number, firstRun: boolean): string => {
  if (cost === 'run') return firstRun ? `${counted(n)} the server needs before a factory's first run` : `${counted(n)} a run waits on`;
  if (cost === 'server') return `${counted(n)} that ${n === 1 ? 'keeps' : 'keep'} the server up or open, which no run waits on`;
  return `${counted(n)} of this client's own, which no run waits on`;
};

/**
 * What the read's missing pieces cost, said after `missing:`, each cost of `READINESS_COSTS` a phrase of its own as its pieces declare
 * it, "before a factory's first run" only where the read says no run was ever started (`ran: false`); none where no piece is missing.
 */
export function missingSaid(read: Readiness): string | undefined {
  const missing = missingOf(read);
  const phrases = READINESS_COSTS.flatMap((cost) => {
    const n = missing.filter((piece) => costOf(piece) === cost).length;
    return n === 0 ? [] : [phraseOf(cost, n, read.ran === false)];
  });
  return phrases.length === 0 ? undefined : phrases.join(', and ');
}

/**
 * The read's last line, as `nemia doctor` says it: `not ready` while a run waits on a missing piece (`runsWait`), else `ready`,
 * with the pieces advised counted; what the missing pieces cost after either (`missingSaid`).
 */
export function readinessSaid(read: Readiness): string {
  const said = missingSaid(read);
  if (said === undefined) return 'ready';
  if (runsWait(read)) return `not ready: missing ${said}`;
  return `ready, ${counted(missingOf(read).length)} advised: missing ${said}`;
}

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
