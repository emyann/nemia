/**
 * The programs over a factory's proposals a caller asks of the api: list and read them; approve one (`approveProgram`), the caller's
 * standing read afresh and judged by `proposalApproval` — the person's approval of anything waiting, an agent's at auto within its
 * delegation and under a confirmed rule, never its own agent's — then applied at once where it is due (`applyProgram`); decline one, the
 * person's alone (`declineProgram`). Each takes its caller explicitly and the store's place; a refusal by who calls is `Forbidden`.
 */
import { Effect } from 'effect';
import type { Proposal } from 'objects';
import { Conflict, Forbidden, Missing, type Refusal } from '../refusal/refusal.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { RunId } from '../record/record.model.ts';
import { proposalApproval } from './approval.ts';
import { applyProgram, type RunStateOf } from '../apply/apply.verb.ts';
import type { ProposalNeeds, ProposalPlace } from '../propose/current.verb.ts';
import type { ProposalCaller } from '../caller/index.ts';
import { ProposalDoor } from '../proposal/proposal.store.ts';
import { factsOf, standingOf } from './standing.verb.ts';

/** The proposal `name` of `factory`, refused (`Missing`) where none is. */
const proposalAt = (factory: string, name: string): Effect.Effect<Proposal, Refusal> =>
  Effect.gen(function* () {
    const p = yield* (yield* ProposalDoor).proposals.read(factory, name);
    if (p === undefined)
      return yield* Effect.fail(
        new Missing({ message: `${factory} has no proposal ${name}: list them with nemia get proposals -n ${factory}.` }),
      );
    return p;
  });

/** The proposals of `factory`, by name. */
export const proposalsList = Effect.fn('proposalsList')(function* (factory: string) {
  return yield* (yield* ProposalDoor).proposals.list(factory);
});

/** The proposal `name` of `factory`; `Missing` where none is. */
export const proposalGet = Effect.fn('proposalGet')(function* (factory: string, name: string) {
  return yield* proposalAt(factory, name);
});

/**
 * A run's state as its record says it, between passes: `cancelled` once called off, `gone` where the store holds it no more, and unread
 * otherwise — so a run-end proposal approved now waits for the pass that judges its run (`pass.verb.ts`).
 */
export const recordedRunState: RunStateOf = (run) =>
  Effect.gen(function* () {
    const read = yield* Effect.result((yield* RunDoor).runs.read(RunId.read(run)));
    if (read._tag === 'Success') return read.success.cancelledAt === undefined ? undefined : 'cancelled';
    if (read.failure._tag === 'Missing') return 'gone';
    return yield* Effect.fail(read.failure);
  });

/**
 * The proposal `name` of `factory` approved by `caller`, written `approved` with who approved it, then applied where it is due: what it
 * is after. Refused (`Forbidden`, with `proposalApproval`'s reason) where the caller's approval does not go on.
 */
export const approveProgram = Effect.fn('approveProgram')(function* (
  caller: ProposalCaller,
  factory: string,
  name: string,
  place: ProposalPlace,
): Effect.fn.Return<Proposal, Refusal, ProposalNeeds> {
  const proposal = yield* proposalAt(factory, name);
  const standing =
    caller.kind === 'person' ? { level: 'manual' as const, grants: [], rules: [] } : yield* standingOf(place.home, caller.agent, factory);
  const verdict = proposalApproval(caller, factsOf(proposal, proposal.status.phase === 'waiting'), standing);
  if (verdict.kind === 'refused')
    return yield* Effect.fail(
      new Forbidden({
        reason: verdict.reason,
        message: `${name} is not approved by this caller (${verdict.reason}): the person approves it, nemia proposals approve ${name} -n ${factory}, or the board.`,
      }),
    );
  const at = new Date().toISOString();
  const approvedBy =
    verdict.by === 'person'
      ? { by: 'person' as const, at }
      : { by: 'rule' as const, agent: caller.kind === 'agent' ? caller.agent : '', rule: verdict.rule, at };
  const { message: _was, ...status } = proposal.status;
  yield* (yield* ProposalDoor).proposals.write({ ...proposal, status: { ...status, phase: 'approved', approvedBy } });
  return (yield* applyProgram(factory, name, place, recordedRunState)) ?? (yield* proposalAt(factory, name));
});

/**
 * The proposal `name` of `factory` declined by the person, written `declined`: what it is after. Refused: an agent (`Forbidden`,
 * `person-only`), and a proposal no longer waiting or approved (`Conflict`).
 */
export const declineProgram = Effect.fn('declineProgram')(function* (
  caller: ProposalCaller,
  factory: string,
  name: string,
): Effect.fn.Return<Proposal, Refusal> {
  if (caller.kind !== 'person')
    return yield* Effect.fail(
      new Forbidden({ reason: 'person-only', message: `the person declines a proposal, never an agent: ask them to decline ${name}.` }),
    );
  const proposal = yield* proposalAt(factory, name);
  if (proposal.status.phase !== 'waiting' && proposal.status.phase !== 'approved')
    return yield* Effect.fail(
      new Conflict({ message: `${name} is ${proposal.status.phase}: only a proposal waiting or approved is declined.` }),
    );
  return yield* (yield* ProposalDoor).proposals.write({
    ...proposal,
    status: { ...proposal.status, phase: 'declined', message: 'the person declined it.' },
  });
});
