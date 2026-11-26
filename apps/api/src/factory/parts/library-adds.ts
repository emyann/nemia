/**
 * The libraryadds group's handlers (`objects`' `Api`): what a factory has added from the store's library, as objects in its namespace,
 * named `<kind>.<name>` — a page of them (`libraryAddList`), one (`libraryAddNamed`), each with its state (`resolved`, `shadowed` by the
 * factory's own, or `missing` from the library) — an item added (`PUT`, which takes no body: the name says it) and its add taken off
 * (`DELETE`), each written through the package's program (`libraryAddWritten`), which records the factory's adds whole on its first write.
 */
import { libraryAddList, libraryAddNamed, libraryAddTable, libraryAddWritten } from 'agent-orchestrator';
import { listOrTable } from '../../objects/table.ts';
import { Api } from 'objects';
import { factoryNamed, queryOf } from './parts.ts';
import { answered } from '../../objects/refused.ts';
import { readsBounded } from '../../objects/answer-bound.ts';

/** The route of the add `name` of `namespace`, as a refusal says it. */
const routeOf = (method: string, namespace: string, name: string) => `${method} /api/namespaces/${namespace}/libraryadds/${name}`;

export const libraryAddsHandlers = readsBounded(Api, 'libraryadds', (handlers) =>
  handlers
    .handle('list', ({ params: { namespace }, query }) =>
      listOrTable(
        answered((s) => {
          factoryNamed(`GET /api/namespaces/${namespace}/libraryadds`, namespace);
          return s.inRequest(libraryAddList(s.home, namespace, queryOf(query)));
        }),
        libraryAddTable,
      ),
    )
    .handle('get', ({ params: { namespace, name } }) =>
      answered(async (s) => {
        factoryNamed(routeOf('GET', namespace, name), namespace);
        return s.inRequest(libraryAddNamed(s.home, namespace, name));
      }),
    )
    .handle('put', ({ params: { namespace, name } }) =>
      answered((s) => {
        factoryNamed(routeOf('PUT', namespace, name), namespace);
        return s.inRequest(libraryAddWritten(namespace, 'add', name));
      }),
    )
    .handle('delete', ({ params: { namespace, name } }) =>
      answered((s) => {
        factoryNamed(routeOf('DELETE', namespace, name), namespace);
        return s.inRequest(libraryAddWritten(namespace, 'remove', name));
      }),
    ),
);
