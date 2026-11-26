/**
 * The Proposal: a change of a factory's definitions and wiring, said as the very objects apply takes, each at the `resourceVersion` it was
 * read at, served in the factory's namespace. Any agent of a factory proposes in its own; the person approves, or an agent at `auto`
 * within a Delegation and under a rule the person confirmed. Its `spec` is the objects, when it applies (`applyAt`) and why; its `status`
 * is the machinery's: the phase, who proposed and who approved, each change with what it does to access, whether the whole widens
 * access, the objects as they stood before it applied (undo proposes them back), the revisions it made, and a sentence.
 *
 * Beside it, the body a proposal is made with (`ProposalCreate`). Plain Schemas of JSON, as every object of this package is.
 */
import { Schema, Struct } from 'effect';
import { API_VERSION, ObjectMeta, describedOne, listOf } from './meta.ts';
import { ACCESS_CHANGES, APPLY_AT, APPROVED_BY, CHANGE_VERBS, PROPOSABLE_KINDS, PROPOSAL_PHASES } from './words.ts';

/**
 * One object a proposal carries, as apply takes it: its kind, its name and the `resourceVersion` it was read at (absent for one it
 * makes), its spec as that kind's spec says it (absent where it is removed), and the verb (absent: `create` where no resourceVersion is
 * given, `update` where one is).
 */
export const ProposedObject = Schema.Struct({
  apiVersion: Schema.optionalKey(Schema.Literal(API_VERSION).annotate({ description: 'The version the object is under, nemia/v1.' })),
  kind: Schema.Literals(PROPOSABLE_KINDS).annotate({ description: 'The kind of the object.' }),
  metadata: Schema.Struct({
    name: Schema.String.annotate({ description: "The object's name." }),
    namespace: Schema.optionalKey(Schema.String.annotate({ description: "The object's namespace." })),
    resourceVersion: Schema.optionalKey(
      Schema.String.annotate({ description: 'The version the object was read at; absent for one the proposal makes.' }),
    ),
  }).annotate({ description: 'Which object it is, and the version it was read at.' }),
  spec: Schema.optionalKey(
    describedOne(Schema.Unknown, "The object's spec as its kind's spec says it; absent where the object is removed."),
  ),
  verb: Schema.optionalKey(
    Schema.Literals(CHANGE_VERBS).annotate({
      description: 'What the proposal does to the object; absent: create where no resourceVersion is given, update where one is.',
    }),
  ),
});
export type ProposedObject = typeof ProposedObject.Type;

/** What a proposal asks: its objects, when it applies (absent: at approval), and why, in the proposer's words. */
export const ProposalSpec = Schema.Struct({
  objects: Schema.Array(ProposedObject).annotate({ description: 'The objects the proposal applies, each as apply takes it.' }),
  applyAt: Schema.optionalKey(Schema.Literals(APPLY_AT).annotate({ description: 'When the proposal applies; absent: at approval.' })),
  why: Schema.optionalKey(Schema.String.annotate({ description: "Why it is proposed, in the proposer's words." })),
}).annotate({
  description:
    "What the proposal asks: the objects it applies, each as apply takes it, when it applies (at approval where absent), and why, in the proposer's words.",
});
export type ProposalSpec = typeof ProposalSpec.Type;

/** One change a proposal makes, as the machinery reads it: the resource (`workflows`, `agents`, …), the name, the verb, its access. */
export const ProposalChange = Schema.Struct({
  resource: Schema.String.annotate({ description: 'The resource it changes: `workflows`, `agents`, and so on.' }),
  name: Schema.String.annotate({ description: 'The name of the object it changes.' }),
  verb: Schema.Literals(CHANGE_VERBS).annotate({ description: 'What it does to the object.' }),
  access: Schema.Literals(ACCESS_CHANGES).annotate({ description: 'What the change does to access.' }),
});
export type ProposalChange = typeof ProposalChange.Type;

/** Who proposed: the agent of the session that called, and its run and step where it was a run's (all absent: the person). */
export const ProposedBy = Schema.Struct({
  agent: Schema.optionalKey(Schema.String.annotate({ description: 'The agent of the session that called; absent for the person.' })),
  run: Schema.optionalKey(
    Schema.String.annotate({ description: "The id of the run the session was a step of; absent where it was no run's." }),
  ),
  step: Schema.optionalKey(Schema.String.annotate({ description: "The name of the step the session was; absent where it was no run's." })),
});
export type ProposedBy = typeof ProposedBy.Type;

