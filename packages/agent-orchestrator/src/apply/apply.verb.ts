/**
 * An approved proposal acted on (`applyProgram`), at approval and on every pass of the tick (`pass.verb.ts`): read again, every object's
 * version read against the one the proposal read and an agent's approval asked again (`proposalApproval`), then `proposalApply` says what
 * becomes of it — applied, each object written in turn (`objectWritten`), recording what each held before and the revisions made; left
 * waiting on its run; marked stale; sent back to the person; or dropped with its run. A write refused midway leaves it `failed`, naming
 * what was written, and no pass applies it again. Carries nothing between calls.
 */
import { Effect } from 'effect';
import { RESOURCE_PLURALS, type Proposal, type ProposedObject } from 'objects';
import type { ApplyAction } from '../../contracts/proposal-apply.contract.ts';
import type { Refusal } from '../refusal/refusal.ts';
import { proposalApproval } from '../approval/index.ts';
import { proposalApply, proposingRunOf, type RunState } from './apply.ts';
import { currentOf, type ProposalNeeds, type ProposalPlace } from '../propose/current.verb.ts';
import { verbOf } from '../propose/propose.verb.ts';
import { factsOf, standingOf } from '../approval/standing.verb.ts';
import { objectWritten } from './write.verb.ts';
import { ProposalDoor } from '../proposal/proposal.store.ts';
import { readResolutions } from '../factory/applied/applied.store.ts';
import { resolvedAgain, type ResolvedAgain } from '../factory/upgrade/index.ts';
import { upgradeComposed } from '../factory/applied/applied.verb.ts';
import { StoreRoot } from '../config/root.store.ts';

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

/** The line that reads `object` of `factory` again: `nemia get <resource> <name>`, in the factory unless it is the Factory itself. */
const readAgain = (factory: string, object: ProposedObject): string =>
  object.kind === 'Factory'
    ? `nemia get ${RESOURCE_PLURALS.Factory} ${object.metadata.name}`
    : `nemia get ${RESOURCE_PLURALS[object.kind]} ${object.metadata.name} -n ${factory}`;

/** Where `proposal` of `factory` resolves an upgrade's conflicts (`resolutions.json`), the lines that resolve them again; else none. */
const resolutionOf = (place: ProposalPlace, factory: string, proposal: Proposal): ResolvedAgain | undefined => {
  const kept = readResolutions(place.home, factory);
  return kept === undefined ? undefined : resolvedAgain(factory, proposal.metadata.name, kept.proposals ?? {}, kept.choices);
};

/** What to do once the proposal cannot apply: resolve its owner's conflicts again where it is a resolution's, else `otherwise`. */
const doNext = (again: ResolvedAgain | undefined, otherwise: string): string =>
  again === undefined
    ? otherwise
    : `it resolves the upgrade's conflicts of ${again.owner}, so resolve them again on what the tree holds now: ${again.lines.join('; ') || 'nemia factory resolve <name> <conflict> --ours|--theirs|--file <path>'}`;

/**
 * The tree a Workflow of `proposal` is judged against as it is written: where it resolves an upgrade's conflicts (`resolutionOf`) and an
 * upgrade of `factory` is due, the tree that upgrade composes (`upgradeComposed`), whose clean merges land only once each conflict is
 * resolved; else none, the factory's tree as it is.
 */
const composedFor = (place: ProposalPlace, factory: string, proposal: Proposal) =>
  resolutionOf(place, factory, proposal) === undefined || !proposal.spec.objects.some((o) => o.kind === 'Workflow')
    ? Effect.succeed(undefined)
    : Effect.provideService(upgradeComposed(factory), StoreRoot, place.home);

/**
 * What the action other than an apply makes of `proposal` of `factory`: its phase, and a sentence saying why — for a stale one, each
 * object of `changed` that moved since it was read, and the line that reads it again, or, for an upgrade's resolution (`again`), the
 * lines that resolve its conflicts again.
 */
const moved = (
  proposal: Proposal,
  factory: string,
  changed: readonly ProposedObject[],
  action: Exclude<ApplyAction, 'apply' | 'wait'>,
  again: ResolvedAgain | undefined,
): Proposal => {
  if (action === 'stale') {
    const named = changed
      .map((o) => (again === undefined ? `${o.kind} ${o.metadata.name} (${readAgain(factory, o)})` : `${o.kind} ${o.metadata.name}`))
      .join(', ');
    return withStatus(proposal, {
      phase: 'stale',
      message: `${named || 'an object it carries'} changed since it was read: ${doNext(again, 'read it again and propose from what it holds now')}.`,
    });
  }
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
  if (action !== 'apply')
    return yield* door.write(
      moved(
        proposal,
        factory,
        objects.filter((o) => !o.current).map((o) => o.object),
        action,
        resolutionOf(place, factory, proposal),
      ),
    );
  const before: ProposedObject[] = objects.flatMap(({ object, now }) =>
    now.version === null
      ? []
      : [{ kind: object.kind, metadata: { name: object.metadata.name, resourceVersion: now.version }, spec: now.spec }],
  );
  const revisions: string[] = [];
  const written: string[] = [];
  const against = yield* composedFor(place, factory, proposal);
  for (const { object } of objects) {
    const wrote = yield* Effect.result(objectWritten(place, factory, object, against));
    if (wrote._tag === 'Failure')
      return yield* door.write(
        withStatus(proposal, {
          phase: 'failed',
          before,
          revisions,
          written,
          message: `${object.kind} ${object.metadata.name} was refused as it was written: ${wrote.failure.message} What is named in written stands; ${doNext(resolutionOf(place, factory, proposal), 'propose the rest again')}.`,
        }),
      );
    revisions.push(wrote.success);
    written.push(`${object.kind} ${object.metadata.name}`);
  }
  return yield* door.write(withStatus(proposal, { phase: 'applied', before, revisions, message: 'applied as a new revision.' }));
});
