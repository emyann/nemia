/**
 * The proposals group's handlers (`objects`' `Api`): a factory's Proposals, in its namespace, each a named action over its definitions and
 * wiring. Listed and read by anyone; made by any caller of the factory (`proposeProgram`, 201), the caller read off the request (`caller`,
 * caller/caller.ts) and never off the body; approved by the person, or by an agent at auto within its delegation and under a confirmed
 * rule, then applied at once where it is due (`approveProgram`); declined by the person alone (`declineProgram`). Every judgement is the
 * package's: a handler hands it the caller and the place, and answers what it answers.
 *
 * Each request is answered in its namespace's factory (`answeredWriteIn`): a refusal by who calls (the package's `Forbidden`) is the
 * `Api`'s 403 with its reason, as every refusal is answered by its kind (`refusedAs`); a write the disk refused is `Failed`, a 500 in its
 * own words.
 */
import { approveProgram, declineProgram, proposalGet, proposalsList, proposeProgram, type ProposalPlace } from 'agent-orchestrator';
import { Api } from 'objects';
import type { Served } from '../layer.ts';
import { repoNeeded } from '../factory/place.ts';
import { queryOf } from '../factory/parts/index.ts';
import { answeredWriteIn } from '../objects/refused.ts';
import { listed } from '../definitions/served.ts';
import { readsBounded } from '../objects/answer-bound.ts';

/** Where a proposal is judged and applied: the store's root, and the repository the request is placed on (`placeFor`). */
export const placeOf = (s: Served): ProposalPlace => ({ home: s.home, repo: repoNeeded(s) });

export const proposalsHandlers = readsBounded(Api, 'proposals', (handlers) =>
  handlers
    .handle('list', ({ params: { namespace }, query }) =>
      answeredWriteIn(namespace, async (s) => listed('Proposal', await s.inRequest(proposalsList(namespace)), queryOf(query))),
    )
    .handle('get', ({ params: { namespace, name } }) => answeredWriteIn(namespace, (s) => s.inRequest(proposalGet(namespace, name))))
    .handle('create', ({ params: { namespace }, payload }) =>
      answeredWriteIn(namespace, (s) => s.inRequest(proposeProgram(s.caller, namespace, payload, placeOf(s)))),
    )
    .handle('approve', ({ params: { namespace, name } }) =>
      answeredWriteIn(namespace, (s) => s.inRequest(approveProgram(s.caller, namespace, name, placeOf(s)))),
    )
    .handle('decline', ({ params: { namespace, name } }) =>
      answeredWriteIn(namespace, (s) => s.inRequest(declineProgram(s.caller, namespace, name))),
    ),
);
