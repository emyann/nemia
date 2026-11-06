/**
 * What the package's entry (`runner.ts`) names of proposals and delegations (`src/proposal/`, `src/delegation/`): the programs the api
 * serves, each taking its caller explicitly (`ProposalCaller`: the person, or an agent's session as `sessionCaller` answers it) and the
 * store's place; the doors and their files layers; and the refusal by who calls (`Forbidden`, with its reason, the api's 403).
 */
export { Forbidden } from './forbidden.ts';
export { PERSON, type Caller, type ProposalCaller } from './caller.ts';
export { proposeProgram, undoProgram } from './propose.verb.ts';
export { approveProgram, declineProgram, proposalGet, proposalsList } from './approve.verb.ts';
export type { ProposalNeeds, ProposalPlace } from './current.verb.ts';
export { ProposalDoor, proposalDoorFiles, type ProposalDoorShape } from './proposal.store.ts';
export { delegationGet, delegationPut, delegationRemove, delegationsList } from '../delegation/delegation.verb.ts';
export { DelegationDoor, delegationDoorFiles, type DelegationDoorShape } from '../delegation/delegation.store.ts';
