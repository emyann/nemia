/**
 * The programs group's handlers (`objects`' `Api`): a factory's programs as objects, in its namespace — a page of them (`programList`),
 * one (`programObject`) — each with where its task runs now, read off the engine: its phase, its restarts and since when.
 */
import { programList, programObject, programTable } from 'agent-orchestrator';
import { listOrTable } from '../../objects/table.ts';
import { Api } from 'objects';
import { factoryNamed, queryOf } from './parts.ts';
import { answered } from '../../objects/refused.ts';
import { readsBounded } from '../../objects/answer-bound.ts';

export const programsHandlers = readsBounded(Api, 'programs', (handlers) =>
  handlers
    .handle('list', ({ params: { namespace }, query }) =>
      listOrTable(
        answered((s) => {
          factoryNamed(`GET /api/namespaces/${namespace}/programs`, namespace);
          return s.inRequest(programList(s.e, s.home, namespace, queryOf(query)));
        }),
        programTable,
      ),
    )
    .handle('get', ({ params: { namespace, name } }) =>
      answered((s) => {
        factoryNamed(`GET /api/namespaces/${namespace}/programs/${name}`, namespace);
        return s.inRequest(programObject(s.e, s.home, namespace, name));
      }),
    ),
);
