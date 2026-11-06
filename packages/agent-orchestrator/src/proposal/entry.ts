/**
 * What the package's entry (`runner.ts`) names of proposals and delegations (`src/proposal/`, `src/delegation/`): the programs the api serves, each taking its caller explicitly
 * (`ProposalCaller`, the person or an agent's session, which the api obtains from the session's token) and the store's place; the doors
 * and their files layers; the refusal by who calls (`Forbidden`, with its reason, the api's 403); the pure deciders and the pass.
 */
export { Forbidden } from './forbidden.ts';
export { PERSON, proposerOf, type Caller, type ProposalCaller } from './caller.ts';
export { proposeProgram, undoProgram, objectRefusal, verbOf } from './propose.verb.ts';
export { approveProgram, declineProgram, proposalGet, proposalsList, recordedRunState } from './approve.verb.ts';
export { applyProgram, type RunStateOf } from './apply.verb.ts';
export { proposalsPass, runStatesOf } from './pass.verb.ts';
export { currentOf, type Current, type ProposalNeeds, type ProposalPlace } from './current.verb.ts';
export { ProposalDoor, proposalDoorFiles, proposalFiles, type ProposalDoorShape } from './proposal.store.ts';
export { proposalApproval, mayPropose } from './approval.ts';
export { proposalApply, proposingRunOf, type RunState } from './apply.ts';
export { accessChange, accessOf } from './access.ts';
export { proposalRuleReach } from './rule.ts';
export { proposalDiagram, PROPOSAL_EDGES } from './machine.ts';
export { delegationGet, delegationObject, delegationPut, delegationRemove, delegationsList } from '../delegation/delegation.verb.ts';
export {
  DelegationDoor,
  delegationDoorFiles,
  delegationFiles,
  type DelegationDoorShape,
  type DelegationRecord,
} from '../delegation/delegation.store.ts';
