/**
 * Where the api listens (apps/api, src/port.ts, `bindOf`), read off `NEMIA_BIND` and whether the store is marked exposed (`WF_EXPOSED=1`):
 * this machine's loopback where it is unset or blank, the address it names where that is this machine's loopback, and any other address —
 * a private network's, or every interface (`0.0.0.0`, `::`) — only on a store marked exposed, where every route of its data needs a token
 * (`contracts/token-need.contract.ts`). An address on a store not marked exposed would let anyone who reaches it act as the person, so it
 * is refused, naming the fix (`WF_EXPOSED=1` and a token of yours, or no bind); a value that is no IP address is refused too, rather than
 * read as the default, which would listen somewhere the operator did not ask for. TLS stays outside: a private network or a reverse proxy.
 */
import { assume, type Implementation, spec } from '@emyann/tsverify';
import { asked, isAddress, LOOPBACK } from '../src/address/address.ts';

/** Why a bind is refused: not an IP address, or an address beyond this machine on a store not marked exposed. */
export type BindRefusal = 'not-an-address' | 'unexposed';

/** Where the api listens, or why it may not where it was asked. */
export type Bind = { readonly kind: 'bound'; readonly host: string } | { readonly kind: 'refused'; readonly reason: BindRefusal };

/**
 * Whether a text is an IP address, v4 or v6: the code's (`src/address/address.ts`), a parse the verifier does not read (a pattern, a URL), declared
 * pure and nothing more, as the write guard's contract assumes `loopback`. Which texts it takes is held by its tests (`src/port.test.ts`).
 */
export const address = assume(isAddress, { pure: true });

/**
 * The text a bind asks for, its white space left out, and blank where none is set: the code's (`src/address/address.ts`), a trim the verifier does
 * not read, declared pure and nothing more, so the laws read the value as the code does.
 */
export const askedText = assume(asked, { pure: true });

/** Whether an address is this machine's loopback alone. */
const loopbackAddress = (host: string): boolean => host === LOOPBACK || host === '::1';

/** Whether `value` asks for nothing: unset, or blank. */
const unasked = (value: string | undefined): boolean => asked(value) === '';

const bindOfSpec = spec<(value: string | undefined, exposed: boolean) => Bind>({
  ensures: {
    unaskedIsLoopback: {
      description: 'With no bind asked for, the api listens on this machine’s loopback alone',
      condition: ({ input: [value], output }) => !unasked(value) || (output.kind === 'bound' && output.host === LOOPBACK),
    },
    notAnAddressIsRefused: {
      description: 'A bind that is no IP address is refused as such, never read as the default',
      condition: ({ input: [value], output }) =>
        unasked(value) || isAddress(asked(value)) || (output.kind === 'refused' && output.reason === 'not-an-address'),
    },
    beyondThisMachineNeedsExposed: {
      description: 'An address beyond this machine’s loopback on a store not marked exposed is refused, unexposed',
      condition: ({ input: [value, exposed], output }) =>
        unasked(value) ||
        exposed ||
        !isAddress(asked(value)) ||
        loopbackAddress(asked(value)) ||
        (output.kind === 'refused' && output.reason === 'unexposed'),
    },
    anAllowedAddressIsListenedOn: {
      description: 'An address that is this machine’s loopback, or any address on an exposed store, is listened on as asked',
      condition: ({ input: [value, exposed], output }) =>
        unasked(value) ||
        !isAddress(asked(value)) ||
        !(exposed || loopbackAddress(asked(value))) ||
        (output.kind === 'bound' && output.host === asked(value)),
    },
  },
});

/** `bindOf`'s type, which `src/port.ts` takes: it then imports nothing of tsverify. */
export type BindOf = Implementation<typeof bindOfSpec>;
