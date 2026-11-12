/**
 * Whether the board's Setup page asks which harness to activate (`harnessAsked`, src/lib/setup.ts): the first visit's question, shown
 * while no harness is activated on the server and the person has not skipped it in this browser. Level-triggered: it reads the
 * readiness read as it is now, so a harness activated from the CLI or by Nemia's agent takes the question away, and one deactivated
 * brings it back unless it was skipped.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** A piece of the readiness read, as far as the question goes: its state, and the harness and part it is of, where it is a harness's. */
export type HarnessPieceRead = {
  readonly state: 'met' | 'missing' | 'unknown' | 'inactive';
  readonly harness?: { readonly name: string; readonly part: 'install' | 'sign-in' };
};

/** Whether `p` says a harness is installed: its install piece, met. */
const activated = (p: HarnessPieceRead): boolean => p.harness !== undefined && p.harness.part === 'install' && p.state === 'met';

const harnessAskedSpec = spec<(pieces: readonly HarnessPieceRead[], skipped: boolean) => boolean>({
  ensures: {
    askedWhileNoneIsActivated: {
      description: 'The question is asked while no harness is installed on the server and the person has not skipped it',
      condition: ({ input: [pieces, skipped], output }) => skipped || pieces.some(activated) || output,
    },
    aSkipIsKept: {
      description: 'A question the person skipped is not asked again',
      condition: ({ input: [, skipped], output }) => !skipped || !output,
    },
    notAskedOnceOneIsActivated: {
      description: 'Once a harness is installed, from the board, the CLI or an agent, the question is not asked',
      condition: ({ input: [pieces], output }) => !pieces.some(activated) || !output,
    },
  },
});

/** `harnessAsked`'s type, which src/lib/setup.ts takes. */
export type HarnessAsked = Implementation<typeof harnessAskedSpec>;
