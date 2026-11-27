/**
 * Group `cards`: the inbox's cards as objects, listed across namespaces or in one (a card's namespace is its factory, `default` for one
 * that names none), read in its namespace and across all by its name (each read of one carrying the card's file as written), filed,
 * written whole, dropped, started, queued and taken off the queue, sent on once started, and their labels edited. Cut from `api.ts`,
 * which adds it to `Api`.
 */
import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from 'effect/http-api';
import { Card, CardAttach, CardFile, CardList, CardQueue, CardResend, CardResent, CardStart, CardWrite, CardEdit } from './card.ts';
import { Table } from './table.ts';
import { LabelEdit, Labelled } from './labels.ts';
import { cardParams, cardNameParams, namespaceParams, cardListQuery } from './api-params.ts';
import { CardStarted } from './run-actions.ts';
import { objectErrors } from './api-errors.ts';

/** The Card and a page of them, named so that the document holds each as a component, as it holds the Run. */
const CardObject = Card.annotate({ identifier: 'Card' });
const CardListObject = CardList.annotate({ identifier: 'CardList' });
/**
 * A page of cards, or the same page as a `Table` where the request's `Accept` asks for one (`TABLE_ACCEPT`): two answers of one status,
 * each its own success, so each is read off the endpoint by its kind.
 */
const CardListOrTable = [CardListObject, Table] as const;

/** The inbox's cards as objects. */
export class CardsGroup extends HttpApiGroup.make('cards').add(
  HttpApiEndpoint.get('listAll', '/api/cards', { query: cardListQuery, success: CardListOrTable, error: objectErrors }).annotate(
    OpenApi.Description,
    "Lists the inbox's cards of every namespace, a page at a time; ?labelSelector= keeps those whose labels match, ?fieldSelector= those in a phase, in play or chained, ?orderBy= sorts them and ?search= keeps those whose title or name hold its words. Its metadata counts the cards per phase and lists the labels in use, counted before the fieldSelector and the page. Answers a CardList, or the same page as a Table where the request asks for one.",
  ),
  HttpApiEndpoint.get('list', '/api/namespaces/:namespace/cards', {
    params: namespaceParams,
    query: cardListQuery,
    success: CardListOrTable,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Lists the inbox's cards of one namespace (a factory, default for cards that name none), a page at a time; ?labelSelector=, ?fieldSelector= and ?search= keep those that match, ?orderBy= sorts them, and its metadata counts the cards per phase and lists the labels in use, counted before the fieldSelector and the page. Answers a CardList, or the same page as a Table where the request asks for one.",
  ),
  HttpApiEndpoint.get('get', '/api/namespaces/:namespace/cards/:name', {
    params: cardParams,
    success: CardObject,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    'Reads one card by its name in its namespace, with its file as written. Answers the Card; a card in another namespace is Missing.',
  ),
  HttpApiEndpoint.get('getAll', '/api/cards/:name', { params: cardNameParams, success: CardObject, error: objectErrors }).annotate(
    OpenApi.Description,
    'Reads one card by its name in any namespace, with its file as written. Answers the Card.',
  ),
  HttpApiEndpoint.put('update', '/api/namespaces/:namespace/cards/:name', {
    params: cardParams,
    payload: CardWrite,
    success: CardObject,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    'Writes a card whole from the CardWrite body, its name kept, and reads it again. Answers the Card as it is now.',
  ),
  HttpApiEndpoint.put('edit', '/api/namespaces/:namespace/cards/:name/source', {
    params: cardParams,
    payload: CardEdit,
    success: CardObject,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Writes a card from its file's text, frontmatter and body, refused where the card changed since the resourceVersion given, and reads it again. Answers the Card as it is now.",
  ),
  HttpApiEndpoint.post('create', '/api/namespaces/:namespace/cards', {
    params: namespaceParams,
    payload: CardFile,
    success: CardObject.pipe(Schema.annotate({ httpApiStatus: 201 })),
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Files a new card in the inbox, in the namespace's factory (none, in default), from the CardFile body. Answers the Card filed with a 201, naming any label it left out.",
  ),
  HttpApiEndpoint.delete('delete', '/api/namespaces/:namespace/cards/:name', {
    params: cardParams,
    success: CardObject,
    error: objectErrors,
  }).annotate(OpenApi.Description, 'Drops a card from the inbox. Answers the Card as it was before it was dropped.'),
  HttpApiEndpoint.post('start', '/api/namespaces/:namespace/cards/:name/start', {
    params: cardParams,
    payload: CardStart,
    success: CardStarted.pipe(Schema.annotate({ httpApiStatus: 201 })),
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Starts a run of the card in the namespace's factory, on the workflow the body or the card names; in default, on the factory ?factory= names. Answers CardStarted with a 201, the run's address in Location.",
  ),
  HttpApiEndpoint.post('queue', '/api/namespaces/:namespace/cards/:name/queue', {
    params: cardParams,
    query: CardQueue,
    success: CardObject,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    'Queues a card to start when there is room, on the workflow ?workflow= names or else its own. Answers the Card, with how many are queued and the repository it starts on.',
  ),
  HttpApiEndpoint.post('unqueue', '/api/namespaces/:namespace/cards/:name/unqueue', {
    params: cardParams,
    success: CardObject,
    error: objectErrors,
  }).annotate(OpenApi.Description, 'Takes a card off the queue. Answers the Card as it is now.'),
  HttpApiEndpoint.post('resend', '/api/namespaces/:namespace/cards/:name/resend', {
    params: cardParams,
    payload: CardResend,
    success: CardResent.pipe(Schema.annotate({ httpApiStatus: 201 })),
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Sends a started card on: files it again as a card of its own, <run>-resent, handed the runs it was started as, queued on the workflow the body names or, naming none, left for its factory's card triggers; then cancels the run it came from when that run waits on a person. Answers CardResent with a 201; a card never started, sent on already, or whose run is still at work is refused.",
  ),
  HttpApiEndpoint.post('labels', '/api/namespaces/:namespace/cards/:name/labels', {
    params: cardParams,
    payload: LabelEdit,
    success: Labelled,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Edits a card's labels: sets and removes the keys the LabelEdit body names. Answers Labelled, the labels the card holds after it.",
  ),
  HttpApiEndpoint.post('attach', '/api/namespaces/:namespace/cards/:name/files', {
    params: cardParams,
    payload: CardAttach,
    success: CardObject,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Attaches files to a card no run was started from, each a File uploaded to the card's namespace first, by its id, under the name the body gives or the File's own. Answers the Card as it is now; a started card is a Conflict.",
  ),
  HttpApiEndpoint.delete('detach', '/api/namespaces/:namespace/cards/:name/files/:file', {
    params: { ...cardParams, file: Schema.String.annotate({ description: "The file's name in the card." }) },
    success: CardObject,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    'Takes a file off a card no run was started from, by its name in the card. Answers the Card as it is now; a started card is a Conflict.',
  ),
) {}
