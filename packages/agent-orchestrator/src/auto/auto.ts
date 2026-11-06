/**
 * What a person lets an agent answer unasked at `auto`, as rules the machinery holds: a rule (`PolicyRule`) names an answer, the steps it
 * covers and the conditions it needs (`CONDITIONS`), judged on a run's facts at the moment of the call (`Facts`, `allowedBy`); the
 * builtin rule, decide when all agree (`DEFAULT_POLICY`); the list in force (`listInForce`); a rule in the person's words, made from its
 * fields (`ruleWords`); and the refusal of a rule that is none (`ruleRefusal`).
 *
 * Pure, and naming no agent: admission reads a list for whichever agent it is given (`admissionOf`). The files are `auto.store.ts`'s, the
 * facts `facts.ts`'s, the commands `auto.verb.ts`'s.
 */

/**
 * The conditions a rule may need, each a fact admission reads of a run at the call: the step's agent recommends (`recommends`), its check
 * passed (`checked`), every reviewer accepted (`accepted`), no step is past its budget (`withinBudget`), and nothing is left open
 * (`nothingOpen`).
 */
export const CONDITIONS = ['recommends', 'checked', 'accepted', 'withinBudget', 'nothingOpen'] as const;

/** A condition a rule may need. */
export type Condition = (typeof CONDITIONS)[number];

/** The answers a rule may give unasked: a step approved at its gate, and a step tried again. */
export const RULE_ANSWERS = ['approve', 'retry'] as const;

/** An answer a rule may give unasked. */
export type RuleAnswer = (typeof RULE_ANSWERS)[number];

/**
 * A rule at a gate: its `id`; the `answer` it gives unasked; the `steps` it covers, by name, every step where absent; the conditions it
 * needs (`when`), all of them; a dollar line the run's spend stays under (`under`), none where absent; and where it came from (`from`):
 * the builtin default, or an agent's proposal the person confirmed.
 */
export type GateRule = {
  id: string;
  answer: RuleAnswer;
  steps?: string[];
  when: Condition[];
  under?: number;
  from?: 'default' | 'proposed';
};

/** The answer of a rule under which the agent approves a proposal of its factory unasked (`contracts/proposal-approval.contract.ts`). */
export const APPROVE_PROPOSAL = 'approve-proposal';

/** What a proposal does to one object, Kubernetes' verbs for a write. */
export const PROPOSAL_VERBS = ['create', 'update', 'delete'] as const;

/** A verb of a proposal's change. */
export type ProposalVerb = (typeof PROPOSAL_VERBS)[number];

/**
 * A rule under which the agent approves a proposal of one factory unasked at auto: the `factory`; what it covers, as a delegation's grant
 * does (`resources`, `resourceNames` — every name where empty — and `verbs`); whether it takes a proposal that widens access (`widens`,
 * said outright); and the agents whose proposals it takes (`proposedBy`, every agent where empty). It reaches no further than the agent's
 * delegation: `nemia policy confirm` refuses one that does (`proposalRuleReach`).
 */
export type ProposalPolicyRule = {
  id: string;
  answer: typeof APPROVE_PROPOSAL;
  factory: string;
  resources: string[];
  resourceNames: string[];
  verbs: ProposalVerb[];
  widens: boolean;
  proposedBy: string[];
  from?: 'proposed';
};

/** A rule the person confirms for auto: at a gate, or over a factory's proposals. */
export type PolicyRule = GateRule | ProposalPolicyRule;

/** Whether `rule` approves proposals rather than answering at a gate. Pure. */
export const isProposalRule = (rule: PolicyRule): rule is ProposalPolicyRule => rule.answer === APPROVE_PROPOSAL;

/** The rules of `list` that answer at a gate. Pure. */
export const gateRules = (list: readonly PolicyRule[]): GateRule[] =>
  list.filter((rule): rule is GateRule => !isProposalRule(rule));

/** The rules of `list` that approve the proposals of `factory`. Pure. */
export const proposalRulesIn = (list: readonly PolicyRule[], factory: string): ProposalPolicyRule[] =>
  list.filter((rule): rule is ProposalPolicyRule => isProposalRule(rule) && rule.factory === factory);

