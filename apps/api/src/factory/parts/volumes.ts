/**
 * The volumes group's handlers (`objects`' `Api`): a factory's volumes as objects, in its namespace — a page of them (`volumeList`), one
 * (`volumeObject`) — each with the runs in play that mount it, judged off the app's informer; and one's switches set by a PATCH
 * (`nemia factory volume set`), answered as it reads after with the file written (`written`). `nemia factory volume add` and `rm`, which
 * take a folder by its whole path, are the factories group's.
 */
import { FACTORY_VOLUME_SET, informerMemo, verifiesRest, volumeList, volumeObject } from 'agent-orchestrator';
import { Api } from 'objects';
import type { Served } from '../../layer.ts';
import { factoryNamed, queryOf } from './parts.ts';
import { answered } from '../../objects/refused.ts';
import { readsBounded } from '../../objects/answer-bound.ts';

/** How a read of the volumes judges a run that mounts one: off the app's informer. */
const howOf = (s: Served) => ({
  home: s.home,
  memo: s.informer ?? informerMemo(),
  verify: verifiesRest(s.env),
});

export const volumesHandlers = readsBounded(Api, 'volumes', (handlers) =>
  handlers
    .handle('list', ({ params: { namespace }, query }) =>
      answered((s) => {
        factoryNamed(`GET /api/namespaces/${namespace}/volumes`, namespace);
        return s.inRequest(volumeList(s.e, howOf(s), namespace, queryOf(query)));
      }),
    )
    .handle('get', ({ params: { namespace, name } }) =>
      answered((s) => {
        factoryNamed(`GET /api/namespaces/${namespace}/volumes/${name}`, namespace);
        return s.inRequest(volumeObject(s.e, howOf(s), namespace, name));
      }),
    )
    .handle('patch', ({ params: { namespace, name }, payload }) =>
      answered(async (s) => {
        factoryNamed(`PATCH /api/namespaces/${namespace}/volumes/${name}`, namespace);
        const { file } = await s.inRequest(FACTORY_VOLUME_SET.handler({ factory: namespace, volume: name, ...payload }));
        return { ...(await s.inRequest(volumeObject(s.e, howOf(s), namespace, name))), written: { file } };
      }),
    ),
);
