/**
 * The groups of the factory's proposals and the delegations over them (`ProposalsGroup`, `DelegationsGroup`), each in a factory's
 * namespace, added to the one `Api` (`api.ts`) beside the others.
 */
import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup } from 'effect/http-api';
import { Conflict, Failed, Forbidden, Invalid, listQuery, Missing, Unauthorized } from './api-errors.ts';
import { Proposal, ProposalCreate, ProposalList } from './proposal.ts';
import { Delegation, DelegationList, DelegationWrite } from './delegation.ts';

/** An object a namespace holds, by its namespace and its name. */
const cardParams = { namespace: Schema.String, name: Schema.String };

/** A namespace, for a list in it. */
const namespaceParams = { namespace: Schema.String };

/** The proposals and the delegations over them, and a page of each, named so that the document holds each as a component. */
const ProposalObject = Proposal.annotate({ identifier: 'Proposal' });
const ProposalListObject = ProposalList.annotate({ identifier: 'ProposalList' });
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
    query: listQuery,
    success: ProposalListObject,
    error: proposalErrors,
  }),
  HttpApiEndpoint.get('get', '/api/namespaces/:namespace/proposals/:name', {
    params: cardParams,
    success: ProposalObject,
    error: proposalErrors,
  }),
  HttpApiEndpoint.post('create', '/api/namespaces/:namespace/proposals', {
    params: namespaceParams,
    payload: ProposalCreate,
    success: ProposalObject.pipe(Schema.annotate({ httpApiStatus: 201 })),
    error: proposalErrors,
  }),
  HttpApiEndpoint.post('approve', '/api/namespaces/:namespace/proposals/:name/approve', {
    params: cardParams,
    success: ProposalObject,
    error: proposalErrors,
  }),
  HttpApiEndpoint.post('decline', '/api/namespaces/:namespace/proposals/:name/decline', {
    params: cardParams,
    success: ProposalObject,
    error: proposalErrors,
  }),
) {}

/** A factory's delegations, in its namespace, each named by its agent: listed, read, written whole and removed, by the person alone. */
export class DelegationsGroup extends HttpApiGroup.make('delegations').add(
  HttpApiEndpoint.get('list', '/api/namespaces/:namespace/delegations', {
    params: namespaceParams,
    query: listQuery,
    success: DelegationListObject,
    error: proposalErrors,
  }),
  HttpApiEndpoint.get('get', '/api/namespaces/:namespace/delegations/:name', {
    params: cardParams,
    success: DelegationObject,
    error: proposalErrors,
  }),
  HttpApiEndpoint.put('put', '/api/namespaces/:namespace/delegations/:name', {
    params: cardParams,
    payload: DelegationWrite,
    success: DelegationObject,
    error: proposalErrors,
  }),
  HttpApiEndpoint.delete('delete', '/api/namespaces/:namespace/delegations/:name', {
    params: cardParams,
    success: DelegationObject,
    error: proposalErrors,
  }),
) {}
