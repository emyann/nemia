/**
 * A name an agent may speak under (agent-orchestrator, src/chat/speaker-name.ts, `speakerNameRefusal`), which `speakerRefusal`'s laws
 * read (`speaker.contract.ts`), leaning on what this spec proves of it. The constants the laws read are `src/chat/speaker-words.ts`'s.
 */
import { assume, type Implementation, spec } from '@emyann/tsverify';
import { RESERVED_SPEAKERS, SPEAKER_NAME_MAX, wellSpelt } from '../src/chat/speaker-words.ts';

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

/** `speakerNameRefusal`'s type, which `src/chat/speaker-name.ts` takes: why `name` is no name an agent speaks under, or undefined. */
export type SpeakerNameRefusal = Implementation<typeof speakerNameRefusalSpec>;

