/**
 * A factory's proposals and delegations, as the board reads and judges them (`apps/api/src/proposals/`): the factory's proposals
 * (`proposalsQuery`), one proposal (`proposalQuery`), its approval and its decline, the person's; and the factory's delegations
 * (`delegationsQuery`), each written whole and removed by the person alone. The board sends no session token, so every write is the
 * person's.
 */
import { queryOptions } from '@tanstack/react-query';
import type { Delegation, DelegationWrite, Proposal } from 'objects';
import { pace } from '../feed.ts';
import { ReadRefusal } from './read.ts';
import { delegations, proposals } from './objects.ts';

/** The key of the factory `factory`'s proposals, which a judgement invalidates exactly. */
export const proposalsKey = (factory: string) => ['proposals', factory] as const;

/** The key of the proposal `name` of `factory`, which a judgement sets from its answer. */
export const proposalKey = (factory: string, name: string) => ['proposal', factory, name] as const;

/** The proposals of the factory `factory`, in the api's order: polled, since an agent proposes and a run's end applies. */
export const proposalsQuery = (factory: string) =>
  queryOptions({
    queryKey: proposalsKey(factory),
    queryFn: async (): Promise<readonly Proposal[]> => (await proposals.list(factory)).items,
    refetchInterval: () => pace(15_000),
  });

/** The proposal `name` of `factory`: polled, and not asked again where the api answers it is not there. */
export const proposalQuery = (factory: string, name: string) =>
  queryOptions({
    queryKey: proposalKey(factory, name),
    queryFn: () => proposals.get(factory, name),
    refetchInterval: () => pace(15_000),
    retry: (count: number, error: Error) => !(error instanceof ReadRefusal && error.status === 404) && count < 3,
  });

/** Approve the proposal `name` of `factory`, the person's: the proposal as it then reads. Rejects with a `WriteRefusal` in the api's words. */
export const approveProposal = (factory: string, name: string): Promise<Proposal> => proposals.approve(factory, name);

/** Decline the proposal `name` of `factory`, the person's: the proposal as it then reads. Rejects with a `WriteRefusal` in the api's words. */
export const declineProposal = (factory: string, name: string): Promise<Proposal> => proposals.decline(factory, name);

/** The key of the factory `factory`'s delegations, which a write invalidates. */
export const delegationsKey = (factory: string) => ['delegations', factory] as const;

/** The delegations of the factory `factory`, one per agent it lets approve proposals. */
export const delegationsQuery = (factory: string) =>
  queryOptions({
    queryKey: delegationsKey(factory),
    queryFn: async (): Promise<readonly Delegation[]> => (await delegations.list(factory)).items,
  });

/** Write the delegation of `agent` in `factory` whole as `spec`, the person's. Rejects with a `WriteRefusal` in the api's words. */
export const putDelegation = (factory: string, agent: string, spec: DelegationWrite): Promise<Delegation> =>
  delegations.put(factory, agent, spec);

/** Remove the delegation of `agent` in `factory`, the person's. Rejects with a `WriteRefusal` in the api's words. */
export const removeDelegation = (factory: string, agent: string): Promise<Delegation> => delegations.delete(factory, agent);
