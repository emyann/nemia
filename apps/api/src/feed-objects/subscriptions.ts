/**
 * The subscriptions group's handlers (`objects`' `Api`): the feed's subscriptions, which no namespace holds, listed and read as objects
 * through the package's Subscription door (`subscriptionList`, `subscriptionObject`), at the app's `StoreRoot`. Subscribing and
 * unsubscribing stay the api's own routes (`POST` and `DELETE /api/subscriptions/:name`, commands/routes.ts), whose answers are unchanged.
 */
import { HttpApiBuilder } from 'effect/http-api';
import { subscriptionList, subscriptionObject } from 'agent-orchestrator';
import { Api } from 'objects';
import { queryOf } from '../factory/parts/parts.ts';
import { runPlaced } from '../store.ts';
import { answered } from '../objects/refused.ts';

export const subscriptionsHandlers = HttpApiBuilder.group(Api, 'subscriptions', (handlers) =>
  handlers
    .handle('listAll', ({ query }) => answered((s) => runPlaced(s, s.e, subscriptionList(queryOf(query)))))
    .handle('get', ({ params: { name } }) => answered((s) => runPlaced(s, s.e, subscriptionObject(name)))),
);
