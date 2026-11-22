/**
 * A factory's proposals and delegations, as the board reads and judges them (`apps/api/src/proposals/`): the factory's proposals
 * (`proposalsQuery`) and those that wait (`waitingProposalsQuery`), each a row of the list's `Table` (`ProposalRow`), none of its objects,
 * so the list reads whatever their number and size; one proposal whole (`proposalQuery`), its approval and its decline, the
 * person's; and the factory's delegations (`delegationsQuery`), each written whole and removed by the person alone. The board sends no
 * session token, so every write is the person's.
 */
import { queryOptions } from '@tanstack/react-query';
import { Schema } from 'effect';
import { PROPOSAL_PHASES, type DelegationWrite, type ProposalPhase, type TableColumnDefinition } from 'objects';
import { pace } from '../feed.ts';
import { decoded } from './read.ts';
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

/** A proposal as its list's row: its name, its phase, whether it widens access, the first line of why, and when it was made. */
export type ProposalRow = {
  readonly name: string;
  readonly phase: ProposalPhase;
  readonly widens: boolean;
  readonly why: string;
  readonly creationTimestamp: string;
};

/** What the board reads of a row: its cells by their column's name, and its object's metadata. */
const ProposalRowRead = Schema.Struct({
  Name: Schema.String,
  Phase: Schema.Literals(PROPOSAL_PHASES),
  Widens: Schema.Boolean,
  Why: Schema.String,
  metadata: Schema.Struct({ creationTimestamp: Schema.String }),
});

/** A row's object as the board reads it: where it carries metadata, that metadata. */
const metadataOf = (object: unknown) => (typeof object === 'object' && object !== null ? Reflect.get(object, 'metadata') : undefined);

/**
 * The rows of the factory `factory`'s proposals that `fieldSelector` keeps, every one for none, each decoded (`decoded`): a row the board
 * does not read is an `UnreadAnswer` naming its key.
 */
async function proposalRows(factory: string, fieldSelector?: string) {
  const route = `GET /api/namespaces/${factory}/proposals`;
  const table = await proposals.table(factory, fieldSelector);
  return table.items.map((row, at) => {
    const value = Object.fromEntries([
      ...table.columnDefinitions.map((column: TableColumnDefinition, i) => [column.name, row.cells[i]] as const),
      ['metadata', metadataOf(row.object)],
    ]);
    const read = decoded(`${route} (row ${at})`, ProposalRowRead, value);
    return {
      name: read.Name,
      phase: read.Phase,
      widens: read.Widens,
      why: read.Why,
      creationTimestamp: read.metadata.creationTimestamp,
    } satisfies ProposalRow;
  });
}

/**
 * The proposals of the factory `factory`, in the api's order: polled, since an agent proposes and a run's end applies.
 * @param factory The factory's name.
 */
export const proposalsQuery = (factory: string) =>
  queryOptions({
    queryKey: proposalsKey(factory),
    queryFn: () => proposalRows(factory),
    refetchInterval: () => pace(15_000),
  });

/**
 * The proposals of the factory `factory` that wait on an approval (`WAITING_SELECTOR`), asked of the api by phase, as rows of the list's
 * `Table`, so a reader that counts them never reads a proposal's objects: the factory pane's line. Polled as the whole list is.
 * @param factory The factory's name.
 */
export const waitingProposalsQuery = (factory: string) =>
  queryOptions({
    queryKey: waitingProposalsKey(factory),
    queryFn: () => proposalRows(factory, WAITING_SELECTOR),
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
export const approveProposal = (factory: string, name: string) => proposals.approve(factory, name);

/**
 * Decline the proposal `name` of `factory`, the person's: the proposal as it then reads. Rejects with a `WriteRefusal`.
 * @param factory The factory's name.
 * @param name The proposal's name.
 */
export const declineProposal = (factory: string, name: string) => proposals.decline(factory, name);

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
    queryFn: async () => (await delegations.list(factory)).items,
  });

/**
 * Write the delegation of `agent` in `factory` whole as `spec`, the person's. Rejects with a `WriteRefusal` in the api's words.
 * @param factory The factory's name.
 * @param agent The name of the agent the delegation lets approve proposals.
 * @param spec The delegation, written whole.
 */
export const putDelegation = (factory: string, agent: string, spec: DelegationWrite) => delegations.put(factory, agent, spec);

/**
 * Remove the delegation of `agent` in `factory`, the person's. Rejects with a `WriteRefusal` in the api's words.
 * @param factory The factory's name.
 * @param agent The name of the agent the delegation lets approve proposals.
 */
export const removeDelegation = (factory: string, agent: string) => delegations.delete(factory, agent);

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
    queryFn: async () => {
      const byName = new Map<string, DelegableAgent>();
      for (const a of await agents.list(factory))
        if (!byName.has(a.metadata.name)) byName.set(a.metadata.name, { name: a.metadata.name, role: a.spec.role ?? null });
      return [...byName.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    },
  });
