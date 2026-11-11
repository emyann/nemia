/**
 * Who speaks to a step's session (agent-orchestrator, src/chat/chat.ts and src/say/say.ts): `nemia say` and the api's
 * `POST /api/namespaces/:namespace/runs/:name/steps/:step/say`. Who the words are from (`stepSpeaker`), off the caller the request is
 * (a session's token, or none: `Caller`), who the words say they are from (`from`) and the names the person allowed in her chat
 * (`nemia chat allow`, the same list); the words the session is handed (`framedForStep`); and who the words a step's journal holds
 * are from, read back off them (`saidBy`), so the board draws an agent's apart from the person's with nothing kept beside the journal.
 *
 * The laws are the card's: an agent's words are never said nor shown as the person's; a session that presents its token speaks as
 * its own agent and as no one else; an agent with no token speaks only under a name the person allowed, as in her chat; and the
 * person's words reach a step as they always did, byte for byte. The words of each refusal are nobody's law, only its kind.
 *
 * Where a step's rule departs from her chat's: the person's words are taken from anywhere, not from the board alone, since the person
 * types `nemia say` in a shell as often as on the board; and a session's own name, which the store filed it under and its token
 * proves, is on no list and refused for no reserved word (Nemia's own session speaks to a step as `nemia`).
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { Caller } from './proposal-approval.contract.ts';
import { AGENT_OPENS, AGENT_WRITES, framedFor, type Speaker, type SpeakerRefused, speakerNameRefusal } from '../src/chat/chat.ts';

/** Whether the caller is a session that presents its token and names no one but itself, the agent the store filed it under. */
const isItself = (caller: Caller, from: Speaker | undefined): boolean =>
  caller.kind === 'agent' && (from === undefined || (from.kind === 'agent' && from.name === caller.agent));

/** Whether `from` is an agent under a name an agent speaks under (`speakerNameRefusal`, the chat's own). */
const wellNamed = (from: Speaker | undefined): boolean => from?.kind === 'agent' && speakerNameRefusal(from.name) === undefined;

const stepSpeakerSpec = spec<(caller: Caller, from: Speaker | undefined, allowed: readonly string[]) => Speaker | SpeakerRefused>({
  ensures: {
    aSessionIsItself: {
      description:
        'A session that presents its token, naming no one or itself, speaks as its own agent under the name its token proves, whatever the person allowed',
      condition: ({ input: [caller, from], output }) =>
        !isItself(caller, from) || (caller.kind === 'agent' && output.kind === 'agent' && output.name === caller.agent),
    },
    aSessionIsNeverThePerson: {
      description: 'A session that presents its token is never taken as the person',
      condition: ({ input: [caller], output }) => caller.kind !== 'agent' || output.kind !== 'person',
    },
    aSessionNamesNoOther: {
      description: 'A session that presents its token and says it is someone else — the person or another agent — is refused as Invalid',
      condition: ({ input: [caller, from], output }) =>
        caller.kind !== 'agent' || from === undefined || isItself(caller, from) || output.kind === 'Invalid',
    },
    thePersonByDefault: {
      description: 'Words with no token that name no one are the person’s, from the board or from a shell, as every say was before',
      condition: ({ input: [caller, from], output }) => caller.kind !== 'person' || from !== undefined || output.kind === 'person',
    },
    thePersonNamed: {
      description: 'Words with no token that say they are the person’s are the person’s',
      condition: ({ input: [caller, from], output }) => caller.kind !== 'person' || from?.kind !== 'person' || output.kind === 'person',
    },
    aBadNameIsInvalid: {
      description: 'An agent with no token, under a name no agent speaks under, is refused as Invalid, whatever the person allowed',
      condition: ({ input: [caller, from], output }) =>
        caller.kind !== 'person' || from?.kind !== 'agent' || wellNamed(from) || output.kind === 'Invalid',
    },
    unallowedIsConflict: {
      description: 'An agent with no token, under a name the person has not allowed with `nemia chat allow`, is refused as Conflict',
      condition: ({ input: [caller, from, allowed], output }) =>
        caller.kind !== 'person' || from?.kind !== 'agent' || !wellNamed(from) || allowed.includes(from.name) || output.kind === 'Conflict',
    },
    allowedIsItsName: {
      description: 'An agent with no token, under a name the person allowed, speaks under that name',
      condition: ({ input: [caller, from, allowed], output }) =>
        caller.kind !== 'person' ||
        from?.kind !== 'agent' ||
        !wellNamed(from) ||
        !allowed.includes(from.name) ||
        (output.kind === 'agent' && output.name === from.name),
    },
  },
});
/**
 * `stepSpeaker`'s type, which `src/chat/chat.ts` takes, beside her chat's rule it reuses: who words to a step's session are from, or why
 * they are refused.
 */
