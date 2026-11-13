/**
 * `nemia policy`, entries of the command table over an agent's rules for `auto`: the list in force read beside what the agent proposed
 * and the custom instruction it read (`POLICY`); a proposal written, the agent's own (`POLICY_PROPOSE`); a rule confirmed or dropped, the
 * person's, asked of them every time an agent calls it (`POLICY_CONFIRM`, `POLICY_DROP`). Any agent's: the name is the one given.
 */
import { StoreRoot } from '../config/root.store.ts';
import { Effect, Schema } from 'effect';
import { POLICY_CONFIRM_WORDS, POLICY_PROPOSE_WORDS, POLICY_RM_WORDS, POLICY_WORDS, PolicyProposal, PolicyRuleConfirm } from 'objects';
import { tried } from '../runtime-client.ts';
import type { Served } from '../command/entry.verb.ts';
import { agentNameRefusal } from '../agents/agents.ts';
import { AgentDoor } from '../agents/agent-door.store.ts';
import { AgentName } from '../agents/agents.model.ts';
import { Invalid } from '../refusal/refusal.ts';
import {
  DEFAULT_POLICY,
  gateRules,
  isProposalRule,
  listInForce,
  ruleRefusal,
  ruleWords,
  type GateRule,
  type PolicyRule,
  type ProposalPolicyRule,
} from './auto.ts';
import { confirmedFile, confirmRule, digestOf, dropRule, proposedFile, readConfirmed, readProposed, writeProposed } from './auto.store.ts';
import { DelegationDoor } from '../delegation/delegation.store.ts';
import { proposalRuleReach } from '../approval/index.ts';

/** A rule with its words, as the person reads it. */
export type WordedRule<R extends PolicyRule = GateRule> = R & { words: string };

/**
 * An agent's rules, read: the agent, the file of the person's list, whether the builtin rule is in force for want of one (`isDefault`),
 * the rules in force, what the agent proposed, each rule saying whether it is in force, with the words it keeps as guidance and whether the
 * custom instruction changed since (`stale`), or null for nothing proposed; the custom instruction, or null for none; and the builtin
 * rule, with its words, to be confirmed again (`builtin`). A rule for approving proposals (`approve-proposal`) is said apart, in
 * `proposalRules` beside each `rules`, so a reader of a gate's rules reads gate rules alone.
 */
export type PolicyList = {
  agent: string;
  file: string;
  isDefault: boolean;
  rules: WordedRule[];
  proposalRules: WordedRule<ProposalPolicyRule>[];
  proposed: {
    file: string;
    at: string;
    rules: (WordedRule & { confirmed: boolean })[];
    proposalRules: (WordedRule<ProposalPolicyRule> & { confirmed: boolean })[];
    guidance: string[];
    stale: boolean;
  } | null;
  instruction: string | null;
  builtin: WordedRule;
};

/** What `nemia policy` takes: the agent whose rules to read. */
export const PolicyInput = Schema.Struct({ name: Schema.String });
export type PolicyInput = typeof PolicyInput.Type;

/** What `nemia policy rm` takes: the agent, and the id of the rule taken out of force. */
export const RuleInput = Schema.Struct({ name: Schema.String, id: Schema.String });
export type RuleInput = typeof RuleInput.Type;

/** What `nemia policy confirm` takes: the agent, the rule's id, and its words as the person read them (`objects`' `PolicyRuleConfirm`). */
export const ConfirmInput = Schema.Struct({ ...PolicyRuleConfirm.fields, name: Schema.String, id: Schema.String });
export type ConfirmInput = typeof ConfirmInput.Type;

/** The refusal (`Invalid`) of a name that is no agent's, or nothing: what `check` says, for a caller that runs none. */
const agentNamed = (name: string) => {
  const wrong = agentNameRefusal(name);
  return wrong === undefined ? Effect.void : Effect.fail(new Invalid({ message: wrong }));
};

/** A rule with its words. */
const worded = <R extends PolicyRule>(rule: R): WordedRule<R> => ({ ...rule, words: ruleWords(rule) });

/** The proposal rules of `list`. */
const proposalRulesOf = (list: readonly PolicyRule[]): ProposalPolicyRule[] => list.filter(isProposalRule);

