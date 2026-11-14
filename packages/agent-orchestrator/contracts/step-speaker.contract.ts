/**
 * Who speaks to a step's session (agent-orchestrator, src/chat/chat.ts and src/say/say.ts): `nemia say` and the api's
 * `POST /api/namespaces/:namespace/runs/:name/steps/:step/say`, and to her chat (`chatSay`), which takes its speaker from the same rule.
 * Who the words are from (`stepSpeaker`), off the caller the request's token says (`Caller`): the person under any token they hold, an
 * agent under its standing token, a session under the token its run gave it; the words the session is handed (`framedForStep`); and who
 * the words a step's journal holds are from, read back off them (`saidBy`), so the board draws an agent's apart from the person's with
 * nothing kept beside the journal.
 *
 * The laws are the card's: an agent's words are never said nor shown as the person's; an agent, by a session's token or a standing one,
 * speaks as its own agent and as no one else; the person speaks as the person; and the person's words reach a step as they always did,
 * byte for byte. No word of the request says who it is from: the token does.
 *
 * Where a step's rule departs from her chat's: a session's own name, which the store filed it under and its token proves, is refused for
 * no reserved word (Nemia's own session speaks to a step as `nemia`).
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { Caller } from './proposal-approval.contract.ts';
import { AGENT_OPENS, AGENT_WRITES, framedFor } from '../src/chat/framed.ts';
import type { Speaker } from './speaker.contract.ts';

const stepSpeakerSpec = spec<(caller: Caller) => Speaker>({
  ensures: {
    anAgentIsItself: {
      description:
        'An agent — a session by the token its run gave it, or an agent by a standing token the person minted for it — speaks as its own agent, under the name its token proves',
      condition: ({ input: [caller], output }) => caller.kind !== 'agent' || (output.kind === 'agent' && output.name === caller.agent),
    },
    anAgentIsNeverThePerson: {
      description: 'An agent’s token is never taken as the person',
      condition: ({ input: [caller], output }) => caller.kind !== 'agent' || output.kind !== 'person',
    },
    thePersonIsThePerson: {
      description: 'The person, under any token they hold — the board’s, a shell’s — speaks as the person',
      condition: ({ input: [caller], output }) => caller.kind !== 'person' || output.kind === 'person',
    },
  },
});
/** `stepSpeaker`'s type, which `src/chat/chat.ts` takes: who words to a step's session, or to her chat, are from, by the caller's token. */
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
