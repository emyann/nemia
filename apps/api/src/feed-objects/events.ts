/**
 * The events group's handlers (`objects`' `Api`): the feed's lines as Events, every one (`/api/events`) or a namespace's, those of the
 * factory each names (`/api/namespaces/<ns>/events`), and one by its name, the byte its line starts at — a daemon's or the store's that
 * names no factory read at `/api/events/<name>` alone. Read through the package's Feed door (`eventList`, `eventObject`), at the app's
 * `StoreRoot`.
 */
import { HttpApiBuilder } from 'effect/http-api';
import { eventList, eventObject } from 'agent-orchestrator';
import { Api } from 'objects';
import { factoryNamed, queryOf } from '../factory-parts/parts.ts';
import { runPlaced } from '../store.ts';
import { answered } from '../objects/refused.ts';

export const eventsHandlers = HttpApiBuilder.group(Api, 'events', (handlers) =>
  handlers
    .handle('listAll', ({ query }) => answered((s) => runPlaced(s, s.e, eventList(queryOf(query)))))
    .handle('list', ({ params: { namespace }, query }) =>
      answered((s) => {
        factoryNamed(`GET /api/namespaces/${namespace}/events`, namespace);
        return runPlaced(s, s.e, eventList({ ...queryOf(query), namespace }));
      }),
    )
    .handle('getAll', ({ params: { name } }) => answered((s) => runPlaced(s, s.e, eventObject(name))))
    .handle('get', ({ params: { namespace, name } }) =>
      answered((s) => {
        factoryNamed(`GET /api/namespaces/${namespace}/events/${name}`, namespace);
        return runPlaced(s, s.e, eventObject(name, namespace));
      }),
    ),
);
