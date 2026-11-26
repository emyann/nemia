/**
 * What the api answers a refusal with, an object with one key, `error`, the sentence that says what to do next, each at its status; the
 * lists of refusals an object's verbs and a definition's answer with; and the query every list of the `Api` takes. Shared by every group
 * (`api.ts`, `run-api.ts`, `card-api.ts`, …).
 */
import { Schema } from 'effect';
import {
  CONDITION_WRITE_REFUSALS,
  FLOOR_REFUSALS,
  GUARD_REFUSALS,
  PROPOSAL_REFUSALS,
  TOKEN_REFUSALS,
  WRITE_WAYS,
  type FloorRefusalWord,
  type ProposalRefusal,
} from './words.ts';

/** The floor's refusals a proposal's do not already say (`other-factory` is both's, said once). */
const FLOOR_ONLY = FLOOR_REFUSALS.filter(
  (r): r is Exclude<FloorRefusalWord, ProposalRefusal> => !(PROPOSAL_REFUSALS as readonly string[]).includes(r),
);

/** The condition write's refusals that are a 403: a step's own session writing for its step (`own-step`). */
const CONDITION_FORBIDDEN = CONDITION_WRITE_REFUSALS.filter((r) => r === 'own-step');

/** The sentence every refusal carries under `error`. */
const ErrorSentence = Schema.String.annotate({
  description: 'What was refused and what to do next: the command to type or the field to set.',
});

/** Nothing by that name, or not in that namespace: a 404. */
export class Missing extends Schema.Class<Missing>('Missing')({ error: ErrorSentence }, { httpApiStatus: 404 }) {}

/** The thing is held by something else, named in `users` where the package names them: a 409. */
export class Conflict extends Schema.Class<Conflict>('Conflict')(
  {
    error: ErrorSentence,
    users: Schema.optionalKey(
      Schema.Array(Schema.String).annotate({ description: 'What holds the thing, by name; absent where the package does not name them.' }),
    ),
  },
  { httpApiStatus: 409 },
) {}

/**
 * A request the package refuses as it is said — a label query, a limit, a token, a name: a 422. A write of a definition refused where it
 * is sent carries `way`, how the definition changes instead (`WRITE_WAYS`); a workflow's write refused for some of its steps names them
 * (`steps`), for the builder to mark.
 */
export class Invalid extends Schema.Class<Invalid>('Invalid')(
  {
    error: ErrorSentence,
    way: Schema.optionalKey(
      Schema.Literals(WRITE_WAYS).annotate({
        description: 'How the definition changes instead, for a write of a definition refused where it was sent; absent otherwise.',
      }),
    ),
    steps: Schema.optionalKey(
      Schema.Array(Schema.String).annotate({
        description: "The steps a workflow's write was refused for, by name, for the builder to mark; absent otherwise.",
      }),
    ),
  },
  { httpApiStatus: 422 },
) {}

/**
 * A caller the api knows, refused what it asks: an approval its standing does not reach, a proposal in another factory, a write only the
 * person makes — a 403, with its reason (`PROPOSAL_REFUSALS`); or a write the api's guard refuses before its body is read, addressed to
 * another host or made by a page on another site (`GUARD_REFUSALS`); or what an agent's standing token asks past its floor
 * (`FLOOR_REFUSALS`).
 */
export class Forbidden extends Schema.Class<Forbidden>('Forbidden')(
  {
    error: ErrorSentence,
    reason: Schema.optionalKey(
      Schema.Literals([...PROPOSAL_REFUSALS, ...GUARD_REFUSALS, ...FLOOR_ONLY, ...CONDITION_FORBIDDEN]).annotate({
        description:
          "Why, as a code: a proposal's refusal, the api's guard refusing a write from another host or site, a standing token asking past its floor, or a step's own session writing a condition its step waits on.",
      }),
    ),
  },
  { httpApiStatus: 403 },
) {}

/** A session token the api refuses — never minted, or its session's try no longer live: a 401, with its reason (`TOKEN_REFUSALS`). */
export class Unauthorized extends Schema.Class<Unauthorized>('Unauthorized')(
  {
    error: ErrorSentence,
    reason: Schema.optionalKey(
      Schema.Literals(TOKEN_REFUSALS).annotate({
        description: "Why the session token was refused, as a code: never minted, or its session's try no longer live.",
      }),
    ),
    exposed: Schema.optionalKey(
      Schema.Boolean.annotate({
        description:
          'Whether the store is marked exposed, reached beyond this machine (WF_EXPOSED); false where it is served on this machine alone, where nemia open signs a browser in.',
      }),
    ),
  },
  { httpApiStatus: 401 },
) {}

/** A write the package let through and the disk then refused (a file that is a folder, one read-only): a 500, saying what failed. */
export class Failed extends Schema.Class<Failed>('Failed')({ error: ErrorSentence }, { httpApiStatus: 500 }) {}

