/**
 * What the api answers a refusal with, an object with one key, `error`, the sentence that says what to do next, each at its status; and
 * the query every list of the `Api` takes. Shared by every group (`api.ts`, `run-api.ts`).
 */
import { Schema } from 'effect';
import { GUARD_REFUSALS, PROPOSAL_REFUSALS, TOKEN_REFUSALS, WRITE_WAYS } from './words.ts';

/** Nothing by that name, or not in that namespace: a 404. */
export class Missing extends Schema.Class<Missing>('Missing')({ error: Schema.String }, { httpApiStatus: 404 }) {}

/** The thing is held by something else, named in `users` where the package names them: a 409. */
export class Conflict extends Schema.Class<Conflict>('Conflict')(
  { error: Schema.String, users: Schema.optionalKey(Schema.Array(Schema.String)) },
  { httpApiStatus: 409 },
) {}

/**
 * A request the package refuses as it is said — a label query, a limit, a token, a name: a 422. A write of a definition refused where it
 * is sent carries `way`, how the definition changes instead (`WRITE_WAYS`); a workflow's write refused for some of its steps names them
 * (`steps`), for the builder to mark.
 */
export class Invalid extends Schema.Class<Invalid>('Invalid')(
  { error: Schema.String, way: Schema.optionalKey(Schema.Literals(WRITE_WAYS)), steps: Schema.optionalKey(Schema.Array(Schema.String)) },
  { httpApiStatus: 422 },
) {}

/**
 * A caller the api knows, refused what it asks: an approval its standing does not reach, a proposal in another factory, a write only the
 * person makes — a 403, with its reason (`PROPOSAL_REFUSALS`); or a write the api's guard refuses before its body is read, addressed to
 * another host or made by a page on another site (`GUARD_REFUSALS`).
 */
export class Forbidden extends Schema.Class<Forbidden>('Forbidden')(
  { error: Schema.String, reason: Schema.optionalKey(Schema.Literals([...PROPOSAL_REFUSALS, ...GUARD_REFUSALS])) },
  { httpApiStatus: 403 },
) {}

/** A session token the api refuses — never minted, or its session's try no longer live: a 401, with its reason (`TOKEN_REFUSALS`). */
export class Unauthorized extends Schema.Class<Unauthorized>('Unauthorized')(
  { error: Schema.String, reason: Schema.optionalKey(Schema.Literals(TOKEN_REFUSALS)) },
  { httpApiStatus: 401 },
) {}

/** A write the package let through and the disk then refused (a file that is a folder, one read-only): a 500, saying what failed. */
export class Failed extends Schema.Class<Failed>('Failed')({ error: Schema.String }, { httpApiStatus: 500 }) {}

/**
 * A request the api reads and refuses before the package is asked — a body that is no JSON, a name no run can have, a key its endpoint's
 * Schema does not decode: a 400, with the key refused (`field`, as `payload.spec.steps` or `query.limit`) where a decode refused one.
 */
export class BadRequest extends Schema.Class<BadRequest>('BadRequest')(
  { error: Schema.String, field: Schema.optionalKey(Schema.String) },
  { httpApiStatus: 400 },
) {}

/** A write whose body is not sent as `application/json`, which any page can send without the browser asking first: a 415. */
export class UnsupportedMediaType extends Schema.Class<UnsupportedMediaType>('UnsupportedMediaType')(
  { error: Schema.String },
  { httpApiStatus: 415 },
) {}

/**
 * A run's action the package began and something under it then failed — the engine, git, a harness that did not take the words: a 502,
 * naming the command that asks the same way, since asking again may work.
 */
export class WriteFailed extends Schema.Class<WriteFailed>('WriteFailed')({ error: Schema.String }, { httpApiStatus: 502 }) {}

/** A run one of whose tasks does not read, so it is not judged: a 502, in the words the list says it with. */
export class Unjudged extends Schema.Class<Unjudged>('Unjudged')({ error: Schema.String }, { httpApiStatus: 502 }) {}

/** One label query, or several given again, OR'd. */
const LabelQuery = Schema.optionalKey(Schema.Union([Schema.String, Schema.Array(Schema.String)]));

/**
 * The query of a list: `limit` (a whole number from 1), `continue` (the token the page before answered), `labelSelector`, and `selector`,
 * its retired spelling, read the same. Each kept as the text it was sent as, so a wrong one is refused in the package's words, a 422.
 * And `watch`: `watch=true` asks for the list as a stream of watch events (`watchEventOf`), which the api answers before this
 * definition is reached, so a list's answer here is always a page.
 */
export const listQuery = {
  limit: Schema.optionalKey(Schema.String),
  continue: Schema.optionalKey(Schema.String),
  labelSelector: LabelQuery,
  selector: LabelQuery,
  watch: Schema.optionalKey(Schema.String),
};
