/**
 * Who speaks to a long-lived session in its chat (agent-orchestrator, src/chat/chat.ts): the person, or an agent named as itself
 * (`Speaker`). A name an agent may speak under (`speakerNameRefusal`); whether words from a speaker are taken, given where they came
 * from (`Via`, which the api reads off the request) and the names the person allowed (`speakerRefusal`); the words the keeper says
 * them to the session in (`framedFor`); and the person's list of allowed names, one allowed (`withSpeaker`) or taken back
 * (`withoutSpeaker`).
 *
 * The laws are the card's: an agent's words are never said nor shown as the person's, the person's words come from the board, and an
 * agent speaks only under a name the person allowed. The words of each refusal are nobody's law, only its kind.
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
  type Via,
  wellSpelt,
} from '../src/chat/chat.ts';

/** The characters a name takes, which no law reads (`speakerNameRefusal`'s `open`): declared pure, and nothing more. */
export const spelt = assume(wellSpelt, { pure: true });

/** Whether no name of `names` is there twice: each differs from every name before it. */
const distinct = (names: readonly string[]): boolean => names.every((n, i) => !names.slice(0, i).includes(n));

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

const speakerRefusalSpec = spec<(speaker: Speaker, via: Via, allowed: readonly string[]) => SpeakerRefused | null>({
  ensures: {
    thePersonFromTheBoard: {
      description: 'The person’s words from the board are taken',
      condition: ({ input: [speaker, via], output }) => speaker.kind !== 'person' || via !== 'board' || output === null,
    },
    thePersonOnlyFromTheBoard: {
      description: 'Words from anywhere but the board that name no agent are refused as Invalid: they must say who wrote them',
      condition: ({ input: [speaker, via], output }) => speaker.kind !== 'person' || via === 'board' || output?.kind === 'Invalid',
    },
    aBadNameIsInvalid: {
      description: 'An agent under a name no agent speaks under is refused as Invalid, whatever the person allowed',
      condition: ({ input: [speaker], output }) => speaker.kind !== 'agent' || wellNamedAgent(speaker) || output?.kind === 'Invalid',
    },
    unallowedIsConflict: {
      description: 'An agent whose name the person has not allowed is refused as Conflict',
      condition: ({ input: [speaker, , allowed], output }) =>
        !wellNamedAgent(speaker) || speaker.kind !== 'agent' || allowed.includes(speaker.name) || output?.kind === 'Conflict',
    },
    allowedIsTaken: {
      description: 'An agent whose name the person allowed is taken, from the board or elsewhere',
      condition: ({ input: [speaker, , allowed], output }) =>
        !wellNamedAgent(speaker) || speaker.kind !== 'agent' || !allowed.includes(speaker.name) || output === null,
    },
  },
});
/** `speakerRefusal`'s type, which `src/chat/chat.ts` takes. */
export type SpeakerRefusal = Implementation<typeof speakerRefusalSpec>;

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
  },
});
/** `framedFor`'s type, which `src/chat/chat.ts` takes: the words `text` from `speaker` are said to the session in. */
export type FramedFor = Implementation<typeof framedForSpec>;

const withSpeakerSpec = spec<(allowed: readonly string[], name: string) => string[]>({
  requires: ({ input: [allowed] }) => distinct(allowed),
  ensures: {
    holdsIt: {
      description: 'A name the person allows is allowed after',
      condition: ({ input: [, name], output }) => output.includes(name),
    },
    keepsEach: {
      description: 'Allowing a name takes back no other',
      condition: ({ input: [allowed], output }) => allowed.every((n) => output.includes(n)),
    },
    noOther: {
      description: 'Allowing a name allows no name besides it',
      condition: ({ input: [allowed, name], output }) => output.every((n) => n === name || allowed.includes(n)),
    },
    once: {
      description: 'A name allowed twice is listed once',
      condition: ({ output }) => distinct(output),
    },
  },
});
/** `withSpeaker`'s type, which `src/chat/chat.ts` takes. */
export type WithSpeaker = Implementation<typeof withSpeakerSpec>;

const withoutSpeakerSpec = spec<(allowed: readonly string[], name: string) => string[]>({
  ensures: {
    holdsNone: {
      description: 'A name the person takes back is allowed no more',
      condition: ({ input: [, name], output }) => !output.includes(name),
    },
    keepsOthers: {
      description: 'Taking a name back takes back no other',
      condition: ({ input: [allowed, name], output }) => allowed.every((n) => n === name || output.includes(n)),
    },
    noOther: {
      description: 'Taking a name back allows nothing new',
      condition: ({ input: [allowed], output }) => output.every((n) => allowed.includes(n)),
    },
  },
});
/** `withoutSpeaker`'s type, which `src/chat/chat.ts` takes. */
export type WithoutSpeaker = Implementation<typeof withoutSpeakerSpec>;
