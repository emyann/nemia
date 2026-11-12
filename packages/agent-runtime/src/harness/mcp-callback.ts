/**
 * The address a person pasted to complete a waiting MCP sign-in, read and judged before it is handed to the harness: the address their
 * browser was sent back to once they approved, which the daemon's own machine could not receive because the browser runs elsewhere.
 * `callbackRefusal` is proved by `contracts/mcp-callback.contract.ts`.
 */
import type { CallbackRefusalOf } from '../../contracts/mcp-callback.contract.ts';

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

/**
 * Whether `pasted` completes the sign-in that asked for `redirect`, or why not: no address, another address than the redirect, the
 * provider's refusal, no code, no state, in that order. The state itself is the harness's to match against the one it sent.
 */
export const callbackRefusal: CallbackRefusalOf = (pasted, redirect) => {
  if (pasted === undefined) return 'unreadable';
  if (pasted.origin !== redirect.origin || pasted.pathname !== redirect.pathname) return 'elsewhere';
  if (given(pasted.error)) return 'denied';
  if (!given(pasted.code)) return 'no-code';
  if (!given(pasted.state)) return 'no-state';
  return undefined;
};

/** `text` read as an address, `new URL`'s origin, path and OAuth parameters, or `undefined` where it does not parse. */
export const pastedOf = (text: string): PastedCallback | undefined => {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return undefined;
  }
  const query = url.searchParams;
  return { origin: url.origin, pathname: url.pathname, code: query.get('code'), state: query.get('state'), error: query.get('error') };
};

/** The redirect a sign-in on `callbackPort` asks the harness to send the browser to, as `pastedOf` would read it. */
export const redirectOf = (callbackPort: number): Redirect => {
  const url = new URL(redirectUriOf(callbackPort));
  return { origin: url.origin, pathname: url.pathname };
};

/** The redirect URI a sign-in on `callbackPort` hands the harness: Claude Code's child listens there. */
export const redirectUriOf = (callbackPort: number): string => `http://localhost:${callbackPort}/callback`;
