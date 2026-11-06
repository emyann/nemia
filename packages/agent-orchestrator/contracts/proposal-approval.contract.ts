/**
 * Whether a caller's approval of a proposal goes on (agent-orchestrator, src/approval/approval.ts, `proposalApproval`), and by what: the
 * person's, or an agent's under a rule the person confirmed and within the delegation the person wrote. Any agent of a factory may
 * propose; approving is scoped as a Kubernetes Role bound to a ServiceAccount is: an agent approves only what its delegation grants, by
 * resource, name and verb, every change of the proposal covered, nothing held by default; only where the factory is at `auto`, as gates
 * are answered; only under one of its confirmed rules that covers every change, and that says outright it takes a widening where the
 * proposal widens access; and never a proposal its own agent made, from any session of it. The person approves any proposal still
 * waiting. Each fact read here is the machinery's — the changes, `widens` (`accessChange`), the proposer, the level — never an agent's
 * claim. Called at approval, and again at apply on an agent's approval (`proposalApply`). Its reason is the api's answer; its words are
 * nobody's law. Pure.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { ApprovedBy, CallerKind, ChangeVerb as ObjectsChangeVerb, Level, ProposalRefusal } from 'objects';

/** What a proposal does to one object: makes it, writes it, or removes it. Kubernetes' verbs for a write. */
export type ChangeVerb = ObjectsChangeVerb;

/** One change a proposal carries: the resource (`workflows`, `agents`, `hires`, …), the object's name, and the verb. */
export type Change = { readonly resource: string; readonly name: string; readonly verb: ChangeVerb };

/**
 * What a delegation grants, as a Kubernetes PolicyRule: the resources, the names among them (every name where empty), and the verbs.
 */
export type Grant = {
  readonly resources: readonly string[];
  readonly resourceNames: readonly string[];
  readonly verbs: readonly ChangeVerb[];
};

/**
 * A rule the person confirmed, under which an agent approves unasked at auto: what it covers, as a grant does; whether it takes a proposal
 * that widens access (`widens`, said outright); and the agents whose proposals it takes (every agent where empty).
 */
export type ProposalRule = Grant & { readonly id: string; readonly widens: boolean; readonly proposedBy: readonly string[] };

/**
 * Who calls: the person (no session's token), or an agent's session the store started, by its agent and its factory — null for a session
 * of the store's own (Nemia's), which works in every factory and holds there only what that factory's delegation grants it.
 */
export type Caller =
  | { readonly kind: Extract<CallerKind, 'person'> }
  | { readonly kind: Extract<CallerKind, 'agent'>; readonly agent: string; readonly factory: string | null };

/** Whether `caller` acts in `factory`: the person anywhere, a factory's session in its own, a store-wide session in any. */
const actsIn = (caller: Caller, factory: string): boolean =>
  caller.kind === 'person' || caller.factory === null || caller.factory === factory;

const mayProposeSpec = spec<(caller: Caller, factory: string) => boolean>({
  ensures: {
    anyoneInItsOwn: {
      description: 'The person proposes in any factory, a session of a factory in its own and no other, a store-wide session in any',
      condition: ({ input: [caller, factory], output }) => output === actsIn(caller, factory),
    },
  },
});

/** `mayPropose`'s type, which `src/approval/approval.ts` takes: whether a caller may make a proposal in a factory's namespace. */
export type MayPropose = Implementation<typeof mayProposeSpec>;

/** The level a factory is worked at, the store's where it says none. */
export type ProposalLevel = Level;

/**
 * A proposal as approval reads it: its factory, who proposed it (null: the person), whether it waits, its changes, and whether it widens.
 */
export type ProposalFacts = {
  readonly factory: string;
  readonly proposedBy: string | null;
  readonly waiting: boolean;
  readonly changes: readonly Change[];
  readonly widens: boolean;
};

/** What the calling agent stands on in the proposal's factory: the level, its delegation's grants, and its confirmed rules. */
export type Standing = { readonly level: ProposalLevel; readonly grants: readonly Grant[]; readonly rules: readonly ProposalRule[] };

/** Why an approval is refused: every refusal of a proposal but `person-only`, which refuses a write, never an approval. */
export type ApprovalRefusedReason = Exclude<ProposalRefusal, 'person-only'>;

/** An approval: the person's, an agent's under the rule named, or refused with its reason. */
export type ApprovalVerdict =
  | { readonly kind: 'approved'; readonly by: Extract<ApprovedBy, 'person'> }
  | { readonly kind: 'approved'; readonly by: Extract<ApprovedBy, 'rule'>; readonly rule: string }
  | { readonly kind: 'refused'; readonly reason: ApprovalRefusedReason };

