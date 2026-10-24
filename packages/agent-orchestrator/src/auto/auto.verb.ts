/**
 * `nemia policy`, entries of the command table over an agent's rules for `auto`: the list in force read beside what the agent proposed
 * and the custom instruction it read (`POLICY`); a proposal written, the agent's own (`POLICY_PROPOSE`); a rule confirmed or dropped, the
 * person's, asked of them every time an agent calls it (`POLICY_CONFIRM`, `POLICY_DROP`). Any agent's: the name is the one given.
 */
import { tried } from '../runtime-client.ts';
import type { Args, Spec } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import { agentNameRefusal } from '../agents/agents.ts';
import { readCustomInstructions } from '../agents/read.store.ts';
import { HOME } from '../record/record.store.ts';
import { Invalid } from '../refusal/refusal.ts';
import { DEFAULT_AUTO, listInForce, ruleRefusal, ruleWords, type AutoRule } from './auto.ts';
import { confirmedFile, confirmRule, digestOf, dropRule, proposedFile, readConfirmed, readProposed, writeProposed } from './auto.store.ts';

/** A rule with its words, as the person reads it. */
export type WordedRule = AutoRule & { words: string };

/**
 * An agent's rules, read: the agent, the file of the person's list, whether the builtin rule is in force for want of one (`isDefault`),
 * the rules in force, what the agent proposed, each rule saying whether it is in force, with the words it keeps as guidance and whether the
 * custom instruction changed since (`stale`), or null for nothing proposed; the custom instruction, or null for none; and the builtin
 * rule, with its words, to be confirmed again (`builtin`).
 */
export type PolicyList = {
  agent: string;
  file: string;
  isDefault: boolean;
  rules: WordedRule[];
  proposed: {
    file: string;
    at: string;
    rules: (WordedRule & { confirmed: boolean })[];
    guidance: string[];
    stale: boolean;
  } | null;
  instruction: string | null;
  builtin: WordedRule;
};

/** The agent's name in `args`. */
const agentIn = (args: Args): string => String(args.name ?? '');

/** The rule's id in `args`. */
const idIn = (args: Args): string => String(args.id ?? '');

/** The words of the rule the person read in `args`. */
const wordsIn = (args: Args): string => String(args.words ?? '');

/** A rule with its words. */
const worded = (rule: AutoRule): WordedRule => ({ ...rule, words: ruleWords(rule) });

/** `agent`'s rules in the store `home`, composed from the person's list, the agent's proposal and its custom instruction. */
export function policyListOf(home: string, agent: string): PolicyList {
  const confirmed = readConfirmed(home, agent);
  const rules = listInForce(confirmed?.rules);
  const proposed = readProposed(home, agent);
  const instruction = readCustomInstructions(home, agent);
  return {
    agent,
    file: confirmedFile(home, agent),
    isDefault: confirmed === undefined,
    rules: rules.map(worded),
    proposed:
      proposed === undefined
        ? null
        : {
            file: proposedFile(home, agent),
            at: proposed.at,
            rules: proposed.rules.map((r) => ({ ...worded(r), confirmed: rules.some((c) => c.id === r.id) })),
            guidance: proposed.guidance,
            stale: proposed.digest !== digestOf(instruction),
          },
    instruction: instruction ?? null,
    builtin: worded(DEFAULT_AUTO),
  };
}

/** The lines `nemia policy` prints of an agent's rules. */
function listLines(list: PolicyList): string[] {
  const inForce = list.rules.length
    ? list.rules.map((r) => `  ${r.id}${r.from === 'default' ? ' (default)' : ''}: ${r.words}`)
    : ['  none: every answer is asked'];
  const lines = [
    `${list.agent}, rules in force at auto${list.isDefault ? ', the default for want of any you confirmed' : ''}:`,
    ...inForce,
  ];
  if (list.proposed === null) return [...lines, `${list.agent} proposed none: nemia policy propose ${list.agent} --file <path>.`];
  const p = list.proposed;
  return [
    ...lines,
    `proposed at ${p.at}${p.stale ? ', before the custom instruction last changed' : ''}:`,
    ...p.rules.map((r) => `  ${r.id}${r.confirmed ? ' (in force)' : ''}: ${r.words}`),
    ...(p.guidance.length ? ['kept as guidance, which the machinery cannot hold:', ...p.guidance.map((g) => `  ${g}`)] : []),
    `confirm one with nemia policy confirm ${list.agent} <id> --words '<its words, as read here>'; drop one in force with nemia policy drop ${list.agent} <id>.`,
  ];
}

