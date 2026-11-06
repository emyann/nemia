/**
 * A proposal's phases as a state machine (`PROPOSAL_EDGES`), the drawing of the moves the programs make: proposed, it waits; the person,
 * or an agent within its delegation, approves it or the person declines it; approved, a pass applies it, leaves it waiting on its run,
 * marks it stale, sends it back to the person or drops it (`proposalApply`), and a write refused midway leaves it failed. `proposalDiagram`
 * prints it for the package's README, between `diagram:proposal` markers. Pure.
 */
import type { ProposalPhase } from 'objects';
import type { ApplyAction } from '../../contracts/proposal-apply.contract.ts';

/** One move of a proposal: from a phase to another, by the fact that makes it. */
export type ProposalEdge = { readonly from: ProposalPhase; readonly to: ProposalPhase; readonly event: string };

/**
 * Every phase, in the order the diagram names them. Typed over `ProposalPhase`, so a phase added there with no state fails the typecheck.
 */
export const PROPOSAL_STATES: Readonly<Record<ProposalPhase, true>> = {
  waiting: true,
  approved: true,
  applied: true,
  declined: true,
  stale: true,
  dropped: true,
  failed: true,
};

/** The phase a proposal is made in. */
export const PROPOSAL_INITIAL: ProposalPhase = 'waiting';

/** Every move a proposal makes, by the fact that makes it. */
export const PROPOSAL_EDGES: readonly ProposalEdge[] = [
  { from: 'waiting', to: 'approved', event: 'approved, by the person or under a rule within a delegation' },
  { from: 'waiting', to: 'declined', event: 'declined by the person' },
  { from: 'approved', to: 'declined', event: 'declined by the person' },
  { from: 'approved', to: 'applied', event: 'applied, every object written' },
  { from: 'approved', to: 'failed', event: 'a write refused midway' },
  { from: 'approved', to: 'stale', event: 'an object moved since it was read' },
  { from: 'approved', to: 'waiting', event: "an agent's approval lapsed" },
  { from: 'approved', to: 'dropped', event: 'its run called off' },
];

/** The phase an action of `proposalApply` moves an approved proposal to, or null where it stays; an apply may end `failed` instead. */
export const PHASE_OF_ACTION: Readonly<Record<ApplyAction, ProposalPhase | null>> = {
  apply: 'applied',
  wait: null,
  stale: 'stale',
  'back-to-person': 'waiting',
  drop: 'dropped',
};

/** The phases no move leaves. */
export const proposalFinal = (): ProposalPhase[] =>
  (Object.keys(PROPOSAL_STATES) as ProposalPhase[]).filter((s) => !PROPOSAL_EDGES.some((e) => e.from === s));

/** A proposal's lifecycle as a Mermaid state diagram: each phase named once, then the moves, then the phases it ends in. */
export const proposalDiagram = (): string =>
  [
    'stateDiagram-v2',
    `  [*] --> ${PROPOSAL_INITIAL}: proposed`,
    ...(Object.keys(PROPOSAL_STATES) as ProposalPhase[]).map((s) => `  state "${s}" as ${s}`),
    ...PROPOSAL_EDGES.map((e) => `  ${e.from} --> ${e.to}: ${e.event}`),
    ...proposalFinal().map((s) => `  ${s} --> [*]`),
  ].join('\n');
