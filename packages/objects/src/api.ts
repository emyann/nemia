/**
 * The one definition of what the api serves of the objects (`Api`): the handlers the api builds from it, the clients that read through
 * it and the OpenAPI document it writes (`OpenApi.fromApi(Api)`) are all made from this, so no layer keeps a shape of its own.
 *
 * Group `runs`: the run object and its four sub-resources, at the paths the api has always answered them on. Group `cards`: the inbox's
 * cards as objects, listed across namespaces or in one (a card's namespace is its factory, `default` for one that names none), read,
 * filed, dropped, started, queued and taken off the queue, and their labels edited. Every refusal is an object with one key, `error`, the
 * sentence that says what to do next, as the api's other routes answer one; a Conflict carries the `users` that hold the thing too.
 */
import { Schema } from 'effect';
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from 'effect/http-api';
import { Card, CardFile, CardList, CardStart } from './card.ts';
import { LabelEdit, Labelled, Run, StepTold, StepTries, StepTry, TryCloseout } from './run.ts';

/** The kinds the api serves as objects, each with its object Schema, its `<Kind>List` and its get endpoint here. */
export const KINDS = ['Run', 'Card'] as const;
export type Kind = (typeof KINDS)[number];

/** Nothing by that name, or not in that namespace: a 404. */
export class Missing extends Schema.Class<Missing>('Missing')({ error: Schema.String }, { httpApiStatus: 404 }) {}

/** The thing is held by something else, named in `users` where the package names them: a 409. */
export class Conflict extends Schema.Class<Conflict>('Conflict')(
  { error: Schema.String, users: Schema.optionalKey(Schema.Array(Schema.String)) },
  { httpApiStatus: 409 },
) {}

/** A request the package refuses as it is said — a label query, a limit, a token, a name: a 422. */
export class Invalid extends Schema.Class<Invalid>('Invalid')({ error: Schema.String }, { httpApiStatus: 422 }) {}

/** A run one of whose tasks does not read, so it is not judged: a 502, in the words the list says it with. */
export class Unjudged extends Schema.Class<Unjudged>('Unjudged')({ error: Schema.String }, { httpApiStatus: 502 }) {}

/** The Card and a page of them, named so that the document holds each as a component, as it holds the Run. */
const CardObject = Card.annotate({ identifier: 'Card' });
const CardListObject = CardList.annotate({ identifier: 'CardList' });

/** A run's step, named in the path. */
const stepParams = { runId: Schema.String, step: Schema.String };

/** A step's try, by its number as the path says it. */
const tryParams = { ...stepParams, try: Schema.String };

/** One label query, or several given again, OR'd. */
const LabelQuery = Schema.optionalKey(Schema.Union([Schema.String, Schema.Array(Schema.String)]));

/**
 * The query of a list: `limit` (a whole number from 1), `continue` (the token the page before answered), `labelSelector`, and `selector`,
 * its retired spelling, read the same. Each kept as the text it was sent as, so a wrong one is refused in the package's words, a 422.
 */
const listQuery = {
  limit: Schema.optionalKey(Schema.String),
  continue: Schema.optionalKey(Schema.String),
  labelSelector: LabelQuery,
  selector: LabelQuery,
};

/** A card by its namespace and its name. */
const cardParams = { namespace: Schema.String, name: Schema.String };

/** The run object and its sub-resources. */
export class RunsGroup extends HttpApiGroup.make('runs').add(
  HttpApiEndpoint.get('show', '/api/runs/:runId', { params: { runId: Schema.String }, success: Run, error: [Missing, Invalid, Unjudged] }),
  HttpApiEndpoint.get('tries', '/api/runs/:runId/steps/:step/tries', {
    params: stepParams,
    success: StepTries,
    error: [Missing, Invalid, Unjudged],
  }),
  HttpApiEndpoint.get('try', '/api/runs/:runId/steps/:step/tries/:try', {
    params: tryParams,
    success: StepTry,
    error: [Missing, Invalid, Unjudged],
  }),
  HttpApiEndpoint.get('closeout', '/api/runs/:runId/steps/:step/tries/:try/closeout', {
    params: tryParams,
    success: TryCloseout,
    error: [Missing, Invalid, Unjudged],
  }),
  HttpApiEndpoint.get('told', '/api/runs/:runId/steps/:step/told', {
    params: stepParams,
    success: StepTold,
    error: [Missing, Invalid, Unjudged],
  }),
) {}

/** What a card's verbs refuse with. */
const cardErrors = [Missing, Conflict, Invalid];

/** The inbox's cards as objects. */
export class CardsGroup extends HttpApiGroup.make('cards').add(
  HttpApiEndpoint.get('listAll', '/api/cards', { query: listQuery, success: CardListObject, error: cardErrors }),
  HttpApiEndpoint.get('list', '/api/namespaces/:namespace/cards', {
    params: { namespace: Schema.String },
    query: listQuery,
    success: CardListObject,
    error: cardErrors,
  }),
  HttpApiEndpoint.get('get', '/api/namespaces/:namespace/cards/:name', { params: cardParams, success: CardObject, error: cardErrors }),
  HttpApiEndpoint.post('create', '/api/namespaces/:namespace/cards', {
    params: { namespace: Schema.String },
    payload: CardFile,
    success: CardObject.pipe(Schema.annotate({ httpApiStatus: 201 })),
    error: cardErrors,
  }),
  HttpApiEndpoint.delete('delete', '/api/namespaces/:namespace/cards/:name', {
    params: cardParams,
    success: CardObject,
    error: cardErrors,
  }),
  HttpApiEndpoint.post('start', '/api/namespaces/:namespace/cards/:name/start', {
    params: cardParams,
    payload: CardStart,
    success: Schema.Struct({ id: Schema.String, card: Schema.String }).pipe(Schema.annotate({ httpApiStatus: 201 })),
    error: cardErrors,
  }),
  HttpApiEndpoint.post('queue', '/api/namespaces/:namespace/cards/:name/queue', {
    params: cardParams,
    success: CardObject,
    error: cardErrors,
  }),
  HttpApiEndpoint.post('unqueue', '/api/namespaces/:namespace/cards/:name/unqueue', {
    params: cardParams,
    success: CardObject,
    error: cardErrors,
  }),
  HttpApiEndpoint.post('labels', '/api/namespaces/:namespace/cards/:name/labels', {
    params: cardParams,
    payload: LabelEdit,
    success: Labelled,
    error: cardErrors,
  }),
) {}

/** Everything the api serves as objects. */
export const Api = HttpApi.make('nemia').add(RunsGroup).add(CardsGroup);
