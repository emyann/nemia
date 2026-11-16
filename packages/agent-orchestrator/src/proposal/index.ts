/** The face of `proposal/`: its pure code, the proposal's machine and its list's selector by phase, re-exported by name. */
export {
  PHASE_OF_ACTION,
  PROPOSAL_EDGES,
  PROPOSAL_INITIAL,
  PROPOSAL_STATES,
  proposalDiagram,
  proposalFinal,
  type ProposalEdge,
} from './machine.ts';
export { phaseTakes, proposalPhaseSelector, type ProposalPhaseSelector } from './phase-selector.ts';