/** A run's facts at a call, for one step: each condition, whether it holds, and what the run has spent (`spend`, in dollars). */
export type Facts = Record<Condition, boolean> & { spend: number };

/** The facts of a run that does not read: no condition holds, so no rule allows. */
export const NO_FACTS: Facts = {
  recommends: false,
  checked: false,
  accepted: false,
  withinBudget: false,
  nothingOpen: false,
  spend: Number.POSITIVE_INFINITY,
};

/**
 * The folder of the store the rules for auto are kept in, one writer to each of its files (`auto.store.ts`). It keeps its name though the
 * commands that write it are `nemia policy`: a folder renamed would orphan every rule a person confirmed.
 */
export const POLICY_FOLDER = 'auto';

/** The id of the builtin rule. */
export const DEFAULT_ID = 'default';

/** The builtin rule, decide when all agree: approve any step unasked when every condition holds. */
export const DEFAULT_POLICY: GateRule = { id: DEFAULT_ID, answer: 'approve', when: [...CONDITIONS], from: 'default' };

/** The list in force: the builtin rule while the person has confirmed none, else their confirmed list, which replaces it. Pure. */
export const listInForce = (confirmed: readonly PolicyRule[] | undefined): PolicyRule[] =>
  confirmed === undefined ? [DEFAULT_POLICY] : [...confirmed];

/** Whether `rule` allows `answer` at `step` in `facts`: its answer, a step it covers, each condition it needs, and under its line. */
const allows = (rule: PolicyRule, answer: string, step: string, facts: Facts): boolean =>
  !isProposalRule(rule) &&
  rule.answer === answer &&
  (rule.steps === undefined || rule.steps.includes(step)) &&
  rule.when.every((c) => facts[c]) &&
  (rule.under === undefined || facts.spend < rule.under);

/** The first rule of `list` that allows `answer` at `step` in `facts`, or undefined where none does. Pure. */
export const allowedBy = (
  list: readonly PolicyRule[],
  { answer, step }: { answer: string; step: string },
  facts: Facts,
): PolicyRule | undefined => list.find((rule) => allows(rule, answer, step, facts));

/** Each condition as a rule says it, in the words of a person who knows nothing of how Nemia reads it. */
export const CONDITION_WORDS: Record<Condition, string> = {
  recommends: 'its agent recommends it',
  checked: 'its check passed',
  accepted: 'its review passed',
  withinBudget: 'it stayed within budget',
  nothingOpen: 'nothing waits on you',
};

/** Each answer as a rule says it, around the steps it names: `Approve land`, `Try design again`. */
const ANSWER_WORDS: Record<RuleAnswer, (steps: string) => string> = {
  approve: (steps) => `Approve ${steps}`,
  retry: (steps) => `Try ${steps} again`,
};

/** Words joined as a sentence lists them: `a`, `a and b`, `a, b and c`. */
const listed = (words: readonly string[]): string =>
  words.length < 2 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;

/**
 * A rule in the person's words, made from its fields alone, so what they read is what admission holds: the steps by their names, as what
 * is approved or tried again, then the conditions as a person says them — `Approve land on its own once its agent recommends it, its
 * review passed, it stayed within budget and nothing waits on you.`, `Try any step again on its own once it has cost under $5.`,
 * `Approve design and land on their own, whatever their state.` Pure.
 */
export function ruleWords(rule: PolicyRule): string {
  if (isProposalRule(rule)) return proposalRuleWords(rule);
  const several = rule.steps !== undefined && rule.steps.length > 1;
  const steps = rule.steps === undefined ? 'any step' : listed(rule.steps);
  const when = [...rule.when.map((c) => CONDITION_WORDS[c]), ...(rule.under === undefined ? [] : [`it has cost under $${rule.under}`])];
  const own = several ? 'on their own' : 'on its own';
  return `${ANSWER_WORDS[rule.answer](steps)} ${own}${when.length ? ` once ${listed(when)}` : `, whatever ${several ? 'their' : 'its'} state`}.`;
}

/**
 * A proposal rule in the person's words, from its fields alone: `Approve proposals in acme that update workflows build or review, made by
 * seldon, that never widen access.` Pure.
 */