/**
 * `agent`'s rules in the store `home`, composed from the person's list, the agent's proposal and its custom instruction, `instruction`
 * (`instructionOf`).
 */
export function policyListOf(home: string, agent: string, instruction: string | undefined): PolicyList {
  const confirmed = readConfirmed(home, agent);
  const rules = listInForce(confirmed?.rules);
  const proposed = readProposed(home, agent);
  return {
    agent,
    file: confirmedFile(home, agent),
    isDefault: confirmed === undefined,
    rules: gateRules(rules).map(worded),
    proposalRules: proposalRulesOf(rules).map(worded),
    proposed:
      proposed === undefined
        ? null
        : {
            file: proposedFile(home, agent),
            at: proposed.at,
            rules: gateRules(proposed.rules).map((r) => ({ ...worded(r), confirmed: rules.some((c) => c.id === r.id) })),
            proposalRules: proposalRulesOf(proposed.rules).map((r) => ({
              ...worded(r),
              confirmed: rules.some((c) => c.id === r.id),
            })),
            guidance: proposed.guidance,
            stale: proposed.digest !== digestOf(instruction),
          },
    instruction: instruction ?? null,
    builtin: worded(DEFAULT_POLICY),
  };
}

/** The custom instruction for `agent`, as the Agent door reads it, whatever place names the agent: a policy is any agent's. */
const instructionOf = Effect.fnUntraced(function* (agent: string) {
  return yield* (yield* AgentDoor).custom.read(AgentName.read(agent));
});

/** `agent`'s rules in the store `home`, its custom instruction read through the Agent door. */
const listed = Effect.fnUntraced(function* (home: string, agent: string) {
  return policyListOf(home, agent, yield* instructionOf(agent));
});

/** `nemia policy <agent>`: an agent's rules for `auto`, the list in force beside its proposal and its custom instruction. */
export const POLICY: Served<PolicyList, PolicyInput> = {
  ...POLICY_WORDS,
  input: PolicyInput,
  handler: ({ name }) => Effect.flatMap(StoreRoot, (home) => Effect.andThen(agentNamed(name), listed(home, name))),
};

/** The refusal of a proposal that is none. */
const proposalRefusal = (why: string): Invalid =>
  new Invalid({ message: `${why}. A proposal is JSON: { "rules": [{ "id", "answer", "steps"?, "when", "under"? }], "guidance": ["…"] }.` });

/**
 * The proposal in `words`: its rules and its guidance. Refused (`Invalid`): no JSON, a rule that is none, an id twice, guidance not words.
 */
export function proposalOf(words: string): { rules: PolicyRule[]; guidance: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(words);
  } catch {
    throw proposalRefusal('the proposal is not JSON');
  }
  const { rules, guidance = [] } = (typeof raw === 'object' && raw !== null ? raw : {}) as { rules?: unknown; guidance?: unknown };
  if (!Array.isArray(rules)) throw proposalRefusal('the proposal has no list of rules');
  const bad = rules.map((rule, i) => ruleRefusal(rule, `rule ${i + 1}`)).find((why) => why !== undefined);
  if (bad) throw proposalRefusal(bad);
  const ids = rules.map((r: PolicyRule) => r.id);
  if (new Set(ids).size !== ids.length) throw proposalRefusal('the proposal names a rule id twice');
  if (!Array.isArray(guidance) || guidance.some((g) => typeof g !== 'string' || !g.trim()))
    throw proposalRefusal('its guidance is a list of words the machinery cannot hold');
  const kept = (rule: PolicyRule): PolicyRule =>
    isProposalRule(rule)
      ? {
          id: rule.id,
          answer: rule.answer,
          factory: rule.factory,
          resources: rule.resources,
          resourceNames: rule.resourceNames,
          verbs: rule.verbs,
          widens: rule.widens,
          proposedBy: rule.proposedBy,
        }
      : {
          id: rule.id,
          answer: rule.answer,
          ...(rule.steps === undefined ? {} : { steps: rule.steps }),
          when: rule.when,
          ...(rule.under === undefined ? {} : { under: rule.under }),
        };
  return { rules: rules.map(kept), guidance };
}

/**
 * What `nemia policy propose` takes: the agent, and its proposal's JSON text (`objects`' `PolicyProposal`), which the command line's runner
 * reads from `--file` and the api is sent.
 */
