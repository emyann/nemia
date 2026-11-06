/**
 * The Proposal: a change of a factory's definitions and wiring, said as the very objects apply takes, each at the `resourceVersion` it was
 * read at, served in the factory's namespace. Any agent of a factory proposes in its own; the person approves, or an agent at `auto`
 * within a Delegation and under a rule the person confirmed. Its `spec` is the objects, when it applies (`applyAt`) and why; its `status`
 * is the machinery's: the phase, who proposed and who approved, each change with what it does to access, whether the whole widens
 * access, the objects as they stood before it applied (undo proposes them back), the revisions it made, and a sentence.
 *
 * Beside it, the body a proposal is made with (`ProposalCreate`). Plain Schemas of JSON, as every object of this package is.
 */
import { Schema } from 'effect';
import { API_VERSION, ObjectMeta, listOf } from './meta.ts';
import { ACCESS_CHANGES, APPLY_AT, APPROVED_BY, CHANGE_VERBS, PROPOSABLE_KINDS, PROPOSAL_PHASES } from './words.ts';

/**
 * One object a proposal carries, as apply takes it: its kind, its name and the `resourceVersion` it was read at (absent for one it
 * makes), its spec as that kind's spec says it (absent where it is removed), and the verb (absent: `create` where no resourceVersion is
 * given, `update` where one is).
 */
export const ProposedObject = Schema.Struct({
  apiVersion: Schema.optionalKey(Schema.Literal(API_VERSION)),
  kind: Schema.Literals(PROPOSABLE_KINDS),
  metadata: Schema.Struct({
    name: Schema.String,
    namespace: Schema.optionalKey(Schema.String),
    resourceVersion: Schema.optionalKey(Schema.String),
  }),
  spec: Schema.optionalKey(Schema.Unknown),
  verb: Schema.optionalKey(Schema.Literals(CHANGE_VERBS)),
});
export type ProposedObject = typeof ProposedObject.Type;

/** What a proposal asks: its objects, when it applies (absent: at approval), and why, in the proposer's words. */
export const ProposalSpec = Schema.Struct({
  objects: Schema.Array(ProposedObject),
  applyAt: Schema.optionalKey(Schema.Literals(APPLY_AT)),
  why: Schema.optionalKey(Schema.String),
});
export type ProposalSpec = typeof ProposalSpec.Type;

/** One change a proposal makes, as the machinery reads it: the resource (`workflows`, `agents`, …), the name, the verb, its access. */
export const ProposalChange = Schema.Struct({
  resource: Schema.String,
  name: Schema.String,
  verb: Schema.Literals(CHANGE_VERBS),
  access: Schema.Literals(ACCESS_CHANGES),
});
export type ProposalChange = typeof ProposalChange.Type;

/** Who proposed: the agent of the session that called, and its run and step where it was a run's (all absent: the person). */
export const ProposedBy = Schema.Struct({
  agent: Schema.optionalKey(Schema.String),
  run: Schema.optionalKey(Schema.String),
  step: Schema.optionalKey(Schema.String),
});
export type ProposedBy = typeof ProposedBy.Type;

/** Who approved: the person, or an agent under the rule named. */
export const ApprovedByOf = Schema.Struct({
  by: Schema.Literals(APPROVED_BY),
  agent: Schema.optionalKey(Schema.String),
  rule: Schema.optionalKey(Schema.String),
  at: Schema.String,
});
export type ApprovedByOf = typeof ApprovedByOf.Type;

/**
 * The machinery's account of a proposal: its phase, who proposed and approved it, its changes, whether it widens access, the objects as
 * they stood before it applied (absent until it applies, and an object it made absent from it), the revisions it made, the objects it
 * wrote before a write failed (`written`), and a sentence saying why it stands where it does.
 */
export const ProposalStatus = Schema.Struct({
  phase: Schema.Literals(PROPOSAL_PHASES),
  proposedBy: ProposedBy,
  approvedBy: Schema.optionalKey(ApprovedByOf),
  changes: Schema.Array(ProposalChange),
  widens: Schema.Boolean,
  before: Schema.optionalKey(Schema.Array(ProposedObject)),
  revisions: Schema.optionalKey(Schema.Array(Schema.String)),
  written: Schema.optionalKey(Schema.Array(Schema.String)),
  message: Schema.optionalKey(Schema.String),
});
export type ProposalStatus = typeof ProposalStatus.Type;

/** A proposal, as an object. */
export const Proposal = Schema.Struct({
  apiVersion: Schema.Literal(API_VERSION),
  kind: Schema.Literal('Proposal'),
  metadata: ObjectMeta,
  spec: ProposalSpec,
  status: ProposalStatus,
});
export type Proposal = typeof Proposal.Type;

/** A page of a factory's proposals. */
export const ProposalList = listOf('Proposal', Proposal);
export type ProposalList = typeof ProposalList.Type;

/** A proposal made (`POST …/proposals`): its spec; the machinery names it and reads who proposed it from the caller. */
export const ProposalCreate = ProposalSpec;
export type ProposalCreate = typeof ProposalCreate.Type;