function proposalRuleWords(rule: ProposalPolicyRule): string {
  const names = rule.resourceNames.length ? ` ${listed(rule.resourceNames)}` : '';
  const by = rule.proposedBy.length ? `, made by ${listed(rule.proposedBy)}` : ', made by any agent or you';
  const widening = rule.widens ? ', even where they widen access' : ', that never widen access';
  return `Approve proposals in ${rule.factory} that ${listed(rule.verbs)} ${listed(rule.resources)}${names}${by}${widening}.`;
}

/** A value read as a list of names, or undefined where it is not one. */
const namesOf = (value: unknown): string[] | undefined =>
  Array.isArray(value) && value.every((v) => typeof v === 'string' && v.trim() !== '') ? value : undefined;

/** Why the fields of `rule` other than its id and answer are no rule's, or undefined where they are. */
function shapeRefusal(rule: Record<string, unknown>, at: string): string | undefined {
  if (rule.steps !== undefined && (namesOf(rule.steps) === undefined || (rule.steps as string[]).length === 0))
    return `${at}: steps is a list of step names, or left out for every step.`;
  const when = rule.when;
  if (!Array.isArray(when) || when.some((c) => !(CONDITIONS as readonly unknown[]).includes(c)))
    return `${at}: when is a list of the conditions ${CONDITIONS.join(', ')}; ${JSON.stringify(when)} is not.`;
  if (new Set(when).size !== when.length) return `${at}: when names a condition twice.`;
  if (rule.under !== undefined && !(typeof rule.under === 'number' && Number.isFinite(rule.under) && rule.under > 0))
    return `${at}: under is the dollars the run's spend stays under, a number above 0, or left out.`;
  return undefined;
}

/**
 * Why `rule` is no rule an agent may propose, or undefined where it is one: an id that is no name or is the default's, an answer that is
 * none of `RULE_ANSWERS`, steps that are no list of names, a condition that is none of `CONDITIONS` or named twice, and a line that is no
 * dollars above 0. `at` names it in the refusal. Pure.
 */
export function ruleRefusal(rule: unknown, at: string): string | undefined {
  if (typeof rule !== 'object' || rule === null || Array.isArray(rule))
    return `${at} is no rule: { "id", "answer", "steps"?, "when", "under"? }.`;
  const r = rule as Record<string, unknown>;
  if (typeof r.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(r.id))
    return `${at}: id is a name of lowercase letters, digits and dashes; ${JSON.stringify(r.id)} is not.`;
  if (r.id === DEFAULT_ID) return `${at}: the id ${DEFAULT_ID} is the builtin rule: give the rule an id of its own.`;
  if (r.answer === APPROVE_PROPOSAL) return proposalShapeRefusal(r, at);
  if (!(RULE_ANSWERS as readonly unknown[]).includes(r.answer))
    return `${at}: answer is one of ${[...RULE_ANSWERS, APPROVE_PROPOSAL].join(', ')}; ${JSON.stringify(r.answer)} is not one a rule may give unasked.`;
  return shapeRefusal(r, at);
}

/** Why the fields of a proposal rule are no rule's, or undefined where they are. */
function proposalShapeRefusal(r: Record<string, unknown>, at: string): string | undefined {
  const form = '{ "id", "answer": "approve-proposal", "factory", "resources", "resourceNames", "verbs", "widens", "proposedBy" }';
  if (typeof r.factory !== 'string' || !r.factory.trim()) return `${at}: factory names the factory whose proposals it approves: ${form}.`;
  const resources = namesOf(r.resources);
  if (resources === undefined || resources.length === 0)
    return `${at}: resources is a list of what it covers (workflows, agents, skills, hires, mcpservers, factories): ${form}.`;
  if (namesOf(r.resourceNames) === undefined) return `${at}: resourceNames is a list of names, empty for every name: ${form}.`;
  const verbs = r.verbs;
  if (!Array.isArray(verbs) || verbs.length === 0 || verbs.some((v) => !(PROPOSAL_VERBS as readonly unknown[]).includes(v)))
    return `${at}: verbs is a list of ${PROPOSAL_VERBS.join(', ')}: ${form}.`;
  if (typeof r.widens !== 'boolean') return `${at}: widens says outright, true or false, whether it takes a proposal that widens access.`;
  if (namesOf(r.proposedBy) === undefined) return `${at}: proposedBy is a list of agents, empty for every agent and you: ${form}.`;
  return undefined;
}
