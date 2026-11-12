/**
 * The delegations group's handlers (`objects`' `Api`): a factory's Delegations, in its namespace, each named by its agent — what that agent
 * may approve of the factory's proposals at auto. Listed and read by anyone; written whole and removed by the person alone: the package
 * refuses an agent's session (`Forbidden`, `person-only`), the api's 403. A removal answers the delegation it removed, read before it,
 * the caller judged first: an agent is refused whether or not one is there, the person told `Missing` where none is.
 */
import { Effect } from 'effect';
import { delegationGet, delegationPut, delegationRemove, delegationsList } from 'agent-orchestrator';
import { Api } from 'objects';
import { queryOf } from '../factory/parts/index.ts';
import { listed } from '../definitions/served.ts';
import { answeredWriteIn } from '../objects/refused.ts';
import { readsBounded } from '../objects/answer-bound.ts';

export const delegationsHandlers = readsBounded(Api, 'delegations', (handlers) =>
  handlers
    .handle('list', ({ params: { namespace }, query }) =>
      answeredWriteIn(namespace, async (s) => listed('Delegation', await s.inRequest(delegationsList(namespace)), queryOf(query))),
    )
    .handle('get', ({ params: { namespace, name } }) => answeredWriteIn(namespace, (s) => s.inRequest(delegationGet(namespace, name))))
    .handle('put', ({ params: { namespace, name }, payload }) =>
      answeredWriteIn(namespace, (s) => s.inRequest(delegationPut(s.caller, namespace, name, payload))),
    )
    .handle('delete', ({ params: { namespace, name } }) =>
      answeredWriteIn(namespace, (s) =>
        s.inRequest(
          Effect.gen(function* () {
            const was = yield* Effect.result(delegationGet(namespace, name));
            yield* delegationRemove(s.caller, namespace, name);
            if (was._tag === 'Failure') return yield* Effect.fail(was.failure);
            return was.success;
          }),
        ),
      ),
    ),
);
