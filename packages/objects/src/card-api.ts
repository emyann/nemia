/**
 * Group `cards`: the inbox's cards as objects, listed across namespaces or in one (a card's namespace is its factory, `default` for one
 * that names none), read in its namespace and across all by its name (each read of one carrying the card's file as written), filed,
 * written whole, dropped, started, queued and taken off the queue, and their labels edited. Cut from `api.ts`, which adds it to `Api`.
 */
import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup } from 'effect/http-api';
import { Card, CardFile, CardList, CardQueue, CardStart, CardWrite, CardEdit } from './card.ts';
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
  HttpApiEndpoint.get('listAll', '/api/cards', { query: cardListQuery, success: CardListOrTable, error: objectErrors }),
  HttpApiEndpoint.get('list', '/api/namespaces/:namespace/cards', {
    params: namespaceParams,
    query: cardListQuery,
    success: CardListOrTable,
    error: objectErrors,
  }),
  HttpApiEndpoint.get('get', '/api/namespaces/:namespace/cards/:name', { params: cardParams, success: CardObject, error: objectErrors }),
  HttpApiEndpoint.get('getAll', '/api/cards/:name', { params: cardNameParams, success: CardObject, error: objectErrors }),
  HttpApiEndpoint.put('update', '/api/namespaces/:namespace/cards/:name', {
    params: cardParams,
    payload: CardWrite,
    success: CardObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.put('edit', '/api/namespaces/:namespace/cards/:name/source', {
    params: cardParams,
    payload: CardEdit,
    success: CardObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.post('create', '/api/namespaces/:namespace/cards', {
    params: namespaceParams,
    payload: CardFile,
    success: CardObject.pipe(Schema.annotate({ httpApiStatus: 201 })),
    error: objectErrors,
  }),
  HttpApiEndpoint.delete('delete', '/api/namespaces/:namespace/cards/:name', {
    params: cardParams,
    success: CardObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.post('start', '/api/namespaces/:namespace/cards/:name/start', {
    params: cardParams,
    payload: CardStart,
    success: CardStarted.pipe(Schema.annotate({ httpApiStatus: 201 })),
    error: objectErrors,
  }),
  HttpApiEndpoint.post('queue', '/api/namespaces/:namespace/cards/:name/queue', {
    params: cardParams,
    query: CardQueue,
    success: CardObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.post('unqueue', '/api/namespaces/:namespace/cards/:name/unqueue', {
    params: cardParams,
    success: CardObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.post('labels', '/api/namespaces/:namespace/cards/:name/labels', {
    params: cardParams,
    payload: LabelEdit,
    success: Labelled,
    error: objectErrors,
  }),
) {}
