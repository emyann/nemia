/**
 * The programs over a factory's proposals a caller asks of the api: list and read them; approve one (`approveProgram`), the caller's
 * standing read afresh and judged by `proposalApproval` — the person's approval of anything waiting, an agent's at auto within its
 * delegation and under a confirmed rule, never its own agent's — then applied at once where it is due (`applyProgram`); decline one, the
 * person's alone (`declineProgram`). Each takes its caller explicitly and the store's place; a refusal by who calls is `Forbidden`.
 */
import { Effect } from 'effect';
import { PROPOSAL_PHASES } from 'objects';
import { Conflict, Forbidden, Invalid, Missing } from '../refusal/refusal.ts';
import { phaseTakes, proposalPhaseSelector } from '../proposal/index.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { RunId } from '../record/record.model.ts';
import { proposalApproval } from './approval.ts';
import { applyProgram, type RunStateOf } from '../apply/apply.verb.ts';
import type { ProposalPlace } from '../propose/current.verb.ts';
import type { ProposalCaller } from '../caller/index.ts';
import { ProposalDoor } from '../proposal/proposal.store.ts';
import { factsOf, standingOf } from './standing.verb.ts';

/** The proposal `name` of `factory`, refused (`Missing`) where none is. */
const proposalAt = (factory: string, name: string) =>
  Effect.gen(function* () {
    const p = yield* (yield* ProposalDoor).proposals.read(factory, name);
    if (p === undefined)
      return yield* Effect.fail(
        new Missing({ message: `${factory} has no proposal ${name}: list them with nemia get proposals -n ${factory}.` }),
      );
    return p;
  });

/** The selector `fieldSelector` spells, none where it is empty; `Invalid` naming the forms it takes where it spells none. */
const selectorOf = (fieldSelector: string | undefined) => {
  const selector = fieldSelector === undefined || fieldSelector === '' ? undefined : proposalPhaseSelector(fieldSelector);
  return selector === null
    ? Effect.fail(
        new Invalid({
          message: `fieldSelector ${fieldSelector} is none a proposal list takes: give status.phase=<phase> (or ==, !=), a phase being one of ${PROPOSAL_PHASES.join(', ')}, or an empty one for every proposal`,
        }),
      )
    : Effect.succeed(selector);
};

/**
 * The proposals of `factory`, by name, that `fieldSelector` keeps: every one where it is empty or none, else those in the phase it asks
 * (`proposalPhaseSelector`, `phaseTakes`); `Invalid` naming the forms it takes where it spells none, before a proposal is read.
 * @param factory The factory whose proposals are listed.
 * @param fieldSelector The phase the list keeps; every proposal where it is empty or none.
 */
export const proposalsList = Effect.fn('proposalsList')(function* (factory: string, fieldSelector?: string) {
  const selector = yield* selectorOf(fieldSelector);
  const proposals = yield* (yield* ProposalDoor).proposals.list(factory);
  return selector === undefined ? proposals : proposals.filter((p) => phaseTakes(selector, p.status.phase));
});

/**
 * The proposals of `factory` as `proposalsList` answers them, and the revision of the keyspace they were read at, as a list's
 * `resourceVersion` says it: read in one transaction, so the revision is at least each item's.
 * @param factory The factory whose proposals are listed.
 * @param fieldSelector The phase the list keeps, as `?fieldSelector=status.phase…` spells it; every proposal where it is empty or none.
 */
export const proposalsListed = Effect.fn('proposalsListed')(function* (factory: string, fieldSelector?: string) {
  const selector = yield* selectorOf(fieldSelector);
  const { items, revision } = yield* (yield* ProposalDoor).proposals.listed(factory);
  return {
    items: selector === undefined ? items : items.filter((p) => phaseTakes(selector, p.status.phase)),
    resourceVersion: String(revision),
  };
});

/** The proposal `name` of `factory`; `Missing` where none is. */
export const proposalGet = Effect.fn('proposalGet')(function* (factory: string, name: string) {
  return yield* proposalAt(factory, name);
});

/**
 * A run's state as its record says it, between passes: `cancelled` once called off, `gone` where the store holds it no more, and unread
 * otherwise — so a run-end proposal approved now waits for the pass that judges its run (`pass.verb.ts`).
 * @param run The run's id.
 */
const recordedRunState: RunStateOf = (run) =>
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
) {
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
export const declineProgram = Effect.fn('declineProgram')(function* (caller: ProposalCaller, factory: string, name: string) {
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
