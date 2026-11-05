/**
 * A call a session's harness would prompt a person for, where its task says a person can be asked (`config.mayAsk`): held as an ask
 * on the same path an `AskUserQuestion` takes (agent-runtime, src/harness/claude/permission.ts, `permissionAskOf`), and the person's
 * answer to it turned into what the Agent SDK's `canUseTool` returns (`permissionAnswered`).
 *
 * What the person is shown is what the SDK handed over (`CanUseTool`'s `title`, `displayName`, `description`, `decisionReason`,
 * `blockedPath`, `sdk.d.ts` of `@anthropic-ai/claude-agent-sdk` 0.3.316), with a shell call's command as typed; never words rebuilt
 * from the call's input. Three answers: allow once, always allow (the SDK's `suggestions` returned as `updatedPermissions`, as its
 * comment on `suggestions` says), and deny, with the person's own words as the message the session reads where they wrote some.
 *
 * The types and the three labels are declared here until implement moves them into `src` (`permission.ts`), which changes no law.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { PermissionUpdate } from '@anthropic-ai/claude-agent-sdk';
import type { AskQuestion } from '../src/core/index.ts';
import { ASK_CUT } from '../src/harness/claude/attached-session.ts';

/** The choice that runs the call this once. */
export const PERMISSION_ONCE = 'Allow once';
/** The choice that runs the call and saves the rules the SDK suggested, so a call like it is not asked again. */
export const PERMISSION_ALWAYS = 'Always allow';
/** The choice that refuses the call. */
export const PERMISSION_DENY = 'Deny';

/** What a call the person denied with no words of their own is told. */
export const PERMISSION_DENIED =
  'The person denied this call where it was shown to them. Do not run it again unasked: say in your answer what you were denied, and ask them if you need it.';

/** What the SDK hands `canUseTool` about a prompt, as the ask reads it: its words, its two hints, and the rules it suggests saving. */
export type PermissionOffer = {
  title?: string;
  displayName?: string;
  description?: string;
  decisionReason?: string;
  blockedPath?: string;
  defaultToNo?: boolean;
  suppressAlwaysAllowRule?: boolean;
  suggestions?: PermissionUpdate[];
};

/**
 * What a permission ask carries beside its one question, for whoever draws it: the tool, a shell call's command as typed, the SDK's
 * words as it gave them, whether always is offered, and whether deny is the default.
 */
export type PermissionFacts = {
  tool: string;
  command?: string;
  title?: string;
  displayName?: string;
  description?: string;
  decisionReason?: string;
  blockedPath?: string;
  always: boolean;
  defaultToNo: boolean;
};

/** A permission held for a person, as the session's asks carry it: one question, its choices the three answers. */
export type PermissionAsk = { id: string; at: string; kind: 'permission'; questions: AskQuestion[]; permission: PermissionFacts };

/** What the held call keeps while it waits: the call's input, whether always was offered, and the SDK's suggestions. */
export type PermissionHeld = { input: Record<string, unknown>; always: boolean; suggestions: PermissionUpdate[] };

/** What the held call returns to the SDK: a `PermissionResult`'s two members, as this flow gives them. */
export type PermissionAnswer =
  | { behavior: 'allow'; updatedInput: Record<string, unknown>; updatedPermissions?: PermissionUpdate[] }
  | { behavior: 'deny'; message: string };

/** Whether `s` is a word with something in it. */
const said = (s: string | undefined): s is string => s !== undefined && s !== '';

/** Whether the SDK's offer lets a person save a rule: not suppressed, and a rule suggested. */
const alwaysAllowed = (offer: PermissionOffer): boolean =>
  offer.suppressAlwaysAllowRule !== true && offer.suggestions !== undefined && offer.suggestions.length > 0;

/** Whether the ask's one question offers the choice `label`. */
const offers = (ask: PermissionAsk, label: string): boolean =>
  (ask.questions.at(0)?.options ?? []).some((option) => option.label === label);

const permissionAskSpec = spec<
  (id: string, at: string, tool: string, input: Record<string, unknown>, offer: PermissionOffer) => PermissionAsk