export const ProposeInput = Schema.Struct({ ...PolicyProposal.fields, name: Schema.String });
export type ProposeInput = typeof ProposeInput.Type;

/**
 * `nemia policy propose <agent> --file <path>|-`: what the agent proposes from the custom instruction, its own file, over what it proposed.
 * The api serves it as the nemia group's `propose` (`PUT /api/policy/:name/proposal`), sent the words themselves. Refused (`Invalid`),
 * writing nothing: a name that is no agent's, and words that are no proposal (`proposalOf`).
 */
export const POLICY_PROPOSE: Served<PolicyList, ProposeInput> = {
  ...POLICY_PROPOSE_WORDS,
  input: ProposeInput,
  handler: ({ name, words }) =>
    Effect.flatMap(StoreRoot, (home) =>
      Effect.andThen(
        agentNamed(name),
        Effect.gen(function* () {
          const { rules, guidance } = yield* tried(() => proposalOf(words));
          const digest = digestOf(yield* instructionOf(name));
          yield* tried(() => writeProposed(home, name, { at: new Date().toISOString(), rules, guidance, digest }));
          return yield* listed(home, name);
        }),
      ),
    ),
};

/**
 * A proposal rule `agent` proposed under `id` refused (`Invalid`) where it reaches past the agent's delegation in its factory
 * (`proposalRuleReach`), naming each pair of resource and verb and the delegation to write; any other rule, and one within it, goes on.
 */
const withinDelegation = Effect.fnUntraced(function* (home: string, agent: string, id: string) {
  const rule = (yield* tried(() => readProposed(home, agent)))?.rules.find((r) => r.id === id);
  if (rule === undefined || !isProposalRule(rule)) return;
  const delegation = yield* (yield* DelegationDoor).delegations.read(rule.factory, agent);
  const past = proposalRuleReach(rule, delegation?.spec.rules ?? []);
  if (past.length === 0) return;
  const pairs = past.map((p) => `${p.verb} ${p.resource}`).join(', ');
  return yield* Effect.fail(
    new Invalid({
      message: `${agent}'s rule ${id} reaches past what its delegation in ${rule.factory} grants (${pairs}), and is not confirmed: write the delegation first, a PUT of /api/namespaces/${rule.factory}/delegations/${agent} granting them, or ask ${agent} to propose a narrower rule.`,
    }),
  );
});

/** The refusal of a confirm with no words. */
const confirmWordless = (agent: string): string =>
  `nemia policy confirm takes the rule's words as you read them, so what is confirmed is what you read: --words '<words>', printed by nemia policy ${agent}.`;

/**
 * `nemia policy confirm <agent> <id> --words <words>`: a rule the agent proposed put in force as the person read it, the person's; asked of
 * them every time an agent calls it. Refused: a confirm with no words.
 */
export const POLICY_CONFIRM: Served<PolicyList, ConfirmInput> = {
  ...POLICY_CONFIRM_WORDS,
  input: ConfirmInput,
  handler: ({ name, id, words }) =>
    Effect.flatMap(StoreRoot, (home) =>
      Effect.andThen(
        agentNamed(name),
        Effect.gen(function* () {
          if (!words.trim()) return yield* Effect.fail(new Invalid({ message: confirmWordless(name) }));
          yield* withinDelegation(home, name, id);
          yield* tried(() => confirmRule(home, name, id, words, new Date()));
          return yield* listed(home, name);
        }),
      ),
    ),
};

/** `nemia policy rm <agent> <id>`: a rule taken out of force, the default among them, the person's; asked of them every time. */
export const POLICY_DROP: Served<PolicyList, RuleInput> = {
  ...POLICY_RM_WORDS,
  input: RuleInput,
  handler: ({ name, id }) =>
    Effect.flatMap(StoreRoot, (home) =>
      Effect.andThen(
        agentNamed(name),
        Effect.andThen(
          tried(() => dropRule(home, name, id, new Date())),
          listed(home, name),
        ),
      ),
    ),
};

/** The entries of `nemia policy`, in the order `nemia`'s help lists them. */
export const POLICY_ENTRIES = [POLICY, POLICY_PROPOSE, POLICY_CONFIRM, POLICY_DROP] as const;
