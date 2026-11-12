/**
 * The hires group's handlers (`objects`' `Api`): a factory's Hires as objects, in its namespace, one per step it offers, named
 * `<workflow>.<step>` — a page of them (`hireList`), one (`hireObject`) — an agent hired into the step (`nemia factory hire`) and fired
 * from it (`factory fire`). A name two steps join to is read and written by neither: `Conflict`, naming both and the fix.
 */
import { FACTORY_FIRE, FACTORY_HIRE, hireList, hireObject } from 'agent-orchestrator';
import { Api } from 'objects';
import type { Served } from '../../layer.ts';
import { factoryNamed, queryOf } from './parts.ts';
import { answered } from '../../objects/refused.ts';
import { readsBounded } from '../../objects/answer-bound.ts';

/** The Hire `name` of `namespace`, read now. */
const hireIn = (s: Served, namespace: string, name: string) => s.inRequest(hireObject(s.home, namespace, name));

export const hiresHandlers = readsBounded(Api, 'hires', (handlers) =>
  handlers
    .handle('list', ({ params: { namespace }, query }) =>
      answered((s) => {
        factoryNamed(`GET /api/namespaces/${namespace}/hires`, namespace);
        return s.inRequest(hireList(s.home, namespace, queryOf(query)));
      }),
    )
    .handle('get', ({ params: { namespace, name } }) =>
      answered(async (s) => {
        factoryNamed(`GET /api/namespaces/${namespace}/hires/${name}`, namespace);
        return hireIn(s, namespace, name);
      }),
    )
    .handle('put', ({ params: { namespace, name }, payload }) =>
      answered(async (s) => {
        factoryNamed(`PUT /api/namespaces/${namespace}/hires/${name}`, namespace);
        const { spec } = await hireIn(s, namespace, name);
        const step = `${spec.workflow}/${spec.step}`;
        await s.inRequest(FACTORY_HIRE.handler({ factory: namespace, agent: payload.agent, step }));
        return hireIn(s, namespace, name);
      }),
    )
    .handle('delete', ({ params: { namespace, name } }) =>
      answered(async (s) => {
        factoryNamed(`DELETE /api/namespaces/${namespace}/hires/${name}`, namespace);
        const { spec } = await hireIn(s, namespace, name);
        await s.inRequest(FACTORY_FIRE.handler({ factory: namespace, step: `${spec.workflow}/${spec.step}` }));
        return hireIn(s, namespace, name);
      }),
    ),
);