/** The spec of a command taking an agent's name and nothing else. */
const agentSpec = (name: string): Spec => ({
  positionals: [{ key: 'name', takes: 'required', kind: 'name' }],
  flags: [],
  unknown: (arg) => `nemia ${name} takes an agent's name, not ${arg}: nemia ${name} <agent>.`,
});

/** The spec of a command taking an agent's name and a rule's id. */
const ruleSpec = (name: string): Spec => ({
  positionals: [
    { key: 'name', takes: 'required', kind: 'name' },
    { key: 'id', takes: 'required', kind: 'name' },
  ],
  flags: [],
  unknown: (arg) => `nemia ${name} takes an agent's name and a rule's id, not ${arg}: nemia ${name} <agent> <id>.`,
});

/** `nemia policy <agent>`: an agent's rules for `auto`, the list in force beside its proposal and its custom instruction. */
export const POLICY: Command<PolicyList> = {
  name: 'policy',
  usage: '<agent>',
  help: [
    "the agent's rules at auto: the answers it may give unasked, in force once",
    'you confirm them, and what it proposed from your custom instruction,',
    'with the words the machinery cannot hold, kept as guidance',
  ],
  spec: agentSpec('policy'),
  check: (args) => agentNameRefusal(agentIn(args)) ?? null,
  writes: false,
  class: 'read',
  route: { method: 'GET', path: '/api/policy/:name', status: 200 },
  handler: (args, _env, home = HOME) => tried(() => policyListOf(home, agentIn(args))),
  print: listLines,
};

/** The refusal of a proposal that is none. */
const proposalRefusal = (why: string): Invalid =>
  new Invalid({ message: `${why}. A proposal is JSON: { "rules": [{ "id", "answer", "steps"?, "when", "under"? }], "guidance": ["…"] }.` });

/**
 * The proposal in `words`: its rules and its guidance. Refused (`Invalid`): no JSON, a rule that is none, an id twice, guidance not words.
 */
export function proposalOf(words: string): { rules: AutoRule[]; guidance: string[] } {
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
  const ids = rules.map((r: AutoRule) => r.id);
  if (new Set(ids).size !== ids.length) throw proposalRefusal('the proposal names a rule id twice');
  if (!Array.isArray(guidance) || guidance.some((g) => typeof g !== 'string' || !g.trim()))
    throw proposalRefusal('its guidance is a list of words the machinery cannot hold');
  const kept = (rule: AutoRule): AutoRule => ({
    id: rule.id,
    answer: rule.answer,
    ...(rule.steps === undefined ? {} : { steps: rule.steps }),
    when: rule.when,
    ...(rule.under === undefined ? {} : { under: rule.under }),
  });
  return { rules: rules.map(kept), guidance };
}

/**
 * `nemia policy propose <agent> --file <path>|-`: what the agent proposes from the custom instruction, its own file, over what it proposed.
 */