/** Who approved: the person, or an agent under the rule named. */
export const ApprovedByOf = Schema.Struct({
  by: Schema.Literals(APPROVED_BY).annotate({ description: 'Who approved it: the person, or an agent under a rule.' }),
  agent: Schema.optionalKey(Schema.String.annotate({ description: 'The agent that approved it, where one did.' })),
  rule: Schema.optionalKey(Schema.String.annotate({ description: 'The id of the rule the agent approved it under.' })),
  at: Schema.String.annotate({ description: 'When it was approved, as an ISO 8601 time.' }),
});
export type ApprovedByOf = typeof ApprovedByOf.Type;

/**
 * The machinery's account of a proposal: its phase, who proposed and approved it, its changes, whether it widens access, the objects as
 * they stood before it applied (absent until it applies, and an object it made absent from it), the revisions it made, the objects it
 * wrote before a write failed (`written`), and a sentence saying why it stands where it does.
 */
export const ProposalStatus = Schema.Struct({
  phase: Schema.Literals(PROPOSAL_PHASES).annotate({ description: 'Where the proposal stands in its life.' }),
  proposedBy: ProposedBy.annotate({ description: 'Who proposed it.' }),
  approvedBy: Schema.optionalKey(ApprovedByOf.annotate({ description: 'Who approved it, and when; absent until it is approved.' })),
  changes: Schema.Array(ProposalChange).annotate({ description: 'Each change it makes, with what it does to access.' }),
  widens: Schema.Boolean.annotate({ description: 'Whether the whole proposal widens access.' }),
  before: Schema.optionalKey(
    Schema.Array(ProposedObject).annotate({
      description:
        'The objects as they stood before it applied, which undo proposes back; absent until it applies, and an object it made is absent from it.',
    }),
  ),
  revisions: Schema.optionalKey(Schema.Array(Schema.String).annotate({ description: 'The revisions it made.' })),
  written: Schema.optionalKey(Schema.Array(Schema.String).annotate({ description: 'The objects it wrote before a write failed.' })),
  message: Schema.optionalKey(Schema.String.annotate({ description: 'A sentence saying why the proposal stands where it does.' })),
}).annotate({
  description:
    "The machinery's account of the proposal: its phase, who proposed and approved it, its changes and whether it widens access, the objects as they stood before it applied, the revisions it made, and why it stands where it does.",
});
export type ProposalStatus = typeof ProposalStatus.Type;

/** A proposal, as an object. */
export const Proposal = Schema.Struct({
  apiVersion: Schema.Literal(API_VERSION).annotate({ description: 'The version the object is served under, nemia/v1.' }),
  kind: Schema.Literal('Proposal').annotate({
    description: "What the object is: a Proposal, a change of a factory's definitions and wiring waiting on an approval.",
  }),
  metadata: ObjectMeta,
  spec: ProposalSpec,
  status: ProposalStatus,
});
export type Proposal = typeof Proposal.Type;

/** An object of a proposal as a list serves it: which object it is and what is done to it, without its spec. */
const ListedObject = ProposedObject.mapFields(Struct.omit(['spec']));

/** A proposal as a list serves it: its object without its objects' specs, which a read of the proposal answers. */
const ProposalListed = Schema.Struct({
  ...Proposal.fields,
  spec: ProposalSpec.mapFields((fields) => ({
    ...fields,
    objects: Schema.Array(ListedObject).annotate({
      description:
        'The objects the proposal applies, each by its kind, name and verb, without its spec, which a read of the proposal answers.',
    }),
  })).annotate({
    description:
      "What the proposal asks, its objects without their specs: the objects it applies, when it applies, and why, in the proposer's words.",
  }),
  status: ProposalStatus.mapFields((fields) => ({
    ...fields,
    before: Schema.optionalKey(
      Schema.Array(ListedObject).annotate({
        description:
          'The objects as they stood before it applied, without their specs, which a read of the proposal answers; absent until it applies.',
      }),
    ),
  })).annotate({
    description:
      "The machinery's account of the proposal, the objects before it applied without their specs: its phase, who proposed and approved it, its changes and whether it widens access, the revisions it made, and why it stands where it does.",
  }),
}).annotate({ description: "A proposal as a list serves it, without its files' content (LISTED_WITHOUT)." });
type ProposalListed = typeof ProposalListed.Type;

/** A page of a factory's proposals, each without its objects' specs. */
export const ProposalList = listOf('Proposal', ProposalListed);
export type ProposalList = typeof ProposalList.Type;

/** A proposal made (`POST …/proposals`): its spec; the machinery names it and reads who proposed it from the caller. */
export const ProposalCreate = ProposalSpec;
export type ProposalCreate = typeof ProposalCreate.Type;
