/**
 * The subscriptions group's handlers (`objects`' `Api`): the feed's subscriptions, which no namespace holds, listed and read as objects
 * through the package's Subscription door (`subscriptionList`, `subscriptionObject`), at the app's `StoreRoot`; and a long-lived task given
 * one and one taken away, by `nemia subscribe`'s and `nemia unsubscribe`'s entries (`SUBSCRIBE`, `UNSUBSCRIBE`), called by type.
 *
 * - `POST /api/subscriptions/:name` — the body `{ task, selectors?, digestEvery?, atLeast? }` (objects' `SubscriptionWrite`), `selectors`
 *   a list as `-l` given many times, `atLeast` the level a run's factory is at least at for its lines to be carried, stored as the
 *   subscription's `scope`: the daemon's deliverer says the feed to the task from the feed's end. A name that names no file is a 400
 *   before anything is read; a task never filed on the store's engine a 404 (`Missing`); one not long-lived, a selector the feed's
 *   grammar refuses, minutes not above zero and an `atLeast` that is no level a 422 (`Invalid`), in the package's words; a name Nemia's
 *   own or a task settled a 409 (`Conflict`). Its 201 is `{ name, subscription }`, as written.
 * - `DELETE /api/subscriptions/:name` — the subscription taken away, its file removed; it reads no body. None by that name is a 404
 *   (`Missing`). Its 200 is `{ name }`.
 */
import { Effect } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';
import { SUBSCRIBE, subscriptionList, subscriptionNameRefusal, subscriptionObject, UNSUBSCRIBE } from 'agent-orchestrator';
import { Api, BadRequest } from 'objects';
import { queryOf } from '../factory/parts/parts.ts';
import { answered, answeredWrite } from '../objects/refused.ts';

/** A subscription's name that names no file of its own, refused before anything is read: a 400 in the package's words. */
const misnamed = (name: string): Effect.Effect<void, BadRequest> => {
  const wrong = subscriptionNameRefusal(name);
  return wrong === undefined ? Effect.void : Effect.fail(new BadRequest({ error: wrong }));
};

export const subscriptionsHandlers = HttpApiBuilder.group(Api, 'subscriptions', (handlers) =>
  handlers
    .handle('listAll', ({ query }) => answered((s) => s.inRequest(subscriptionList(queryOf(query)))))
    .handle('get', ({ params: { name } }) => answered((s) => s.inRequest(subscriptionObject(name))))
    .handle('subscribe', ({ params: { name }, payload }) =>
      Effect.andThen(
        misnamed(name),
        answeredWrite((s) => s.inRequest(SUBSCRIBE.handler({ ...payload, name }))),
      ),
    )
    .handle('unsubscribe', ({ params: { name } }) =>
      Effect.andThen(
        misnamed(name),
        answeredWrite((s) => s.inRequest(UNSUBSCRIBE.handler({ name }))),
      ),
    ),
);
