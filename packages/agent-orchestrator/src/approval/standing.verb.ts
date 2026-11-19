/**
 * What an agent stands on in a factory when it approves a proposal (`Standing`, `contracts/proposal-approval.contract.ts`): the factory's
 * level in force (`levelOfFactory`), the grants of the delegation the person wrote it there (`DelegationDoor`, none by default), and the
 * rules for auto the person confirmed it over that factory's proposals (`proposalRulesIn`). Read afresh at each approval and each pass.
 */
import { StoreRoot } from '../config/root.store.ts';
import { Effect } from 'effect';
import type { Proposal } from 'objects';
import type { ProposalRule } from '../../contracts/proposal-approval.contract.ts';
import { tried } from '../runtime-client.ts';
import { levelOfFactory } from '../level/levels.verb.ts';
import { listInForce, proposalRulesIn } from '../auto/index.ts';
import { readConfirmed } from '../auto/auto.store.ts';
import { DelegationDoor } from '../delegation/delegation.store.ts';

/**
 * `agent`'s standing in `factory`, in the store `home`: none of its confirmed rules read where the person's list does not read.
 * @param home The store's root.
 * @param agent The agent's name.
 * @param factory The factory's name.
 */
export const standingOf = (home: string, agent: string, factory: string) =>
  Effect.gen(function* () {
    const level = yield* levelOfFactory(factory).pipe(Effect.provideService(StoreRoot, home));
    const delegation = yield* (yield* DelegationDoor).delegations.read(factory, agent);
    const list = yield* tried(() => listInForce(readConfirmed(home, agent)?.rules)).pipe(Effect.orElseSucceed(() => []));
    const rules: ProposalRule[] = proposalRulesIn(list, factory).map((r) => ({
      id: r.id,
      resources: r.resources,
      resourceNames: r.resourceNames,
      verbs: r.verbs,
      widens: r.widens,
      proposedBy: r.proposedBy,
    }));
    return { level, grants: delegation?.spec.rules ?? [], rules };
  });

/**
 * A proposal as approval reads it, waiting or not as `waiting` says.
 * @param proposal The proposal as the store holds it.
 * @param waiting Whether it waits on an approval.
 */
export const factsOf = (proposal: Proposal, waiting: boolean) => ({
  factory: proposal.metadata.namespace ?? '',
  proposedBy: proposal.status.proposedBy.agent ?? null,
  waiting,
  changes: proposal.status.changes.map(({ resource, name, verb }) => ({ resource, name, verb })),
  widens: proposal.status.widens,
});
