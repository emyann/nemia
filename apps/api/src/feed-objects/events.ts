/**
 * The events group's handlers (`objects`' `Api`): the feed's lines as Events, every one (`/api/events`) or a namespace's, those of the
 * factory each names (`/api/namespaces/<ns>/events`), and one by its name, the byte its line starts at — a daemon's or the store's that
 * names no factory read at `/api/events/<name>` alone. Read through the package's Feed door (`eventList`, `eventObject`), at the app's
 * `StoreRoot`.
 */
import { eventList, eventObject, eventTable } from 'agent-orchestrator';
import { listOrTable } from '../objects/table.ts';
import { Api } from 'objects';
import { factoryNamed, queryOf } from '../factory/parts/parts.ts';
import { runPlaced } from '../store.ts';
import { answered } from '../objects/refused.ts';
import { readsBounded } from '../objects/answer-bound.ts';

export const eventsHandlers = readsBounded(Api, 'events', (handlers) =>
  handlers
    .handle('listAll', ({ query }) =>
      listOrTable(
        answered((s) => runPlaced(s, s.e, eventList(queryOf(query)))),
        eventTable,
      ),
    )
    .handle('list', ({ params: { namespace }, query }) =>
      listOrTable(
        answered((s) => {
          factoryNamed(`GET /api/namespaces/${namespace}/events`, namespace);
          return runPlaced(s, s.e, eventList({ ...queryOf(query), namespace }));
        }),
        eventTable,
      ),
    )
    .handle('getAll', ({ params: { name } }) => answered((s) => runPlaced(s, s.e, eventObject(name))))
    .handle('get', ({ params: { namespace, name } }) =>
      answered((s) => {
        factoryNamed(`GET /api/namespaces/${namespace}/events/${name}`, namespace);
        return runPlaced(s, s.e, eventObject(name, namespace));
      }),
    ),
);
