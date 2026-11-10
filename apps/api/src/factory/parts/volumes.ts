/**
 * The volumes group's handlers (`objects`' `Api`): a factory's volumes as objects, in its namespace — a page of them (`volumeList`), one
 * (`volumeObject`) — each with the runs in play that mount it, judged off the app's informer. Read alone: `nemia factory volume add` and
 * `rm` write them.
 */
import { HttpApiBuilder } from 'effect/http-api';
import { informerMemo, type SummaryHow, verifiesRest, volumeList, volumeObject } from 'agent-orchestrator';
import { Api } from 'objects';
import type { Served } from '../../layer.ts';
import { defaultRepo, factoryNamed, queryOf } from './parts.ts';
import { answered } from '../../objects/refused.ts';

/** How a read of the volumes judges a run that mounts one: off the app's informer and its feed's filing times. */
const howOf = (s: Served): SummaryHow => ({
  home: s.home,
  memo: s.informer ?? informerMemo(),
  filings: s.memo.filings,
  verify: verifiesRest(s.env),
});

export const volumesHandlers = HttpApiBuilder.group(Api, 'volumes', (handlers) =>
  handlers
    .handle('list', ({ params: { namespace }, query }) =>
      answered((s) => {
        factoryNamed(`GET /api/namespaces/${namespace}/volumes`, namespace);
        return s.inRequest(volumeList(s.e, howOf(s), defaultRepo(s), namespace, queryOf(query)));
      }),
    )
    .handle('get', ({ params: { namespace, name } }) =>
      answered((s) => {
        factoryNamed(`GET /api/namespaces/${namespace}/volumes/${name}`, namespace);
        return s.inRequest(volumeObject(s.e, howOf(s), defaultRepo(s), namespace, name));
      }),
    ),
);
