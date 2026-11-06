/**
 * An approved proposal acted on (`applyProgram`), at approval and on every pass of the tick (`pass.verb.ts`): read again, every object's
 * version read against the one the proposal read and an agent's approval asked again (`proposalApproval`), then `proposalApply` says what
 * becomes of it — applied, each object written in turn (`objectWritten`), recording what each held before and the revisions made; left
 * waiting on its run; marked stale; sent back to the person; or dropped with its run. A write refused midway leaves it `failed`, naming
 * what was written, and no pass applies it again. Carries nothing between calls.
 */
import { Effect } from 'effect';
import type { Proposal, ProposedObject } from 'objects';
import type { ApplyAction } from '../../contracts/proposal-apply.contract.ts';
import type { Refusal } from '../refusal/refusal.ts';
import { proposalApproval } from './approval.ts';
import { proposalApply, proposingRunOf, type RunState } from './apply.ts';
import { currentOf, type ProposalNeeds, type ProposalPlace } from './current.verb.ts';
import { verbOf } from './propose.verb.ts';
import { factsOf, standingOf } from './standing.verb.ts';
import { objectWritten } from './write.verb.ts';
import { ProposalDoor } from './proposal.store.ts';

/** How a program reads the state of a proposal's run: as the tick judged it, or as its record says. */
export type RunStateOf = (run: string) => Effect.Effect<RunState | undefined, Refusal>;

/** Each object of `proposal` as it is now: its version, its spec, and whether it is still what the proposal read. */
const nowOf = (place: ProposalPlace, factory: string, objects: readonly ProposedObject[]) =>
  Effect.forEach(objects, (object) =>
    Effect.map(currentOf(place, factory, object.kind, object.metadata.name), (now) => ({
      object,
      now,
      current: now.version === (verbOf(object) === 'create' ? null : (object.metadata.resourceVersion ?? null)),
    })),
  );

/** Whether an agent's approval of `proposal` still holds, `proposalApproval` asked again as if it waited; the person's always does. */
const stillApproved = (place: ProposalPlace, factory: string, proposal: Proposal) =>
  Effect.gen(function* () {
    const by = proposal.status.approvedBy;
    if (by === undefined || by.by === 'person' || by.agent === undefined) return true;
    const standing = yield* standingOf(place.home, by.agent, factory);
    return proposalApproval({ kind: 'agent', agent: by.agent, factory }, factsOf(proposal, true), standing).kind === 'approved';
  });

/** `proposal` with its status changed by `status`. */
const withStatus = (proposal: Proposal, status: Partial<Proposal['status']>): Proposal => ({
  ...proposal,
  status: { ...proposal.status, ...status },
});

/** What the action other than an apply makes of `proposal`: its phase, and a sentence saying why. */
const moved = (proposal: Proposal, action: Exclude<ApplyAction, 'apply' | 'wait'>): Proposal => {
  if (action === 'stale')
    return withStatus(proposal, {
      phase: 'stale',
      message: 'an object it carries changed since it was read: read the objects again and propose anew.',
    });
  if (action === 'drop')
    return withStatus(proposal, { phase: 'dropped', message: 'its run was called off before it ended well, so it is not applied.' });
  const { approvedBy: _lapsed, ...status } = proposal.status;
  return {
    ...proposal,
    status: {
      ...status,
      phase: 'waiting',
      message: 'the approval it had no longer holds (its delegation, its rule or the level changed): it waits on the person again.',
    },
  };
};

/**
 * The approved proposal `name` of `factory` acted on, what `proposalApply` says, its run's state read by `runState`: what it is after.
 * A proposal not approved is answered as it is.
 */
export const applyProgram = Effect.fn('applyProgram')(function* (
  factory: string,
  name: string,
  place: ProposalPlace,
  runState: RunStateOf,
): Effect.fn.Return<Proposal | undefined, Refusal, ProposalNeeds> {
  const door = (yield* ProposalDoor).proposals;
  const proposal = yield* door.read(factory, name);
  if (proposal === undefined || proposal.status.phase !== 'approved') return proposal;
  const objects = yield* nowOf(place, factory, proposal.spec.objects);
  const run = proposal.status.proposedBy.run;
  const action = proposalApply({
    at: proposal.spec.applyAt ?? 'approval',
    run: proposingRunOf(run, run === undefined ? undefined : yield* runState(run)),
    approvedBy: proposal.status.approvedBy?.by ?? 'person',
    current: objects.every((o) => o.current),
    stillApproved: yield* stillApproved(place, factory, proposal),
  });
  if (action === 'wait') return proposal;
  if (action !== 'apply') return yield* door.write(moved(proposal, action));
  const before: ProposedObject[] = objects.flatMap(({ object, now }) =>
    now.version === null
      ? []
      : [{ kind: object.kind, metadata: { name: object.metadata.name, resourceVersion: now.version }, spec: now.spec }],
  );
  const revisions: string[] = [];
  for (const { object } of objects) {
    const wrote = yield* Effect.result(objectWritten(place, factory, object));
    if (wrote._tag === 'Failure')
      return yield* door.write(
        withStatus(proposal, {
          phase: 'failed',
          before,
          revisions,
          written: [...revisions],
          message: `${object.kind} ${object.metadata.name} was refused as it was written: ${wrote.failure.message} What is named in written stands; propose the rest again.`,
        }),
      );
    revisions.push(wrote.success);
  }
  return yield* door.write(withStatus(proposal, { phase: 'applied', before, revisions, message: 'applied as a new revision.' }));
});