/** Whether `grant` covers `change`: its resource, its name (every name where the grant names none), and its verb. */
const covers = (grant: Grant, change: Change): boolean =>
  grant.resources.includes(change.resource) &&
  (grant.resourceNames.length === 0 || grant.resourceNames.includes(change.name)) &&
  grant.verbs.includes(change.verb);

/** Whether every change is covered by some grant. */
const delegated = (grants: readonly Grant[], changes: readonly Change[]): boolean =>
  changes.every((change) => grants.some((grant) => covers(grant, change)));

/** Whether `rule` takes the proposal: every change covered, its proposer among those it names, and a widening said outright. */
const ruleTakes = (rule: ProposalRule, p: ProposalFacts): boolean =>
  p.changes.every((change) => covers(rule, change)) &&
  (rule.proposedBy.length === 0 || (p.proposedBy !== null && rule.proposedBy.includes(p.proposedBy))) &&
  (!p.widens || rule.widens);

/** Whether some rule of `rules` takes the proposal. */
const someRuleTakes = (rules: readonly ProposalRule[], p: ProposalFacts): boolean => rules.some((rule) => ruleTakes(rule, p));

const proposalApprovalSpec = spec<(caller: Caller, proposal: ProposalFacts, standing: Standing) => ApprovalVerdict>({
  ensures: {
    onlyWhileWaiting: {
      description: 'A proposal no longer waiting (approved, applied, declined, stale or dropped) is approved by no one',
      condition: ({ input: [, p], output }) => p.waiting || (output.kind === 'refused' && output.reason === 'not-waiting'),
    },
    personApprovesWhatWaits: {
      description: 'The person approves any proposal that waits, whoever proposed it, whatever the level',
      condition: ({ input: [caller, p], output }) =>
        !(caller.kind === 'person' && p.waiting) || (output.kind === 'approved' && output.by === 'person'),
    },
    onlyThePersonIsThePerson: {
      description: "An agent's approval is never the person's",
      condition: ({ input: [caller], output }) => caller.kind === 'person' || !(output.kind === 'approved' && output.by === 'person'),
    },
    ownFactoryAlone: {
      description: "An agent approves nothing of another factory's",
      condition: ({ input: [caller, p], output }) => actsIn(caller, p.factory) || output.kind === 'refused',
    },
    neverItsOwnAgents: {
      description: 'An agent never approves a proposal its own agent made, from any session of it',
      condition: ({ input: [caller, p], output }) => caller.kind === 'person' || p.proposedBy !== caller.agent || output.kind === 'refused',
    },
    agentsOnlyAtAuto: {
      description: 'At manual and semi-auto every proposal waits on the person: an agent approves only at auto',
      condition: ({ input: [caller, , standing], output }) =>
        caller.kind === 'person' || standing.level === 'auto' || output.kind === 'refused',
    },
    withinItsDelegation: {
      description: 'An agent approves only where its delegation grants every change the proposal carries',
      condition: ({ input: [caller, p, standing], output }) =>
        caller.kind === 'person' || delegated(standing.grants, p.changes) || output.kind === 'refused',
    },
    underARuleThatTakesIt: {
      description:
        "An agent's approval names a confirmed rule that covers every change, takes its proposer, and says outright it takes a widening where the proposal widens",
      condition: ({ input: [caller, p, standing], output }) =>
        caller.kind === 'person' ||
        output.kind === 'refused' ||
        (output.by === 'rule' && standing.rules.some((rule) => rule.id === output.rule && ruleTakes(rule, p))),
    },
    agentApprovesWhenAllHold: {
      description:
        'An agent of the factory approves a waiting proposal another agent or the person made, at auto, within its delegation, under a rule that takes it',
      condition: ({ input: [caller, p, standing], output }) =>
        !(
          caller.kind === 'agent' &&
          p.waiting &&
          actsIn(caller, p.factory) &&
          p.proposedBy !== caller.agent &&
          standing.level === 'auto' &&
          delegated(standing.grants, p.changes) &&
          someRuleTakes(standing.rules, p)
        ) || output.kind === 'approved',
    },
  },
  open: ['output.reason', 'output.rule'],
});

/** `proposalApproval`'s type, which `src/approval/approval.ts` takes. */
export type ProposalApproval = Implementation<typeof proposalApprovalSpec>;
