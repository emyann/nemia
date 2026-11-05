/**
 * What the api answers a refusal with, an object with one key, `error`, the sentence that says what to do next, each at its status; and
 * the query every list of the `Api` takes. Shared by every group (`api.ts`, `run-api.ts`).
 */
import { Schema } from 'effect';
import { WRITE_WAYS } from './words.ts';

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

/** A write the package let through and the disk then refused (a file that is a folder, one read-only): a 500, saying what failed. */
export class Failed extends Schema.Class<Failed>('Failed')({ error: Schema.String }, { httpApiStatus: 500 }) {}

/** A request the api reads and refuses before the package is asked — a body that is no JSON, a name no run can have: a 400. */
export class BadRequest extends Schema.Class<BadRequest>('BadRequest')({ error: Schema.String }, { httpApiStatus: 400 }) {}

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
 */
export const listQuery = {
  limit: Schema.optionalKey(Schema.String),
  continue: Schema.optionalKey(Schema.String),
  labelSelector: LabelQuery,
  selector: LabelQuery,
};
