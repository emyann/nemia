/**
 * The three decisions of a remote MCP server signed in to by a code (agent-runtime, src/harness/mcp-device.ts): the OAuth 2.0 device
 * authorization grant (RFC 8628), offered where the server's provider advertises it, and the token it yields held by the runtime and
 * handed to each session in the server's `headers`.
 *
 * - `signInRouteOf`: which road a sign-in takes, read off the provider's authorization server metadata (RFC 8414), found through the
 *   server's protected resource metadata (RFC 9728): a code typed at the provider (`device`), or the harness's own browser sign-in
 *   (`browser`), which is every other server's.
 * - `pollOutcomeOf`: what one answer of the provider's token endpoint to a device code's poll means for the waiting sign-in.
 * - `tokenDueOf`: whether a held token is handed on as it is, refreshed first, or gone, so the server reads `needs-auth`.
 *
 * The I/O around each — the metadata fetched, the code asked, the poll's timer, the store's file — is the caller's, and the words a
 * person reads are the caller's too.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * A provider's authorization server metadata as the runtime reads it: its device authorization endpoint and token endpoint, null where
 * it names none, and whether its `grant_types_supported` lists the device grant (`urn:ietf:params:oauth:grant-type:device_code`).
 */
export type AuthServerMetadata = {
  readonly deviceAuthorizationEndpoint: string | null;
  readonly tokenEndpoint: string | null;
  readonly deviceGrant: boolean;
};

/**
 * The road a sign-in takes: a code the person types at the provider, with the two endpoints the runtime asks and polls; or the harness's
 * browser sign-in, which sends the person's browser back to a callback.
 */
export type SignInRoute =
  | { readonly route: 'device'; readonly deviceAuthorizationEndpoint: string; readonly tokenEndpoint: string }
  | { readonly route: 'browser' };

/** One answer of the token endpoint to a device code's poll: its `error`, and its `access_token`, null where absent. */
export type PollAnswer = { readonly error: string | null; readonly accessToken: string | null };

/**
 * What a poll's answer means: a token to hold (`token`); poll again at the same pace (`wait`) or slower (`slow-down`); or the sign-in
 * ends, its code expired (`expired`), the person refused it at the provider (`denied`), or anything else (`failed`).
 */
export type PollOutcome = 'token' | 'wait' | 'slow-down' | 'expired' | 'denied' | 'failed';

/**
 * A held token as its due is judged: when the access token expires and when its refresh token does, as milliseconds since the epoch,
 * null where the provider gave no expiry; and whether a refresh token is held at all.
 */
export type HeldToken = {
  readonly expiresAt: number | null;
  readonly refreshToken: boolean;
  readonly refreshExpiresAt: number | null;
};

/** What a held token asks before a session is handed it: nothing (`fresh`), a refresh (`refresh`), or a new sign-in (`gone`). */
export type TokenDue = 'fresh' | 'refresh' | 'gone';

/** Whether a value was given, and given something. */
const given = (value: string | null | undefined) => value !== null && value !== undefined && value !== '';

/** Whether an endpoint is one a token may be sent to: an https address, as RFC 8414 asks of every endpoint it names. */
const secure = (endpoint: string | null) => endpoint !== null && endpoint.startsWith('https://');

/** Whether `metadata` advertises the device grant, with both endpoints it needs, to a server that names its OAuth client. */
const advertised = (metadata: AuthServerMetadata | undefined, clientId: string | undefined) =>
  metadata !== undefined &&
  given(clientId) &&
  metadata.deviceGrant &&
  secure(metadata.deviceAuthorizationEndpoint) &&
  secure(metadata.tokenEndpoint);

const signInRouteSpec = spec<(metadata: AuthServerMetadata | undefined, clientId: string | undefined) => SignInRoute>({
  ensures: {
    aCodeExactlyWhereAdvertised: {
      description:
        'A server signs in by a code exactly where it names its OAuth client and its provider advertises the device grant with both endpoints at https addresses',
      condition: ({ input: [metadata, clientId], output }) => (output.route === 'device') === advertised(metadata, clientId),
    },
    theCodeAsksTheProvidersEndpoints: {
      description: 'A sign-in by a code asks and polls the very endpoints the provider advertises, and no other',
      condition: ({ input: [metadata], output }) =>
        output.route !== 'device' ||
        (metadata !== undefined &&
          output.deviceAuthorizationEndpoint === metadata.deviceAuthorizationEndpoint &&
          output.tokenEndpoint === metadata.tokenEndpoint),
    },
  },
});
export type SignInRouteOf = Implementation<typeof signInRouteSpec>;

