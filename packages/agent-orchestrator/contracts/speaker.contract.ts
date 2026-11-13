/**
 * Who speaks to a long-lived session in its chat (agent-orchestrator, src/chat/chat.ts): the person, or an agent named as itself
 * (`Speaker`), which is the caller the request's token says (`stepSpeaker`, step-speaker.contract.ts). A name an agent may speak under
 * (`speakerNameRefusal`); whether words from a speaker are taken (`speakerRefusal`); whether a request that still says who its words are
 * from, a field retired for the caller's own token, is refused (`fromRefusal`); and the words the keeper says them to the session in
 * (`framedFor`).
 *
 * The laws are the card's: an agent's words are never said nor shown as the person's, and who speaks is who holds the token, never who
 * the words say they are from. The words of each refusal are nobody's law, only its kind.
 *
 * The types and constants the laws read are `src/chat/chat.ts`'s, and so is the `speakerNameRefusal` that `speakerRefusal`'s laws read.
 */
import { assume, type Implementation, spec } from '@emyann/tsverify';
import {
  PERSON_FRAME,
  RESERVED_SPEAKERS,
  SPEAKER_NAME_MAX,
  type Speaker,
  type SpeakerRefused,
  speakerNameRefusal,
  wellSpelt,
} from '../src/chat/chat.ts';

/** The characters a name takes, which no law reads (`speakerNameRefusal`'s `open`): declared pure, and nothing more. */
export const spelt = assume(wellSpelt, { pure: true });

const speakerNameRefusalSpec = spec<(name: string) => string | undefined>({
  /**
   * The characters a name takes — lowercase letters, digits, `.`, `_`, `-` and `/`, opening with a letter or a digit — are a pattern,
   * which the verifier does not read (tsverify's `docs/reads.md`: a string's `replace` and the like "not modeled", and no regular
   * expression): which other names are refused is left to the code, and held by its tests (`src/chat/chat.test.ts`).
   */
  open: ['output'],
  ensures: {
    emptyRefused: {
      description: 'An empty name is no name an agent speaks under',
      condition: ({ input: [name], output }) => name.length > 0 || output !== undefined,
    },
    longRefused: {
      description: 'A name longer than SPEAKER_NAME_MAX is refused',
      condition: ({ input: [name], output }) => name.length <= SPEAKER_NAME_MAX || output !== undefined,
    },
    reservedRefused: {
      description: 'No agent speaks under a name that reads as the person or as the session’s own agent',
      condition: ({ input: [name], output }) => !RESERVED_SPEAKERS.includes(name) || output !== undefined,
    },
  },
});
/** `speakerNameRefusal`'s type, which `src/chat/chat.ts` takes: why `name` is no name an agent speaks under, or undefined. */
export type SpeakerNameRefusal = Implementation<typeof speakerNameRefusalSpec>;

/** Whether `speaker` is an agent whose name is one an agent speaks under. */
const wellNamedAgent = (speaker: Speaker): boolean => speaker.kind === 'agent' && speakerNameRefusal(speaker.name) === undefined;

const speakerRefusalSpec = spec<(speaker: Speaker) => SpeakerRefused | null>({
  ensures: {
    thePersonIsTaken: {
      description: 'The person’s words are taken, whatever token of theirs carried them: the board’s, a shell’s or a script’s',
      condition: ({ input: [speaker], output }) => speaker.kind !== 'person' || output === null,
    },
    aBadNameIsInvalid: {
      description: 'An agent under a name no agent speaks under is refused as Invalid',
      condition: ({ input: [speaker], output }) => speaker.kind !== 'agent' || wellNamedAgent(speaker) || output?.kind === 'Invalid',
    },
    aWellNamedAgentIsTaken: {
      description: 'An agent under a name an agent speaks under is taken: its token says who it is, and no list of the person’s is read',
      condition: ({ input: [speaker], output }) => !wellNamedAgent(speaker) || output === null,
    },
  },
});
/** `speakerRefusal`'s type, which `src/chat/chat.ts` takes. */
export type SpeakerRefusal = Implementation<typeof speakerRefusalSpec>;

const fromRefusalSpec = spec<(from: Speaker | undefined) => SpeakerRefused | null>({
  ensures: {
    anAgentNamedIsInvalid: {
      description:
        'Words that say they are from an agent are refused as Invalid: an agent speaks with a token of its own, and words name no one else',
      condition: ({ input: [from], output }) => from?.kind !== 'agent' || output?.kind === 'Invalid',
    },
    thePersonOrNoneIsIgnored: {
      description: 'Words that name no one, or the person, are refused for nothing: the caller the token says speaks',
      condition: ({ input: [from], output }) => from?.kind === 'agent' || output === null,
    },
  },
});
/**
 * `fromRefusal`'s type, which `src/chat/chat.ts` takes: why a request whose words say who they are from (`from`, retired) is refused, or
 * null where it is not.
 */
export type FromRefusal = Implementation<typeof fromRefusalSpec>;

const framedForSpec = spec<(speaker: Speaker, text: string) => string>({
  ensures: {
    thePersonAsBefore: {
      description:
        'The person’s words are said in the frame they always were, so a said journalled before this change is still claimed by its entry',
      condition: ({ input: [speaker, text], output }) => speaker.kind !== 'person' || output === PERSON_FRAME + text,
    },
    anAgentIsNeverThePerson: {
      description: 'An agent’s words are never said to the session as the person’s',
      condition: ({ input: [speaker], output }) => speaker.kind !== 'agent' || !output.startsWith(PERSON_FRAME),
    },
    anAgentIsNamed: {
      description: 'An agent’s words are said with the name it speaks under',
      condition: ({ input: [speaker], output }) => speaker.kind !== 'agent' || output.includes(speaker.name),
    },
    carriesTheWords: {
      description: 'The words themselves are said whole, last',
      condition: ({ input: [, text], output }) => output.endsWith(text),
    },
    anAgentInItsFrame: {
      description:
        'An agent’s words are said in one frame, its name between the same two phrases, so a step’s journal reads them back as its own (`saidBy`, step-speaker.contract.ts)',
      condition: ({ input: [speaker, text], output }) =>
        speaker.kind !== 'agent' || output === 'The agent ' + speaker.name + ' writes, not the person: ' + text,
    },
  },
});
/** `framedFor`'s type, which `src/chat/chat.ts` takes: the words `text` from `speaker` are said to the session in. */
export type FramedFor = Implementation<typeof framedForSpec>;