export type StepSpeaker = Implementation<typeof stepSpeakerSpec>;

const framedForStepSpec = spec<(speaker: Speaker, text: string) => string>({
  ensures: {
    thePersonAsToday: {
      description: 'The person’s words reach a step’s session as they always did, byte for byte, in no frame',
      condition: ({ input: [speaker, text], output }) => speaker.kind !== 'person' || output === text,
    },
    anAgentAsInHerChat: {
      description: 'An agent’s words reach a step’s session in the frame her chat says them in, never as the person’s',
      condition: ({ input: [speaker, text], output }) => speaker.kind !== 'agent' || output === framedFor(speaker, text),
    },
  },
});
/**
 * `framedForStep`'s type, which `src/chat/chat.ts` takes, beside `framedFor`: the words `text` from `speaker` are said to a step's session
 * in.
 */
export type FramedForStep = Implementation<typeof framedForStepSpec>;

/** Who words a step's journal holds are from, and the words themselves without the frame they were said in. */
export type SaidFrom = { readonly from: Speaker; readonly words: string };

/**
 * Whether `text` is in an agent's frame, as `framedFor` writes one: it opens with `AGENT_OPENS`, a name follows, never empty and up to
 * the first `AGENT_WRITES`, then that phrase. A name may hold a space, as an agent's may (`code reviewer`); none holds the phrase.
 *
 * Two of its conditions hold of every text the others hold of, and are said so the solver need not prove them of `indexOf` and
 * `slice`: that the name, cut at the first `AGENT_WRITES`, holds none; and that the frame written again around the name and the words
 * after it is the text. The set of texts is the same.
 */
const inAnAgentsFrame = (text: string): boolean => {
  if (!text.startsWith(AGENT_OPENS)) return false;
  const rest = text.slice(AGENT_OPENS.length);
  const end = rest.indexOf(AGENT_WRITES);
  const name = rest.slice(0, end);
  const after = rest.slice(end);
  return (
    end > 0 &&
    !name.includes(AGENT_WRITES) &&
    after.startsWith(AGENT_WRITES) &&
    AGENT_OPENS + name + AGENT_WRITES + after.slice(AGENT_WRITES.length) === text
  );
};

const saidBySpec = spec<(text: string) => SaidFrom>({
  ensures: {
    thePersonAsSaid: {
      description:
        'Words in no agent’s frame are the person’s, read as they were journalled — every say journalled before this change among them',
      condition: ({ input: [text], output }) => inAnAgentsFrame(text) || (output.from.kind === 'person' && output.words === text),
    },
    aFrameIsNeverThePerson: {
      description: 'Words in an agent’s frame are never read back as the person’s',
      condition: ({ input: [text], output }) => !inAnAgentsFrame(text) || output.from.kind === 'agent',
    },
    anAgentIsItsFrame: {
      description: 'Words read back as an agent’s are exactly that agent’s frame around the words read back',
      condition: ({ input: [text], output }) =>
        output.from.kind !== 'agent' || text === AGENT_OPENS + output.from.name + AGENT_WRITES + output.words,
    },
    aNameIsOneName: {
      description:
        'The name read back is a name, never empty and never holding the frame’s own phrase, so a frame reads back under one name alone',
      condition: ({ output }) => output.from.kind !== 'agent' || (output.from.name.length > 0 && !output.from.name.includes(AGENT_WRITES)),
    },
  },
});
/** `saidBy`'s type, which `src/say/say.ts` takes: who the words `text` a step's journal holds are from, and the words. */
export type SaidBy = Implementation<typeof saidBySpec>;
