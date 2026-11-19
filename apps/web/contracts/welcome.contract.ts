/**
 * Whether the board sends a person from `/` to the welcome page, `/welcome` (`welcomeAsked`, src/lib/welcome.ts): a fresh store — no
 * harness activated and no factory filed but the default — whose person has not skipped the harness in this browser. Level-triggered: it
 * reads the readiness read as it is now, so a harness activated or a factory filed at a terminal takes the welcome away, and a store that
 * already has its harness is never onboarded again (its lapsed sign-in is Setup's to offer).
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * A piece of the readiness read, as far as the welcome goes: its name and area, its state, and the harness and part it is of, where it is a
 * harness's. The read's `factory` piece (area `factory`) is met once a factory is filed; the default factory files none.
 */
export type WelcomePieceRead = {
  readonly name: string;
  readonly area: string;
  readonly state: 'met' | 'missing' | 'unknown' | 'inactive';
  readonly harness?: { readonly name: string; readonly part: 'install' | 'sign-in' };
};

/** Whether `p` says a harness is activated: its install piece, met. */
const activated = (p: WelcomePieceRead) => p.harness !== undefined && p.harness.part === 'install' && p.state === 'met';

/** Whether `p` says a factory besides the default is filed: the read's factory piece, met. */
const filed = (p: WelcomePieceRead) => p.area === 'factory' && p.state === 'met';

const welcomeAskedSpec = spec<(pieces: readonly WelcomePieceRead[], skipped: boolean) => boolean>({
  ensures: {
    askedOnAFreshStore: {
      description: 'A store with no harness activated and no factory filed, whose person has not skipped, opens on the welcome',
      condition: ({ input: [pieces, skipped], output }) => skipped || pieces.some(activated) || pieces.some(filed) || output,
    },
    aSkipIsKept: {
      description: 'A person who skipped the harness in this browser is not sent to the welcome again',
      condition: ({ input: [, skipped], output }) => !skipped || !output,
    },
    neverOnceAHarnessIsActivated: {
      description: 'A store that has its harness, activated from the board, a terminal or an agent, is not onboarded again',
      condition: ({ input: [pieces], output }) => !pieces.some(activated) || !output,
    },
    neverOnceAFactoryIsFiled: {
      description: 'A store with a factory of its own is no fresh store, and opens on the board',
      condition: ({ input: [pieces], output }) => !pieces.some(filed) || !output,
    },
  },
});

/** `welcomeAsked`'s type, which src/lib/welcome.ts takes. */
export type WelcomeAsked = Implementation<typeof welcomeAskedSpec>;
