/**
 * A call a session's harness would prompt a person for, where its task says a person can be asked (`config.mayAsk`): held as an ask
 * on the same path an `AskUserQuestion` takes (agent-runtime, src/harness/claude/permission.ts, `permissionAskOf`), and the person's
 * answer to it turned into what the Agent SDK's `canUseTool` returns (`permissionAnswered`).
 *
 * What the person is shown is what the SDK handed over (`CanUseTool`'s `title`, `displayName`, `description`, `decisionReason`,
 * `blockedPath`, `sdk.d.ts` of `@anthropic-ai/claude-agent-sdk` 0.3.316), with a shell call's command as typed; never words rebuilt
 * from the call's input. Three answers: allow once, always allow (the SDK's `suggestions` returned as `updatedPermissions`, as its
 * comment on `suggestions` says), and deny, with the person's own words as the message the session reads where they wrote some.
 */
import { assume, type Implementation, spec } from '@emyann/tsverify';
import type { PermissionUpdate } from '@anthropic-ai/claude-agent-sdk';
import {
  ASK_CUT,
  commandOf,
  PERMISSION_ALWAYS,
  PERMISSION_DENIED,
  PERMISSION_DENY,
  PERMISSION_ONCE,
  type PermissionAnswer,
  type PermissionAsk,
  type PermissionHeld,
  type PermissionOffer,
} from '../src/harness/claude/permission.ts';

/**
 * The command a shell call was typed with, read off its input. The verifier models no `===` of a value typed `unknown`, which a call's
 * input holds, so it takes this reading on trust: pure, and nothing for a call of a tool other than Bash. That it is the input's own
 * `command` is held by `test/assumptions.test.ts` on the real function, and by `test/attached-asks.boundary.test.ts` on the ask.
 */
export const shellCommand = assume(commandOf, {
  pure: true,
  ensures: {
    onlyAShellCallHasOne: {
      description: 'Only a call of Bash has a command',
      condition: ({ input: [tool], output }) => output === undefined || tool === 'Bash',
    },
  },
});

/** Whether `s` is a word with something in it. */
const said = (s: string | undefined): s is string => s !== undefined && s !== '';

/** Whether the SDK's offer lets a person save a rule: not suppressed, and a rule suggested. */
const alwaysAllowed = (offer: PermissionOffer): boolean =>
  offer.suppressAlwaysAllowRule !== true && offer.suggestions !== undefined && offer.suggestions.length > 0;

/**
 * Whether `given` returns the SDK's `suggested` updates, one for one in their order, each of its kind and for its destination. The
 * verifier models no identity of an object (`===` of two records or two arrays is refused as not modeled), so this says what of the
 * suggestions it can read; that the updates and the call's input are returned as the SDK gave them is held by
 * `test/attached-asks.boundary.test.ts`, which compares them whole on what the stand-in receives.
 */
const sameRules = (given: PermissionUpdate[] | undefined, suggested: PermissionUpdate[]): boolean =>
  given !== undefined &&
  given.length === suggested.length &&
  given.every((u, i) => u.type === suggested.at(i)?.type && u.destination === suggested.at(i)?.destination);

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
      condition: ({ input: [, , tool, input], output }) =>
        output.permission.command === commandOf(tool, input) && (tool === 'Bash' || output.permission.command === undefined),
    },
  },
});

export type PermissionAskOf = Implementation<typeof permissionAskSpec>;

const permissionAnsweredSpec = spec<(held: PermissionHeld, given: string | undefined) => PermissionAnswer>({
  ensures: {
    noAnswerIsACutCall: {
      description: 'A call no answer reached is denied with what every cut ask is told',
      condition: ({ input: [, given], output }) => (given === undefined ? output.behavior === 'deny' && output.message === ASK_CUT : true),
    },
    onceRunsTheCallAsAsked: {
      description: 'Allow once runs the call, and saves no rule',
      condition: ({ input: [, given], output }) =>
        given === PERMISSION_ONCE ? output.behavior === 'allow' && output.updatedPermissions === undefined : true,
    },
    alwaysSavesWhatTheSdkSuggested: {
      description: 'Always allow, where it was offered, runs the call and returns the SDK’s suggestions to be saved',
      condition: ({ input: [held, given], output }) =>
        given === PERMISSION_ALWAYS && held.always
          ? output.behavior === 'allow' && sameRules(output.updatedPermissions, held.suggestions)
          : true,
    },
    alwaysNotOfferedSavesNothing: {
      description: 'Always allow where it was not offered runs the call once, and saves no rule',
      condition: ({ input: [held, given], output }) =>
        given === PERMISSION_ALWAYS && !held.always ? output.behavior === 'allow' && output.updatedPermissions === undefined : true,
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