/**
 * A request the api reads and refuses before the package is asked — a body that is no JSON, a name no run can have, a key its endpoint's
 * Schema does not decode: a 400, with the key refused (`field`, as `payload.spec.steps` or `query.limit`) where a decode refused one.
 */
export class BadRequest extends Schema.Class<BadRequest>('BadRequest')(
  {
    error: ErrorSentence,
    field: Schema.optionalKey(
      Schema.String.annotate({ description: 'The key a decode refused, as payload.spec.steps or query.limit; absent where none was.' }),
    ),
  },
  { httpApiStatus: 400 },
) {}

/** A write whose body is not sent as `application/json`, which any page can send without the browser asking first: a 415. */
export class UnsupportedMediaType extends Schema.Class<UnsupportedMediaType>('UnsupportedMediaType')(
  { error: ErrorSentence },
  { httpApiStatus: 415 },
) {}

/**
 * A run's action the package began and something under it then failed — the engine, git, a harness that did not take the words: a 502,
 * naming the command that asks the same way, since asking again may work.
 */
export class WriteFailed extends Schema.Class<WriteFailed>('WriteFailed')({ error: ErrorSentence }, { httpApiStatus: 502 }) {}

/** A run one of whose tasks does not read, so it is not judged: a 502, in the words the list says it with. */
export class Unjudged extends Schema.Class<Unjudged>('Unjudged')({ error: ErrorSentence }, { httpApiStatus: 502 }) {}

/**
 * A read of the package's the api made and that failed under it — a step's session output, its task's journal, its conversation, which
 * the engine or a harness could not read: a 502, naming the command that reads the same thing from the command line.
 */
export class ReadFailed extends Schema.Class<ReadFailed>('ReadFailed')({ error: ErrorSentence }, { httpApiStatus: 502 }) {}

/** A body past the most its endpoint takes — a file past its cap — naming the cap and what to send instead: a 413. */
export class TooLarge extends Schema.Class<TooLarge>('TooLarge')({ error: ErrorSentence }, { httpApiStatus: 413 }) {}

/**
 * A thing that was there and was removed on purpose, its record kept — a step's file `nemia prune --artifacts` removed: a 410, with when
 * it was removed (`pruned`), so a client tells it from one that never was (a 404).
 */
export class Gone extends Schema.Class<Gone>('Gone')(
  {
    error: ErrorSentence,
    pruned: Schema.String.annotate({ description: 'When it was removed (nemia prune --artifacts), as an ISO 8601 time.' }),
  },
  { httpApiStatus: 410 },
) {}

/**
 * One label query, or several given again, OR'd.
 *
 * @param description What the key it is the value of selects.
 */
const labelQuery = (description: string) =>
  Schema.optionalKey(Schema.Union([Schema.String, Schema.Array(Schema.String)]).annotate({ description }));

/**
 * The query of a list: `limit` (a whole number from 1), `continue` (the token the page before answered), `labelSelector`, and `selector`,
 * its retired spelling, read the same. Each kept as the text it was sent as, so a wrong one is refused in the package's words, a 422.
 * And `watch`: `watch=true` asks for the list as a stream of watch events (`watchEventOf`), which the api answers before this
 * definition is reached, so a list's answer here is always a page. And `resourceVersion`, beside `watch=true`: a watch of a list of the
 * feed's lines (the Event lists) starts at that byte of the feed, the `resourceVersion` of the last event or BOOKMARK a reader was sent
 * or of a page's `metadata`, and is sent no state; a watch of any other list refuses one, since nothing keeps its old versions.
 */
export const listQuery = {
  limit: Schema.optionalKey(Schema.String.annotate({ description: 'The most items a page holds, a whole number from 1.' })),
  continue: Schema.optionalKey(
    Schema.String.annotate({ description: 'The token the page before answered, to read the page after it; absent, the first page.' }),
  ),
  labelSelector: labelQuery(
    'A label query, or several given again, that keeps the objects whose labels match any of them; absent, every object.',
  ),
  selector: labelQuery('The retired spelling of labelSelector, read the same.'),
  watch: Schema.optionalKey(
    Schema.String.annotate({ description: 'true asks for the list as a stream of watch events instead of a page.' }),
  ),
  resourceVersion: Schema.optionalKey(
    Schema.String.annotate({
      description:
        "With watch=true on a list of events, the resourceVersion of the last event or bookmark a reader was sent, or of a page's metadata, to resume the stream from; a watch of any other list refuses one.",
    }),
  ),
};

/**
 * What every verb of an object's group refuses with: a request its reader refuses before the package is asked (400), nothing by that
 * name (404), a thing held by something else (409) and a request the package refuses as it is said (422).
 */
export const objectErrors = [BadRequest, Missing, Conflict, Invalid];

/** What a definition's verbs refuse with: an object's refusals, and a write the disk failed. */
export const definitionErrors = [...objectErrors, Failed];
