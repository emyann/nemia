/**
 * The inbox's cards as objects (`CardsGroup`, one group of the `Api`, `api.ts`): listed across namespaces or in one, read, filed, written
 * whole, dropped, started, queued and taken off the queue, and their labels edited.
 */
import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup } from 'effect/http-api';
import { Card, CardFile, CardList, CardQueue, CardStart, CardWrite, CardEdit } from './card.ts';
import { Table } from './table.ts';
import { LabelEdit, Labelled } from './labels.ts';
import { cardParams, cardNameParams, namespaceParams, cardListQuery } from './api-params.ts';
import { CardStarted } from './run-actions.ts';
import { cardErrors } from './api-errors.ts';

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
  HttpApiEndpoint.get('listAll', '/api/cards', { query: cardListQuery, success: CardListOrTable, error: cardErrors }),
  HttpApiEndpoint.get('list', '/api/namespaces/:namespace/cards', {
    params: namespaceParams,
    query: cardListQuery,
    success: CardListOrTable,
    error: cardErrors,
  }),
  HttpApiEndpoint.get('get', '/api/namespaces/:namespace/cards/:name', { params: cardParams, success: CardObject, error: cardErrors }),
  HttpApiEndpoint.get('getAll', '/api/cards/:name', { params: cardNameParams, success: CardObject, error: cardErrors }),
  HttpApiEndpoint.put('update', '/api/namespaces/:namespace/cards/:name', {
    params: cardParams,
    payload: CardWrite,
    success: CardObject,
    error: cardErrors,
  }),
  HttpApiEndpoint.put('edit', '/api/namespaces/:namespace/cards/:name/source', {
    params: cardParams,
    payload: CardEdit,
    success: CardObject,
    error: cardErrors,
  }),
  HttpApiEndpoint.post('create', '/api/namespaces/:namespace/cards', {
    params: namespaceParams,
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
    success: CardStarted.pipe(Schema.annotate({ httpApiStatus: 201 })),
    error: cardErrors,
  }),
  HttpApiEndpoint.post('queue', '/api/namespaces/:namespace/cards/:name/queue', {
    params: cardParams,
    query: CardQueue,
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
