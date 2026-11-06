/**
 * The face of the person's rules for `auto`: a rule, its words and refusal, the list in force, and the facts a rule is judged on. The
 * commands over them are `nemia policy` (`auto.verb.ts`); the folder keeps the name of the store's `auto/`, which keeps its own so that no
 * confirmed rule is orphaned (`POLICY_FOLDER`).
 */
export {
  RULE_ANSWERS,
  CONDITIONS,
  DEFAULT_POLICY,
  POLICY_FOLDER,
  DEFAULT_ID,
  NO_FACTS,
  allowedBy,
  listInForce,
  ruleRefusal,
  ruleWords,
  CONDITION_WORDS,
  APPROVE_PROPOSAL,
  PROPOSAL_VERBS,
  isProposalRule,
  gateRules,
  proposalRulesIn,
  type RuleAnswer,
  type PolicyRule,
  type GateRule,
  type ProposalPolicyRule,
  type ProposalVerb,
  type Condition,
  type Facts,
} from './auto.ts';
export { factsOf, type Seen } from './facts.ts';