>({
  ensures: {
    isThisCallsPermission: {
      description: 'The ask is a permission, under the call’s own id and the moment it was held',
      condition: ({ input: [id, at], output }) => output.kind === 'permission' && output.id === id && output.at === at,
    },
    oneQuestionOneChoice: {
      description: 'A permission asks one question, which takes one choice',
      condition: ({ output }) => output.questions.length === 1 && output.questions.at(0)?.multiSelect === false,
    },
    theSdksTitleAsks: {
      description: 'The question is the prompt sentence the SDK gave, where it gave one',
      condition: ({ input: [, , , , offer], output }) => (said(offer.title) ? output.questions.at(0)?.question === offer.title : true),
    },
    elseItsDisplayName: {
      description: 'With no sentence, the question is the SDK’s short name for the action',
      condition: ({ input: [, , , , offer], output }) =>
        !said(offer.title) && said(offer.displayName) ? output.questions.at(0)?.question === offer.displayName : true,
    },
    elseTheToolsName: {
      description: 'With neither, the question is the tool’s name, never words made from its input',
      condition: ({ input: [, , tool, , offer], output }) =>
        !said(offer.title) && !said(offer.displayName) ? output.questions.at(0)?.question === tool : true,
    },
    onceAndDenyAreAlwaysOffered: {
      description: 'Allow once and deny are offered on every permission',
      condition: ({ output }) => offers(output, PERMISSION_ONCE) && offers(output, PERMISSION_DENY),
    },
    alwaysOfferedExactlyWhenTheSdkAllowsIt: {
      description: 'Always allow is offered exactly where the SDK suggests a rule and does not suppress the choice',
      condition: ({ input: [, , , , offer], output }) =>
        offers(output, PERMISSION_ALWAYS) === alwaysAllowed(offer) && output.permission.always === alwaysAllowed(offer),
    },
    denyIsTheDefaultWhereTheSdkSaysSo: {
      description: 'Deny is the default exactly where the SDK says the ask must not be approved by a stray keystroke',
      condition: ({ input: [, , , , offer], output }) => output.permission.defaultToNo === (offer.defaultToNo === true),
    },
    theSdksWordsAreCarriedAsGiven: {
      description: 'The SDK’s words reach the person as it gave them',
      condition: ({ input: [, , tool, , offer], output }) =>
        output.permission.tool === tool &&
        output.permission.title === offer.title &&
        output.permission.displayName === offer.displayName &&
        output.permission.description === offer.description &&
        output.permission.decisionReason === offer.decisionReason &&
        output.permission.blockedPath === offer.blockedPath,
    },
    aShellCallShowsItsCommandAsTyped: {
      description: 'A shell call carries its command as typed, and no other call carries one',
      condition: ({ input: [, , tool, input], output }) => {
        const command = input['command'];
        return tool === 'Bash' && typeof command === 'string'
          ? output.permission.command === command
          : output.permission.command === undefined;
      },
    },
  },
});

export type PermissionAskOf = Implementation<typeof permissionAskSpec>;

const permissionAnsweredSpec = spec<(held: PermissionHeld, given: string | undefined) => PermissionAnswer>({
  ensures: {
    noAnswerIsACutCall: {
      description: 'A call no answer reached is denied with what every cut ask is told',
      condition: ({ input: [, given], output }) =>
        given === undefined ? output.behavior === 'deny' && output.message === ASK_CUT : true,
    },
    onceRunsTheCallAsAsked: {
      description: 'Allow once runs the call with its own input, and saves no rule',
      condition: ({ input: [held, given], output }) =>
        given === PERMISSION_ONCE
          ? output.behavior === 'allow' && output.updatedInput === held.input && output.updatedPermissions === undefined
          : true,
    },
    alwaysSavesWhatTheSdkSuggested: {
      description: 'Always allow, where it was offered, runs the call and returns the SDK’s suggestions to be saved',
      condition: ({ input: [held, given], output }) =>
        given === PERMISSION_ALWAYS && held.always
          ? output.behavior === 'allow' && output.updatedInput === held.input && output.updatedPermissions === held.suggestions
          : true,
    },
    alwaysNotOfferedSavesNothing: {
      description: 'Always allow where it was not offered runs the call once, and saves no rule',
      condition: ({ input: [held, given], output }) =>
        given === PERMISSION_ALWAYS && !held.always
          ? output.behavior === 'allow' && output.updatedInput === held.input && output.updatedPermissions === undefined
          : true,
    },
    onlyTheTwoAllowsAllow: {
      description: 'A call runs only where the person chose allow once or always allow',
      condition: ({ input: [, given], output }) =>
        output.behavior === 'allow' ? given === PERMISSION_ONCE || given === PERMISSION_ALWAYS : true,
    },
    denyChosenIsTold: {
      description: 'Deny, or words with nothing in them, denies the call with what a denied call is told',
      condition: ({ input: [, given], output }) =>
        given === PERMISSION_DENY || given === '' ? output.behavior === 'deny' && output.message === PERMISSION_DENIED : true,
    },
    theirWordsAreWhatTheSessionReads: {
      description: 'Words of the person’s own deny the call, and are the message the session reads',
      condition: ({ input: [, given], output }) =>
        said(given) && given !== PERMISSION_ONCE && given !== PERMISSION_ALWAYS && given !== PERMISSION_DENY
          ? output.behavior === 'deny' && output.message === given
          : true,
    },
  },
});

export type PermissionAnswered = Implementation<typeof permissionAnsweredSpec>;