/** The errors of RFC 8628 §3.5 a poll's answer names, GitHub's `token_expired` beside the RFC's `expired_token`. */
const named = (error: string | null) =>
  error === 'authorization_pending' ||
  error === 'slow_down' ||
  error === 'expired_token' ||
  error === 'token_expired' ||
  error === 'access_denied';

const pollOutcomeSpec = spec<(answer: PollAnswer) => PollOutcome>({
  ensures: {
    aTokenIsHeld: {
      description: 'An answer with an access token and no error is a token to hold',
      condition: ({ input: [a], output }) => given(a.error) || !given(a.accessToken) || output === 'token',
    },
    noTokenIsHeldWithoutOne: {
      description: 'A sign-in holds a token only from an answer that carries one and names no error',
      condition: ({ input: [a], output }) => output !== 'token' || (given(a.accessToken) && !given(a.error)),
    },
    pendingPollsAgain: {
      description: 'While the person has not yet typed the code, the poll goes on at its pace',
      condition: ({ input: [a], output }) => a.error !== 'authorization_pending' || output === 'wait',
    },
    slowDownSlows: {
      description: 'An answer asking to slow down slows the poll, and ends nothing',
      condition: ({ input: [a], output }) => a.error !== 'slow_down' || output === 'slow-down',
    },
    anExpiredCodeEnds: {
      description: 'A code that expired ends the sign-in as expired',
      condition: ({ input: [a], output }) => (a.error !== 'expired_token' && a.error !== 'token_expired') || output === 'expired',
    },
    aRefusalEnds: {
      description: 'A person who refused at the provider ends the sign-in as denied',
      condition: ({ input: [a], output }) => a.error !== 'access_denied' || output === 'denied',
    },
    anyOtherErrorFails: {
      description: 'An error RFC 8628 does not name for a poll ends the sign-in as failed, never polled again',
      condition: ({ input: [a], output }) => !given(a.error) || named(a.error) || output === 'failed',
    },
    neitherErrorNorTokenFails: {
      description: 'An answer with neither an error nor a token ends the sign-in as failed',
      condition: ({ input: [a], output }) => given(a.error) || given(a.accessToken) || output === 'failed',
    },
  },
});
export type PollOutcomeOf = Implementation<typeof pollOutcomeSpec>;

/** The largest instant or margin, in whole milliseconds, a clock gives: half of 2^53, so that no sum of two rounds. */
const CLOCK_BOUND = 2 ** 52;

/** Whether the access token is due at `now`: it expires, and `now` is within `marginMs` of that or past it. */
const due = (held: HeldToken, now: number, marginMs: number) => held.expiresAt !== null && now >= held.expiresAt - marginMs;

/** Whether a refresh token is held and still lives at `now`. */
const refreshLives = (held: HeldToken, now: number) => held.refreshToken && (held.refreshExpiresAt === null || now < held.refreshExpiresAt);

const tokenDueSpec = spec<(held: HeldToken, now: number, marginMs: number) => TokenDue>({
  requires: ({ input: [held, now, marginMs] }) =>
    Number.isInteger(marginMs) &&
    marginMs >= 0 &&
    marginMs <= CLOCK_BOUND &&
    Number.isInteger(now) &&
    now >= -CLOCK_BOUND &&
    now <= CLOCK_BOUND &&
    (held.expiresAt === null || (Number.isInteger(held.expiresAt) && held.expiresAt >= -CLOCK_BOUND && held.expiresAt <= CLOCK_BOUND)),
  ensures: {
    aTokenNotDueIsHandedOn: {
      description: 'A token that never expires, or whose expiry is further off than the margin, is handed on as it is',
      condition: ({ input: [held, now, marginMs], output }) => due(held, now, marginMs) || output === 'fresh',
    },
    aDueTokenIsRefreshedWhileItsRefreshLives: {
      description: 'A token due within the margin, with a refresh token that still lives, is refreshed before a session is handed it',
      condition: ({ input: [held, now, marginMs], output }) =>
        !due(held, now, marginMs) || !refreshLives(held, now) || output === 'refresh',
    },
    aDueTokenWithNoLivingRefreshIsGone: {
      description: 'A token due within the margin with no refresh token, or one that expired, is gone: the server asks a new sign-in',
      condition: ({ input: [held, now, marginMs], output }) => !due(held, now, marginMs) || refreshLives(held, now) || output === 'gone',
    },
  },
});
export type TokenDueOf = Implementation<typeof tokenDueSpec>;
