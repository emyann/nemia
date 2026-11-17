/**
 * A factory's proposals and delegations, as the board reads and judges them (`apps/api/src/proposals/`): the factory's proposals
 * (`proposalsQuery`), those that wait (`waitingProposalsQuery`), one proposal (`proposalQuery`), its approval and its decline, the
 * person's; and the factory's delegations (`delegationsQuery`), each written whole and removed by the person alone. The board sends no
 * session token, so every write is the person's.
 */
import { queryOptions } from '@tanstack/react-query';
import type { Delegation, DelegationWrite, Proposal } from 'objects';
import { pace } from '../feed.ts';
import { retryUnlessGone } from './gone.ts';
import { agents, delegations, proposals } from './objects.ts';

/**
 * The key of the factory `factory`'s proposals, which a judgement invalidates with every key under it (`waitingProposalsKey`).
 * @param factory The factory's name.
 */
export const proposalsKey = (factory: string) => ['proposals', factory] as const;

/** The selector of the proposals that wait on an approval, as a ProposalList's `?fieldSelector=` spells it. */
export const WAITING_SELECTOR = 'status.phase=waiting';

/**
 * The key of the factory `factory`'s proposals that wait, under its proposals' (`proposalsKey`), so a judgement reads it again.
 * @param factory The factory's name.
 */
const waitingProposalsKey = (factory: string) => [...proposalsKey(factory), 'waiting'] as const;

/**
 * The key of the proposal `name` of `factory`, which a judgement sets from its answer.
 * @param factory The factory's name.
 * @param name The proposal's name.
 */
export const proposalKey = (factory: string, name: string) => ['proposal', factory, name] as const;

/**
 * The proposals of the factory `factory`, in the api's order: polled, since an agent proposes and a run's end applies.
 * @param factory The factory's name.
 */
export const proposalsQuery = (factory: string) =>
  queryOptions({
    queryKey: proposalsKey(factory),
    queryFn: async (): Promise<readonly Proposal[]> => (await proposals.list(factory)).items,
    refetchInterval: () => pace(15_000),
  });

/**
 * The proposals of the factory `factory` that wait on an approval (`WAITING_SELECTOR`), asked of the api by phase so a reader that counts
 * them never reads the whole list, each proposal's objects and status whole: the factory pane's line. Polled as the whole list is.
 * @param factory The factory's name.
 */
export const waitingProposalsQuery = (factory: string) =>
  queryOptions({
    queryKey: waitingProposalsKey(factory),
    queryFn: async (): Promise<readonly Proposal[]> => (await proposals.list(factory, WAITING_SELECTOR)).items,
    refetchInterval: () => pace(15_000),
  });

/**
 * The proposal `name` of `factory`: polled, and not asked again where the api answers it is not there (`retryUnlessGone`), whose retry is
 * typed by an `Error` here so the query's error stays one.
 * @param factory The factory's name.
 * @param name The proposal's name.
 */
export const proposalQuery = (factory: string, name: string) =>
  queryOptions({
    queryKey: proposalKey(factory, name),
    queryFn: () => proposals.get(factory, name),
    refetchInterval: () => pace(15_000),
    retry: (failures: number, error: Error) => retryUnlessGone(failures, error),
  });

/**
 * Approve the proposal `name` of `factory`, the person's: the proposal as it then reads. Rejects with a `WriteRefusal`.
 * @param factory The factory's name.
 * @param name The proposal's name.
 */
export const approveProposal = (factory: string, name: string): Promise<Proposal> => proposals.approve(factory, name);

/**
 * Decline the proposal `name` of `factory`, the person's: the proposal as it then reads. Rejects with a `WriteRefusal`.
 * @param factory The factory's name.
 * @param name The proposal's name.
 */
export const declineProposal = (factory: string, name: string): Promise<Proposal> => proposals.decline(factory, name);

/**
 * The key of the factory `factory`'s delegations, which a write invalidates.
 * @param factory The factory's name.
 */
export const delegationsKey = (factory: string) => ['delegations', factory] as const;

/**
 * The delegations of the factory `factory`, one per agent it lets approve proposals.
 * @param factory The factory's name.
 */
export const delegationsQuery = (factory: string) =>
  queryOptions({
    queryKey: delegationsKey(factory),
    queryFn: async (): Promise<readonly Delegation[]> => (await delegations.list(factory)).items,
  });

/**
 * Write the delegation of `agent` in `factory` whole as `spec`, the person's. Rejects with a `WriteRefusal` in the api's words.
 * @param factory The factory's name.
 * @param agent The name of the agent the delegation lets approve proposals.
 * @param spec The delegation, written whole.
 */
export const putDelegation = (factory: string, agent: string, spec: DelegationWrite): Promise<Delegation> =>
  delegations.put(factory, agent, spec);

/**
 * Remove the delegation of `agent` in `factory`, the person's. Rejects with a `WriteRefusal` in the api's words.
 * @param factory The factory's name.
 * @param agent The name of the agent the delegation lets approve proposals.
 */
export const removeDelegation = (factory: string, agent: string): Promise<Delegation> => delegations.delete(factory, agent);

/** An agent a delegation may name: its file's name, and its `role:` line, null where it has none. */
export type DelegableAgent = { readonly name: string; readonly role: string | null };

/**
 * The agents the factory `factory` serves, which its delegations may name, once each by name, in the order of their names, with the role
 * the first of each name says: read on the settings page's visit.
 * @param factory The factory's name.
 */
export const delegableAgentsQuery = (factory: string) =>
  queryOptions({
    queryKey: ['delegable-agents', factory],
    queryFn: async (): Promise<readonly DelegableAgent[]> => {
      const byName = new Map<string, DelegableAgent>();
      for (const a of await agents.list(factory))
        if (!byName.has(a.metadata.name)) byName.set(a.metadata.name, { name: a.metadata.name, role: a.spec.role ?? null });
      return [...byName.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    },
  });
