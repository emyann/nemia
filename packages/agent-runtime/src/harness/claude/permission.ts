/**
 * A call Claude Code would prompt a person for, held as an ask where the session's task says a person can be asked (`config.mayAsk`):
 * on the path an `AskUserQuestion` takes (`decidedHere`, `attached-session.ts`), one question whose choices are the three answers.
 * `permissionAskOf` makes the ask of what the SDK hands `canUseTool`, and `permissionAnswered` turns the person's answer into what
 * `canUseTool` returns; both are proved by `contracts/permission.contract.ts`.
 *
 * The person is shown what the SDK handed over (`CanUseTool`'s `title`, `displayName`, `description`, `decisionReason` and
 * `blockedPath`, `sdk.d.ts:228`) and a shell call's command as typed, never words made from the call's input. Always allow returns the
 * SDK's `suggestions` whole as `updatedPermissions`, as its comment on them says (`sdk.d.ts:232-239`).
 */
import type { PermissionUpdate } from '@anthropic-ai/claude-agent-sdk';
import type { PermissionAnswered, PermissionAskOf } from '../../../contracts/permission.contract.ts';
import type { AskOption } from '../../core/index.ts';
import type { PermissionFacts } from '../seam.ts';
import { ASK_CUT, PERMISSION_ONCE, PERMISSION_ALWAYS, PERMISSION_DENY, PERMISSION_DENIED, commandOf } from './permission-words.ts';

export type { PermissionOffer, PermissionAsk, PermissionHeld, PermissionAnswer } from '../../../contracts/permission.contract.ts';

export { ASK_CUT, PERMISSION_ONCE, PERMISSION_ALWAYS, PERMISSION_DENY, PERMISSION_DENIED, commandOf } from './permission-words.ts';

export type { PermissionFacts };

/** Whether `s` is a word with something in it. */
const said = (s: string | undefined): s is string => s !== undefined && s !== '';

/** A rule the SDK suggests, as its settings spell one: `Bash(npm test:*)`, or the tool's name alone. */
const ruleOf = (rule: { toolName: string; ruleContent?: string }): string =>
  said(rule.ruleContent) ? `${rule.toolName}(${rule.ruleContent})` : rule.toolName;

/** One suggested update, in a line: the rules it adds and where, or what else it changes. */
const updateOf = (u: PermissionUpdate): string =>
  u.type === 'addRules' || u.type === 'replaceRules' || u.type === 'removeRules'
    ? `${u.rules.map(ruleOf).join(', ')} (${u.destination})`
    : u.type === 'setMode'
      ? `mode ${u.mode} (${u.destination})`
      : `${u.directories.join(', ')} (${u.destination})`;

/** The three choices' lines, Always's naming what it saves. */
const onceOption: AskOption = { label: PERMISSION_ONCE, description: 'Run this call, and ask again next time.' };
const denyOption: AskOption = { label: PERMISSION_DENY, description: 'Refuse this call. Words of your own are what the session is told.' };
const alwaysOption = (suggestions: PermissionUpdate[]): AskOption => ({
  label: PERMISSION_ALWAYS,
  description: `Run this call, and save what Claude Code suggests: ${suggestions.map(updateOf).join('; ')}.`,
});

export const permissionAskOf: PermissionAskOf = (id, at, tool, input, offer) => {
  const suggestions = offer.suggestions ?? [];
  const always = offer.suppressAlwaysAllowRule !== true && suggestions.length > 0;
  const command = commandOf(tool, input);
  const question = said(offer.title) ? offer.title : said(offer.displayName) ? offer.displayName : tool;
  return {
    id,
    at,
    kind: 'permission',
    questions: [
      {
        question,
        header: 'Permission',
        options: always ? [onceOption, alwaysOption(suggestions), denyOption] : [onceOption, denyOption],
        multiSelect: false,
      },
    ],
    permission: {
      tool,
      ...(command !== undefined ? { command } : {}),
      ...(offer.title !== undefined ? { title: offer.title } : {}),
      ...(offer.displayName !== undefined ? { displayName: offer.displayName } : {}),
      ...(offer.description !== undefined ? { description: offer.description } : {}),
      ...(offer.decisionReason !== undefined ? { decisionReason: offer.decisionReason } : {}),
      ...(offer.blockedPath !== undefined ? { blockedPath: offer.blockedPath } : {}),
      always,
      defaultToNo: offer.defaultToNo === true,
    },
  };
};

export const permissionAnswered: PermissionAnswered = (held, given) => {
  if (given === undefined) return { behavior: 'deny', message: ASK_CUT };
  if (given === PERMISSION_ONCE) return { behavior: 'allow', updatedInput: held.input };
  if (given === PERMISSION_ALWAYS)
    return held.always
      ? { behavior: 'allow', updatedInput: held.input, updatedPermissions: held.suggestions }
      : { behavior: 'allow', updatedInput: held.input };
  if (given === PERMISSION_DENY || given === '') return { behavior: 'deny', message: PERMISSION_DENIED };
  return { behavior: 'deny', message: given };
};
