/**
 * `nemia policy <agent>` and the writes of an agent's rules for auto — `policy propose` (its file read here and sent as words), `policy
 * confirm` and `policy rm` — each asked of the api's nemia group, which judges the agent's name and the rules; and the lines each prints of
 * the list it answers (`PolicyList`).
 */
import { POLICY_CONFIRM_WORDS, POLICY_PROPOSE_WORDS, POLICY_RM_WORDS, POLICY_WORDS, type Args, type PolicyList } from 'objects';
import { asked } from '../../objects.ts';
import { said, textArg } from '../requests.ts';
import { wordsRead } from './sent.ts';

/** An agent's rules, as the api answers them. */
type Listed = typeof PolicyList.Type;

/** The lines `nemia policy` prints of an agent's rules. */
export function listLines(list: Listed): string[] {
  const inForce = list.rules.length
    ? list.rules.map((r) => `  ${r.id}${r.from === 'default' ? ' (default)' : ''}: ${r.words}`)
    : ['  none: every answer is asked'];
  inForce.push(...list.proposalRules.map((r) => `  ${r.id}: ${r.words}`));
  const lines = [
    `${list.agent}, rules in force at auto${list.isDefault ? ', the default for want of any you confirmed' : ''}:`,
    ...inForce,
  ];
  if (list.proposed === null) return [...lines, `${list.agent} proposed none: nemia policy propose ${list.agent} --file <path>.`];
  const p = list.proposed;
  return [
    ...lines,
    `proposed at ${p.at}${p.stale ? ', before the custom instruction last changed' : ''}:`,
    ...[...p.rules, ...p.proposalRules].map((r) => `  ${r.id}${r.confirmed ? ' (in force)' : ''}: ${r.words}`),
    ...(p.guidance.length ? ['kept as guidance, which the machinery cannot hold:', ...p.guidance.map((g) => `  ${g}`)] : []),
    `confirm one with nemia policy confirm ${list.agent} <id> --words '<its words, as read here>'; drop one in force with nemia policy rm ${list.agent} <id>.`,
  ];
}

/** The agent `args` name. */
const agentOf = (args: Args): string => textArg(args, 'name') ?? '';

/** The rule's id `args` name. */
const idOf = (args: Args): string => textArg(args, 'id') ?? '';

/** `nemia policy <agent>`'s runner: the agent's rules, read. */
export async function policy(args: Args): Promise<number> {
  const name = agentOf(args);
  said(listLines(await asked(POLICY_WORDS.name, (c) => c.nemia.policy({ params: { name } }))));
  return 0;
}

/** `nemia policy propose <agent> --file <path>|-`'s runner: the proposal's words read here, sent, and the list after printed. */
export async function policyPropose(args: Args): Promise<number> {
  const name = agentOf(args);
  const words = wordsRead(textArg(args, 'file') ?? '-', POLICY_PROPOSE_WORDS.name);
  const list = await asked(POLICY_PROPOSE_WORDS.name, (c) => c.nemia.propose({ params: { name }, payload: { words } }));
  const count = (list.proposed?.rules.length ?? 0) + (list.proposed?.proposalRules.length ?? 0);
  said([`${list.agent} proposed ${count} rule(s), none in force until confirmed.`, ...listLines(list)]);
  return 0;
}

/** `nemia policy confirm <agent> <id> --words <words>`'s runner: the rule put in force as the person read it. */
export async function policyConfirm(args: Args): Promise<number> {
  const name = agentOf(args);
  const id = idOf(args);
  const words = textArg(args, 'words') ?? '';
  const list = await asked(POLICY_CONFIRM_WORDS.name, (c) => c.nemia.confirmRule({ params: { name, id }, payload: { words } }));
  said([`${list.agent}: the rule ${id} is in force at auto.`, ...listLines(list)]);
  return 0;
}

/** `nemia policy rm <agent> <id>`'s runner: the rule taken out of force. */
export async function policyRm(args: Args): Promise<number> {
  const name = agentOf(args);
  const id = idOf(args);
  const list = await asked(POLICY_RM_WORDS.name, (c) => c.nemia.dropRule({ params: { name, id } }));
  said([`${list.agent}: the rule ${id} is out of force; what it allowed is asked again.`, ...listLines(list)]);
  return 0;
}
