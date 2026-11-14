/**
 * Whether the address a person pasted completes a waiting MCP sign-in (agent-runtime, src/harness/mcp-callback.ts, `callbackRefusal`):
 * the address their browser was sent back to once they approved the server's OAuth app, which the daemon's own machine could not
 * receive because the browser runs elsewhere. The sign-in's session hands it to the harness (`mcpSubmitOAuthCallbackUrl`), which
 * checks the state against the one it sent; this decides, before that, what the runtime refuses in words of its own.
 *
 * Read off the pasted text by `new URL` (none where it does not parse) and compared with the redirect the sign-in asked the harness to
 * send the browser to (`http://localhost:<callbackPort>/callback`). The words of each refusal are the caller's.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** A pasted address as the runtime reads it: its origin and path, and the OAuth parameters of its query, null where absent. */
export type PastedCallback = {
  readonly origin: string;
  readonly pathname: string;
  readonly code: string | null;
  readonly state: string | null;
  readonly error: string | null;
};

/** The redirect a sign-in asked for: its origin and path. */
export type Redirect = { readonly origin: string; readonly pathname: string };

/**
 * Why a pasted address is refused: it is no address (`unreadable`); it is not the redirect the sign-in asked for (`elsewhere`); the
 * provider said no (`denied`, its `error`); it carries no code (`no-code`), or no state (`no-state`).
 */
export type CallbackRefusal = 'unreadable' | 'elsewhere' | 'denied' | 'no-code' | 'no-state';

/** Whether an OAuth parameter was given, and given something. */
const given = (value: string | null): boolean => value !== null && value !== '';

/** Whether `pasted` is the redirect `redirect` names: the same origin and the same path. */
const atTheRedirect = (pasted: PastedCallback, redirect: Redirect): boolean =>
  pasted.origin === redirect.origin && pasted.pathname === redirect.pathname;

const callbackSpec = spec<(pasted: PastedCallback | undefined, redirect: Redirect) => CallbackRefusal | undefined>({
  ensures: {
    noAddressIsUnreadable: {
      description: 'Text that is no address is refused as unreadable',
      condition: ({ input: [pasted], output }) => pasted !== undefined || output === 'unreadable',
    },
    anotherAddressIsElsewhere: {
      description: 'An address that is not the redirect the sign-in asked for is refused, whatever its query carries',
      condition: ({ input: [pasted, redirect], output }) =>
        pasted === undefined || atTheRedirect(pasted, redirect) || output === 'elsewhere',
    },
    aRefusalOfTheProviderIsDenied: {
      description: 'The redirect carrying the provider’s error says the person or the provider said no',
      condition: ({ input: [pasted, redirect], output }) =>
        pasted === undefined || !atTheRedirect(pasted, redirect) || !given(pasted.error) || output === 'denied',
    },
    noCodeIsRefused: {
      description: 'The redirect with no error and no code completes nothing',
      condition: ({ input: [pasted, redirect], output }) =>
        pasted === undefined || !atTheRedirect(pasted, redirect) || given(pasted.error) || given(pasted.code) || output === 'no-code',
    },
    noStateIsRefused: {
      description: 'The redirect with a code and no state is refused: the harness matches the state to its own sign-in',
      condition: ({ input: [pasted, redirect], output }) =>
        pasted === undefined ||
        !atTheRedirect(pasted, redirect) ||
        given(pasted.error) ||
        !given(pasted.code) ||
        given(pasted.state) ||
        output === 'no-state',
    },
    aWholeCallbackIsHandedOn: {
      description: 'The redirect with a code and a state, and no error, is refused nothing: the harness is handed it',
      condition: ({ input: [pasted, redirect], output }) =>
        pasted === undefined ||
        !atTheRedirect(pasted, redirect) ||
        given(pasted.error) ||
        !given(pasted.code) ||
        !given(pasted.state) ||
        output === undefined,
    },
  },
});
export type CallbackRefusalOf = Implementation<typeof callbackSpec>;
