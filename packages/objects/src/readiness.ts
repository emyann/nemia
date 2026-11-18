/**
 * The readiness read (`GET /api/readiness`, `nemia doctor`): every piece a person's server needs to run its factories, each in place,
 * missing or not activated, and what it costs while missing (`cost`), with the fix that puts it there — a command to type, or a fix the
 * server runs itself (`POST /api/readiness/fixes`), its output followed as it runs (`GET /api/readiness/fixes/:id/output`). The group
 * that serves them is `ReadinessGroup`, with a harness's checks (`HarnessCheck`: its version, and one tiny real turn started by the server,
 * `POST /api/readiness/turns`) and the store's milestones (`GET /api/readiness/milestones`).
 */
import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from 'effect/http-api';
import { BadRequest, Conflict, Failed, Forbidden, Invalid, Missing } from './api-errors.ts';
import { describedNumber } from './meta.ts';
import { HarnessCheck, HarnessTurn, TurnStart } from './harness-check.ts';
import { Milestones } from './milestones.ts';
import { ReadinessFix } from './readiness-fix.ts';
import {
  ADDRESS_KINDS,
  FIX_PHASES,
  FIX_STREAM_EVENTS,
  HARNESS_PARTS,
  READINESS_AREAS,
  READINESS_COSTS,
  READINESS_STATES,
  type ReadinessCost,
} from './words.ts';

/**
 * One piece of the read: its name (a need's name for a declared need), its area, its state, a sentence of what it is or why it is not in
 * place, its fixes, the factory and workflow of a workflow's need (the factory alone of a repository's), the kind of the bind's address
 * and, on a store marked exposed, the names it is served at (`servedNames`) for the `bind` piece, for a harness's piece the harness it
 * is of and which of its two needs (`harness`), so a reader groups a harness's pieces without naming one, and what it costs while it is
 * missing (`cost`, one of `READINESS_COSTS`; a server that declares none is read as `run`).
 */
export const ReadinessPiece = Schema.Struct({
  name: Schema.String.annotate({ description: "The piece's name; a need's name for a declared need." }),
  area: Schema.Literals(READINESS_AREAS).annotate({
    description:
      'The area of the readiness read it belongs to: a harness, the service, the bind, the machine, a place, a workflow, a repository, the factories, the release or the client.',
  }),
  state: Schema.Literals(READINESS_STATES).annotate({ description: 'Whether it is in place, missing or not activated.' }),
  message: Schema.String.annotate({ description: 'A sentence of what it is or why it is not in place.' }),
  fixes: Schema.Array(ReadinessFix).annotate({ description: 'The ways to put it in place.' }),
  factory: Schema.optionalKey(
    Schema.String.annotate({ description: "The factory of a workflow's need, or the factory alone of a repository's; absent otherwise." }),
  ),
  workflow: Schema.optionalKey(Schema.String.annotate({ description: "The workflow of a workflow's need; absent otherwise." })),
  addressKind: Schema.optionalKey(
    Schema.Literals(ADDRESS_KINDS).annotate({ description: "The kind of the bind's address, for the bind piece." }),
  ),
  servedNames: Schema.optionalKey(
    Schema.Array(Schema.String).annotate({
      description:
        'For the bind piece of a store marked exposed, the names besides the loopback a write with no token, a pairing among them, is taken at: the address it binds and the names declared in WF_SERVED_NAMES.',
    }),
  ),
  harness: Schema.optionalKey(
    Schema.Struct({
      name: Schema.String.annotate({ description: 'The harness the piece is of.' }),
      part: Schema.Literals(HARNESS_PARTS).annotate({ description: "Which of the harness's two needs the piece is." }),
    }).annotate({
      description:
        "For a harness's piece, the harness it is of and which of its two needs, so a reader groups a harness's pieces; absent otherwise.",
    }),
  ),
  cost: Schema.optionalKey(
    Schema.Literals(READINESS_COSTS).annotate({
      description: 'What it costs while it is missing; a server that declares none is read as run.',
    }),
  ),
  checks: Schema.optionalKey(
    Schema.Array(HarnessCheck).annotate({
      description:
        "For a harness's install piece in place, its two checks: the version its program answers against the pin, and its last check turn.",
    }),
  ),
});
export type ReadinessPiece = typeof ReadinessPiece.Type;

/**
 * `GET /api/readiness`: whether every piece is in place (`ready`: none is `missing`; an `inactive` one is not), the pieces, in the
 * read's order, and whether a run was ever started on this server (`ran`; not known where it is left out).
 */
export const Readiness = Schema.Struct({
  ready: Schema.Boolean.annotate({ description: 'Whether every piece is in place: none is missing; an inactive one is not.' }),
  pieces: Schema.Array(ReadinessPiece).annotate({ description: "The pieces, in the read's order." }),
  ran: Schema.optionalKey(
    Schema.Boolean.annotate({ description: 'Whether a run was ever started on this server; absent where it is not known.' }),
  ),
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
 * @param read The server's readiness, as read.
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
 * @param read The server's readiness, as read.
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
 * @param read The server's readiness, as read.
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
  need: Schema.String.annotate({ description: 'The need whose fix to start.' }),
  factory: Schema.optionalKey(
    Schema.String.annotate({
      description: "The factory of a workflow's need, or the factory alone of a repository's need; absent for a place's or a harness's.",
    }),
  ),
  workflow: Schema.optionalKey(Schema.String.annotate({ description: "The workflow of a workflow's need." })),
  index: Schema.optionalKey(describedNumber('Which of its fixes to start; the first where left out.')),
  answers: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.String).annotate({ description: 'The answers its asks were given, by their names.' }),
  ),
});
export type FixStart = typeof FixStart.Type;