export const POLICY_PROPOSE: Command<PolicyList> = {
  name: 'policy propose',
  usage: '<agent> --file <path>|-',
  help: [
    "the agent's proposal: rules from your custom instruction, as JSON,",
    'with the words the machinery cannot hold kept as guidance; none is in',
    'force until you confirm it (nemia policy confirm)',
  ],
  spec: {
    positionals: [{ key: 'name', takes: 'required', kind: 'name' }],
    flags: [
      {
        flag: '--file',
        kind: 'text',
        key: 'file',
        takes: '--file takes the file of the proposal, or - to read it from stdin: nemia policy propose <agent> --file <path>',
      },
    ],
    unknown: (arg) => `nemia policy propose takes an agent's name and --file <path> (or - for stdin), not ${arg}.`,
  },
  check: (args) =>
    agentNameRefusal(agentIn(args)) ??
    (typeof args.file === 'string' ? null : 'nemia policy propose takes the proposal in --file <path>, or --file - for stdin.'),
  writes: true,
  class: 'act',
  only: { side: 'cli', why: 'the agent proposes from its own session; the board shows the proposal and confirms its rules' },
  handler: (args, _env, home = HOME) =>
    tried(() => {
      const agent = agentIn(args);
      const { rules, guidance } = proposalOf(String(args.words ?? ''));
      const digest = digestOf(readCustomInstructions(home, agent));
      writeProposed(home, agent, { at: new Date().toISOString(), rules, guidance, digest });
      return policyListOf(home, agent);
    }),
  print: (list) => [
    `${list.agent} proposed ${list.proposed?.rules.length ?? 0} rule(s), none in force until confirmed.`,
    ...listLines(list),
  ],
};

/**
 * `nemia policy confirm <agent> <id> --words <words>`: a rule the agent proposed put in force as the person read it, the person's; asked of
 * them every time an agent calls it. Refused: a confirm with no words.
 */
export const POLICY_CONFIRM: Command<PolicyList> = {
  name: 'policy confirm',
  usage: "<agent> <id> --words '<words>'",
  help: [
    'put in force a rule the agent proposed, or the default again, as its',
    'words read: from then on, at auto, the answer it names is given unasked',
    'where it holds. Refused once the rule reads otherwise. Your first confirm',
    'keeps the default beside it. Asked of you every time',
  ],
  spec: {
    ...ruleSpec('policy confirm'),
    flags: [
      {
        flag: '--words',
        kind: 'text',
        key: 'words',
        takes:
          "--words takes the rule's words as you read them in nemia policy <agent>: nemia policy confirm <agent> <id> --words '<words>'",
      },
    ],
    unknown: (arg) =>
      `nemia policy confirm takes an agent's name, a rule's id and --words '<words>', not ${arg}: nemia policy confirm <agent> <id> --words '<words>'.`,
  },
  check: (args) =>
    agentNameRefusal(agentIn(args)) ??
    (wordsIn(args).trim()
      ? null
      : `nemia policy confirm takes the rule's words as you read them, so what is confirmed is what you read: --words '<words>', printed by nemia policy ${agentIn(args) || '<agent>'}.`),
  writes: true,
  class: 'ask',
  asksAlways: true,
  route: { method: 'PUT', path: '/api/policy/:name/rules/:id', status: 200 },
  handler: (args, _env, home = HOME) =>
    tried(() => {
      confirmRule(home, agentIn(args), idIn(args), wordsIn(args), new Date());
      return policyListOf(home, agentIn(args));
    }),
  print: (list, args) => [`${list.agent}: the rule ${idIn(args)} is in force at auto.`, ...listLines(list)],
};

/** `nemia policy drop <agent> <id>`: a rule taken out of force, the default among them, the person's; asked of them every time. */
export const POLICY_DROP: Command<PolicyList> = {
  name: 'policy drop',
  usage: '<agent> <id>',
  help: ['take a rule out of force, the default among them: what it allowed is', 'asked of you again. Asked of you every time'],
  spec: ruleSpec('policy drop'),
  check: (args) => agentNameRefusal(agentIn(args)) ?? null,
  writes: true,
  class: 'ask',
  asksAlways: true,
  route: { method: 'DELETE', path: '/api/policy/:name/rules/:id', status: 200 },
  handler: (args, _env, home = HOME) =>
    tried(() => {
      dropRule(home, agentIn(args), idIn(args), new Date());
      return policyListOf(home, agentIn(args));
    }),
  print: (list, args) => [`${list.agent}: the rule ${idIn(args)} is out of force; what it allowed is asked again.`, ...listLines(list)],
};

/** The entries of `nemia policy`, in the order `nemia`'s help lists them. */
export const POLICY_ENTRIES = [POLICY, POLICY_PROPOSE, POLICY_CONFIRM, POLICY_DROP] as const;
