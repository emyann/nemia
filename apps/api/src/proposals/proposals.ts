/**
 * The proposals group's handlers (`objects`' `Api`): a factory's Proposals, in its namespace, each a named action over its definitions and
 * wiring. Listed and read by anyone; made by any caller of the factory (`proposeProgram`, 201), the caller read off the request (`caller`,
 * caller/caller.ts) and never off the body; approved by the person, or by an agent at auto within its delegation and under a confirmed
 * rule, then applied at once where it is due (`approveProgram`); declined by the person alone (`declineProgram`). Every judgement is the
 * package's: a handler hands it the caller and the place, and answers what it answers.
 *
 * A refusal by who calls (the package's `Forbidden`) is the `Api`'s 403 with its reason; the package's other refusals are answered as
 * every object's are (`refusedAs`); a write the disk refused is `Failed`, a 500 in its own words.
 */
import { Effect } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';
import {
  approveProgram,
  declineProgram,
  Forbidden as Refused,
  proposalGet,
  proposalsList,
  proposeProgram,
  type ProposalPlace,
} from 'agent-orchestrator';
import { Api, type Conflict, Failed, Forbidden, type Invalid, type Missing } from 'objects';
import type { Served } from '../layer.ts';
import { queryOf } from '../factory/parts/index.ts';
import { refusedAs, ServedNow } from '../objects/refused.ts';
import { listed } from '../definitions/served.ts';
import { runPlaced } from '../store.ts';

/** What a proposal's or a delegation's handler fails with. */
export type ProposalError = Missing | Conflict | Invalid | Forbidden | Failed;

/**
 * `work` over the request's services: the package's `Forbidden` as the `Api`'s, with its reason; its other refusals as `refusedAs` words
 * them; any other `Error` `Failed`; anything else dies, a 500.
 */
export const proposalAnswered = <A>(work: (s: Served) => Promise<A>): Effect.Effect<A, ProposalError, ServedNow> =>
  Effect.gen(function* () {
    const s = yield* ServedNow;
    return yield* Effect.tryPromise({ try: () => work(s), catch: (err) => err }).pipe(
      Effect.catch((err) => {
        if (err instanceof Refused) return Effect.fail(new Forbidden({ error: err.message, reason: err.reason }));
        const refused = refusedAs(err);
        if (refused) return Effect.fail(refused);
        return err instanceof Error ? Effect.fail(new Failed({ error: err.message })) : Effect.die(err);
      }),
    );
  });

/** Where a proposal is judged and applied: the store's root, and the repository the request is placed on (`placeFor`). */
export const placeOf = (s: Served): ProposalPlace => ({ home: s.home, repo: s.repo });

export const proposalsHandlers = HttpApiBuilder.group(Api, 'proposals', (handlers) =>
  handlers
    .handle('list', ({ params: { namespace }, query }) =>
      proposalAnswered(async (s) => listed('Proposal', await runPlaced(s, s.e, proposalsList(namespace)), queryOf(query))),
    )
    .handle('get', ({ params: { namespace, name } }) => proposalAnswered((s) => runPlaced(s, s.e, proposalGet(namespace, name))))
    .handle('create', ({ params: { namespace }, payload }) =>
      proposalAnswered((s) => runPlaced(s, s.e, proposeProgram(s.caller, namespace, payload, placeOf(s)))),
    )
    .handle('approve', ({ params: { namespace, name } }) =>
      proposalAnswered((s) => runPlaced(s, s.e, approveProgram(s.caller, namespace, name, placeOf(s)))),
    )
    .handle('decline', ({ params: { namespace, name } }) =>
      proposalAnswered((s) => runPlaced(s, s.e, declineProgram(s.caller, namespace, name))),
    ),
);