/**
 * A fix started: its id, the need, factory and workflow it fixes, its phase, the tail of what it printed, the pattern of the code its
 * output shows (the declared `code`), and its exit code once it ended.
 */
export const Fix = Schema.Struct({
  id: Schema.String.annotate({ description: "The fix's id." }),
  need: Schema.String.annotate({ description: 'The need it fixes.' }),
  factory: Schema.optionalKey(Schema.String.annotate({ description: 'The factory it fixes the need of; absent where the need has none.' })),
  workflow: Schema.optionalKey(
    Schema.String.annotate({ description: 'The workflow it fixes the need of; absent where the need has none.' }),
  ),
  phase: Schema.Literals(FIX_PHASES).annotate({
    description:
      'Where the fix stands, as the task that runs it says: pending until it starts, running, then succeeded on exit 0 or failed.',
  }),
  output: Schema.String.annotate({ description: 'The tail of what it printed.' }),
  code: Schema.optionalKey(Schema.String.annotate({ description: 'The pattern of the code its output shows, as declared.' })),
  exitCode: Schema.optionalKey(describedNumber('Its exit code once it ended; absent while it runs.')),
});
export type Fix = typeof Fix.Type;

/** One event of a fix's output stream: a chunk of what it printed (`output`), or its end (`ended`, its data the `Fix` as JSON). */
export const FixStreamEvent = Schema.Struct({
  event: Schema.Literals(FIX_STREAM_EVENTS).annotate({ description: 'What the event is: a chunk of output, or the end of the fix.' }),
  data: Schema.String.annotate({ description: 'A chunk of what the fix printed, or, at its end, the Fix as JSON.' }),
});
export type FixStreamEvent = typeof FixStreamEvent.Type;

/** A fix's id in a path. */
const fixParams = { id: Schema.String.annotate({ description: "The fix's id." }) };

/** A check turn's id in a path. */
const turnParams = { id: Schema.String.annotate({ description: "The check turn's id." }) };

/** The readiness read and its fixes. */
export class ReadinessGroup extends HttpApiGroup.make('readiness').add(
  HttpApiEndpoint.get('read', '/api/readiness', { success: Readiness, error: [Invalid, Failed] }).annotate(
    OpenApi.Description,
    'Reads every piece the server needs to run its factories, each in place, missing or not activated, what it costs while missing, and the fix that puts it there. Answers Readiness.',
  ),
  HttpApiEndpoint.post('fix', '/api/readiness/fixes', {
    payload: FixStart,
    success: Fix,
    error: [BadRequest, Invalid, Missing, Conflict, Forbidden, Failed],
  }).annotate(
    OpenApi.Description,
    "Starts one of a missing piece's fixes on the server, with the answers its asks were given. Answers the Fix started: its id, what it fixes and its phase.",
  ),
  HttpApiEndpoint.get('fixOf', '/api/readiness/fixes/:id', { params: fixParams, success: Fix, error: [Missing, Failed] }).annotate(
    OpenApi.Description,
    'Reads a fix the server runs, by its id: its phase, the tail of what it printed, and its exit code once it ended. Answers the Fix.',
  ),
  HttpApiEndpoint.get('fixOutput', '/api/readiness/fixes/:id/output', {
    params: fixParams,
    success: HttpApiSchema.StreamSse({ events: FixStreamEvent }),
    error: [Missing],
  }).annotate(
    OpenApi.Description,
    "Follows a fix's output as server-sent events while it runs, until it ends. Answers a stream of FixStreamEvent.",
  ),
  HttpApiEndpoint.post('turn', '/api/readiness/turns', {
    payload: TurnStart,
    success: HarnessTurn,
    error: [BadRequest, Invalid, Missing, Forbidden, Failed],
  }).annotate(
    OpenApi.Description,
    'Starts one tiny real turn through an installed, signed-in harness, bounded in time and spend, or answers the one of it still running. Answers the HarnessTurn, its check running.',
  ),
  HttpApiEndpoint.get('turnOf', '/api/readiness/turns/:id', {
    params: turnParams,
    success: HarnessTurn,
    error: [Missing, Failed],
  }).annotate(
    OpenApi.Description,
    "Reads a check turn by its id: running until it settles, then passed on the harness's answer with what it cost, or failed saying why. Answers the HarnessTurn.",
  ),
  HttpApiEndpoint.get('milestones', '/api/readiness/milestones', { success: Milestones, error: [Invalid, Failed] }).annotate(
    OpenApi.Description,
    'Reads where the store stands on the way to its first landed change: a harness, a factory, a volume and a run landed, each done by what the store holds now. Answers Milestones.',
  ),
) {}
