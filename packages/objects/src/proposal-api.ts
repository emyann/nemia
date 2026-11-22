/**
 * The groups of the factory's proposals and the delegations over them (`ProposalsGroup`, `DelegationsGroup`), each in a factory's
 * namespace, added to the one `Api` (`api.ts`) beside the others.
 */
import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from 'effect/http-api';
import { Conflict, Failed, Forbidden, Invalid, listQuery, Missing, Unauthorized } from './api-errors.ts';
import { Proposal, ProposalCreate, ProposalList } from './proposal.ts';
import { Delegation, DelegationList, DelegationWrite } from './delegation.ts';
import { Table } from './table.ts';

/** An object a namespace holds, by its namespace and its name. */
const cardParams = {
  namespace: Schema.String.annotate({ description: "The factory's namespace." }),
  name: Schema.String.annotate({ description: "The object's name in the namespace." }),
};

/**
 * The query of a list of proposals: a list's (`listQuery`), and `fieldSelector`, the proposals in one phase, in Kubernetes' spelling:
 * `status.phase=<phase>` (or `==`), or every other phase by `!=`; an empty one, or none, every proposal. Any other is refused `Invalid`,
 * naming the forms it takes.
 */
const proposalListQuery = {
  ...listQuery,
  fieldSelector: Schema.optionalKey(
    Schema.String.annotate({
      description:
        "A fieldSelector in Kubernetes' spelling that keeps the proposals in one phase (status.phase=waiting, or ==), or in every other (status.phase!=applied); empty or absent, every proposal.",
    }),
  ),
};

/** A namespace, for a list in it. */
const namespaceParams = { namespace: cardParams.namespace };

/** The proposals and the delegations over them, and a page of each, named so that the document holds each as a component. */
const ProposalObject = Proposal.annotate({ identifier: 'Proposal' });
const ProposalListObject = ProposalList.annotate({ identifier: 'ProposalList' });
/** A page of proposals, or the same page as a `Table` where the request asks for one, as the agents'. */
const ProposalListOrTable = [ProposalListObject, Table] as const;
const DelegationObject = Delegation.annotate({ identifier: 'Delegation' });
const DelegationListObject = DelegationList.annotate({ identifier: 'DelegationList' });

/** What a proposal's and a delegation's verbs refuse with: an object's refusals, a caller refused or unknown, and a write that failed. */
const proposalErrors = [Missing, Conflict, Invalid, Forbidden, Unauthorized, Failed];

/**
 * A factory's proposals, in its namespace: listed (and watched), read, made by any caller of the factory, approved by the person or by a
 * delegated agent at auto, and declined by the person. Who calls is the request's session token (`Authorization: Bearer`), none being the
 * person.
 */
export class ProposalsGroup extends HttpApiGroup.make('proposals').add(
  HttpApiEndpoint.get('list', '/api/namespaces/:namespace/proposals', {
    params: namespaceParams,
    query: proposalListQuery,
    success: ProposalListOrTable,
    error: proposalErrors,
  }).annotate(
    OpenApi.Description,
    "Lists a factory's proposals in its namespace, a page at a time, read by anyone; ?fieldSelector=status.phase=<phase> keeps those in one phase. Answers a ProposalList, or the same page as a Table where the request asks for one: a row per proposal, none of its objects.",
  ),
  HttpApiEndpoint.get('get', '/api/namespaces/:namespace/proposals/:name', {
    params: cardParams,
    success: ProposalObject,
    error: proposalErrors,
  }).annotate(
    OpenApi.Description,
    "Reads one of a factory's proposals by its name: the change of its definitions or wiring it proposes, who proposed it and where it stands. Answers the Proposal.",
  ),
  HttpApiEndpoint.post('create', '/api/namespaces/:namespace/proposals', {
    params: namespaceParams,
    payload: ProposalCreate,
    success: ProposalObject.pipe(Schema.annotate({ httpApiStatus: 201 })),
    error: proposalErrors,
  }).annotate(
    OpenApi.Description,
    "Proposes a change of a factory's definitions or wiring, from any caller of the factory, who is read off the request's session token and never off the body. Answers the Proposal with a 201.",
  ),
  HttpApiEndpoint.post('approve', '/api/namespaces/:namespace/proposals/:name/approve', {
    params: cardParams,
    success: ProposalObject,
    error: proposalErrors,
  }).annotate(
    OpenApi.Description,
    "Approves a factory's proposal, by the person or by an agent at auto within its delegation and under a confirmed rule, and applies it at once where it is due. Answers the Proposal as it stands after.",
  ),
  HttpApiEndpoint.post('decline', '/api/namespaces/:namespace/proposals/:name/decline', {
    params: cardParams,
    success: ProposalObject,
    error: proposalErrors,
  }).annotate(OpenApi.Description, "Declines a factory's proposal, by the person alone. Answers the Proposal as it stands after."),
) {}

/** A factory's delegations, in its namespace, each named by its agent: listed, read, written whole and removed, by the person alone. */
export class DelegationsGroup extends HttpApiGroup.make('delegations').add(
  HttpApiEndpoint.get('list', '/api/namespaces/:namespace/delegations', {
    params: namespaceParams,
    query: listQuery,
    success: [DelegationListObject, Table],
    error: proposalErrors,
  }).annotate(
    OpenApi.Description,
    "Lists a factory's delegations in its namespace, a page at a time, each named by its agent, read by anyone. Answers a DelegationList, or the same page as a Table where the request asks for one.",
  ),
  HttpApiEndpoint.get('get', '/api/namespaces/:namespace/delegations/:name', {
    params: cardParams,
    success: DelegationObject,
    error: proposalErrors,
  }).annotate(
    OpenApi.Description,
    "Reads one of a factory's delegations by its agent's name: what that agent may approve of the factory's proposals at auto. Answers the Delegation.",
  ),
  HttpApiEndpoint.put('put', '/api/namespaces/:namespace/delegations/:name', {
    params: cardParams,
    payload: DelegationWrite,
    success: DelegationObject,
    error: proposalErrors,
  }).annotate(
    OpenApi.Description,
    "Writes a factory's delegation to an agent whole, by the person alone; an agent's session is Forbidden. Answers the Delegation as it is now.",
  ),
  HttpApiEndpoint.delete('delete', '/api/namespaces/:namespace/delegations/:name', {
    params: cardParams,
    success: DelegationObject,
    error: proposalErrors,
  }).annotate(
    OpenApi.Description,
    "Removes a factory's delegation to an agent, by the person alone; an agent's session is Forbidden whether or not one is there. Answers the Delegation it removed.",
  ),
) {}
