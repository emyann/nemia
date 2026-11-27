/**
 * A remote MCP server signed in to by a code (RFC 8628): the provider's metadata read to choose the road, the code asked, the poll of
 * the token endpoint, and the refresh of a token. The runtime holds the token (`mcp-token.ts`) and hands it to each session in the
 * server's `headers`, which is the road the Agent SDK documents for a host that runs the OAuth flow itself.
 *
 * The three decisions — `signInRouteOf`, `pollOutcomeOf`, `tokenDueOf` — are proved by `contracts/mcp-device.contract.ts`. Nothing
 * here sends a client secret: GitHub's documentation lists none for a device flow's poll or its refresh, and a token that came by a
 * device flow is refreshed with the client id alone.
 *
 * What a person or a log reads of these functions' failures names the address asked and the status it answered, never a code or a token.
 */
import { Option, Schema } from 'effect';
import type {
  AuthServerMetadata,
  HeldToken,
  PollAnswer,
  PollOutcome,
  PollOutcomeOf,
  SignInRoute,
  SignInRouteOf,
  TokenDue,
  TokenDueOf,
} from '../../contracts/mcp-device.contract.ts';
import type { RemoteMcpServer } from './seam.ts';

export type { AuthServerMetadata, HeldToken, PollAnswer, PollOutcome, SignInRoute, TokenDue };

/** The grant type of RFC 8628 §3.4, which a poll names and an authorization server's metadata lists. */
export const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

/** How long one request to a provider may take before it is given up as failed. */
const REQUEST_MS = 20_000;

/** Whether a value was given, and given something. */
const given = (value: string | null | undefined) => value !== null && value !== undefined && value !== '';

/** Whether an endpoint is one a token may be sent to: an https address. */
const secure = (endpoint: string | null) => endpoint !== null && endpoint.startsWith('https://');

/**
 * Which road a sign-in takes: a code where the server names its OAuth client and its provider advertises the device grant with both
 * endpoints at https addresses, the browser otherwise.
 * @param metadata The provider's authorization server metadata, or undefined where it published none.
 * @param clientId The server's OAuth client id, or undefined where it names none.
 */
export const signInRouteOf: SignInRouteOf = (metadata, clientId) => {
  if (
    metadata !== undefined &&
    given(clientId) &&
    metadata.deviceGrant &&
    metadata.deviceAuthorizationEndpoint !== null &&
    metadata.tokenEndpoint !== null &&
    secure(metadata.deviceAuthorizationEndpoint) &&
    secure(metadata.tokenEndpoint)
  ) {
    return { route: 'device', deviceAuthorizationEndpoint: metadata.deviceAuthorizationEndpoint, tokenEndpoint: metadata.tokenEndpoint };
  }
  return { route: 'browser' };
};

/**
 * What one answer of the token endpoint to a poll means: a token to hold, a wait at the same pace or a slower one, or an end.
 * @param answer The answer's `error` and `access_token`, null where absent.
 */
export const pollOutcomeOf: PollOutcomeOf = (answer) => {
  if (given(answer.error)) {
    switch (answer.error) {
      case 'authorization_pending':
        return 'wait';
      case 'slow_down':
        return 'slow-down';
      case 'expired_token':
      case 'token_expired':
        return 'expired';
      case 'access_denied':
        return 'denied';
      default:
        return 'failed';
    }
  }
  return given(answer.accessToken) ? 'token' : 'failed';
};

/**
 * Whether a held token is handed on as it is, refreshed first, or gone.
 * @param held When the access token and its refresh token expire, and whether a refresh token is held.
 * @param now The time, in milliseconds since the epoch.
 * @param marginMs How long before its expiry a token counts as due.
 */
export const tokenDueOf: TokenDueOf = (held, now, marginMs) => {
  const due = held.expiresAt !== null && now >= held.expiresAt - marginMs;
  if (!due) return 'fresh';
  const lives = held.refreshToken && (held.refreshExpiresAt === null || now < held.refreshExpiresAt);
  return lives ? 'refresh' : 'gone';
};

/** A JSON object's key read as text, or null. */
const textOf = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null);

/** A JSON object's key read as a number of seconds, from a number or a numeric text, or null. */
const secondsOf = (value: unknown) => {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
};

const JsonObject = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)));

/** A body read as an object: JSON where it parses to one, else form-encoded as GitHub answers where not asked for JSON. */
const bodyOf = (text: string) => {
  const json = JsonObject(text);
  const body: Record<string, unknown> = Option.isSome(json) ? json.value : Object.fromEntries(new URLSearchParams(text));
  return body;
};

/** One request to `url`, answered as an object with the status; the network failing throws, naming the address and not the body. */
const asked = async (url: string, init: RequestInit, timeoutMs: number = REQUEST_MS) => {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
  } catch (e) {
    throw new Error(`${url} could not be reached: ${(e as Error).message}. Try again.`, { cause: e });
  }
  return { status: response.status, body: bodyOf(await response.text()) };
};

/** The address of the metadata document of the well-known `name` for `resource`, as RFC 8615 spells it: the name between host and path. */
const wellKnown = (resource: string, name: string) => {
  const url = new URL(resource);
  const path = url.pathname === '/' ? '' : url.pathname;
  return `${url.origin}/.well-known/${name}${path}`;
};

/** A provider's metadata document read as the runtime reads it. */
const metadataOf = (body: Record<string, unknown>) => {
  const grants = body.grant_types_supported;
  return {
    deviceAuthorizationEndpoint: textOf(body.device_authorization_endpoint),
    tokenEndpoint: textOf(body.token_endpoint),
    deviceGrant: Array.isArray(grants) && grants.includes(DEVICE_GRANT),
  } satisfies AuthServerMetadata;
};

/**
 * The road `server` signs in by: its protected resource metadata (RFC 9728) names its authorization server, whose metadata (RFC 8414)
 * says whether it offers the device grant (`signInRouteOf`). A document the provider does not publish (a 404) is the browser road;
 * a network failure is thrown, in words that say to try again, rather than fallen through to the browser road.
 * @param server The recorded remote server.
 */
export const routeOf = async (server: RemoteMcpServer) => {
  const clientId = server.oauth?.clientId;
  if (!given(clientId)) return signInRouteOf(undefined, clientId);
  const resource = await asked(wellKnown(server.url, 'oauth-protected-resource'), { headers: { accept: 'application/json' } });
  const issuer = Array.isArray(resource.body.authorization_servers) ? textOf(resource.body.authorization_servers[0]) : null;
  if (resource.status !== 200 || issuer === null) return signInRouteOf(undefined, clientId);
  const metadata = await asked(wellKnown(issuer, 'oauth-authorization-server'), { headers: { accept: 'application/json' } });
  return signInRouteOf(metadata.status === 200 ? metadataOf(metadata.body) : undefined, clientId);
};

/** A code the provider gave: what the person types and where, how long it lives, and how often it may be polled. */
export type DeviceCode = {
  readonly deviceCode: string;
  readonly userCode: string;
  readonly verificationUri: string;
  readonly expiresInSeconds: number;
  readonly intervalSeconds: number;
};

/** The seconds RFC 8628 §3.2 gives a poll's interval and a code's life where the provider names none. */
const DEFAULT_INTERVAL_S = 5;
const DEFAULT_EXPIRES_S = 900;

/** The form body of a request to a token or device endpoint. */
const formOf = (fields: Record<string, string>) => ({
  method: 'POST',
  headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(fields).toString(),
});

/**
 * A code asked of the provider's device authorization endpoint, with the client id alone: no secret, no scope. Throws, saying why,
 * where the provider refuses or answers no code.
 * @param endpoint The provider's device authorization endpoint.
 * @param clientId The server's OAuth client id.
 */
export const deviceCodeOf = async (endpoint: string, clientId: string) => {
  const answer = await asked(endpoint, formOf({ client_id: clientId }));
  const deviceCode = textOf(answer.body.device_code);
  const userCode = textOf(answer.body.user_code);
  const verificationUri = textOf(answer.body.verification_uri);
  if (answer.status !== 200 || deviceCode === null || userCode === null || verificationUri === null) {
    const error = textOf(answer.body.error);
    throw new Error(
      `${endpoint} gave no code (status ${answer.status}${error === null ? '' : `, ${error}`}). ${
        error === 'device_flow_disabled'
          ? "The provider's app has the device flow switched off: its owner enables it in the app's settings."
          : "Sign in again; if it keeps failing, read the provider's answer in its documentation."
      }`,
    );
  }
  return {
    deviceCode,
    userCode,
    verificationUri,
    expiresInSeconds: secondsOf(answer.body.expires_in) ?? DEFAULT_EXPIRES_S,
    intervalSeconds: secondsOf(answer.body.interval) ?? DEFAULT_INTERVAL_S,
  } satisfies DeviceCode;
};

/** The token a provider granted: both tokens, and how long each lives in seconds, null where it said none. */
export type TokenGrant = {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly expiresInSeconds: number | null;
  readonly refreshExpiresInSeconds: number | null;
};

/** The token endpoint's answer read: its error, and its grant where it holds an access token. */
const grantOf = (body: Record<string, unknown>) => {
  const accessToken = textOf(body.access_token);
  const error = textOf(body.error);
  return {
    answer: { error, accessToken } satisfies PollAnswer,
    grant:
      accessToken === null || error !== null
        ? undefined
        : ({
            accessToken,
            refreshToken: textOf(body.refresh_token),
            expiresInSeconds: secondsOf(body.expires_in),
            refreshExpiresInSeconds: secondsOf(body.refresh_token_expires_in),
          } satisfies TokenGrant),
  };
};

/**
 * One poll of the token endpoint for a device code, judged by `pollOutcomeOf`: no secret is sent.
 * @param tokenEndpoint The provider's token endpoint.
 * @param clientId The server's OAuth client id.
 * @param deviceCode The device code the provider gave.
 */
export const pollOnce = async (tokenEndpoint: string, clientId: string, deviceCode: string) => {
  const answered = await asked(tokenEndpoint, formOf({ client_id: clientId, device_code: deviceCode, grant_type: DEVICE_GRANT }));
  const { answer, grant } = grantOf(answered.body);
  return { outcome: pollOutcomeOf(answer), grant };
};

/**
 * A held token's refresh: the refresh grant with the client id and the refresh token, no secret. Answers the new grant, or `refused`
 * where the provider answered with an OAuth `error` (`invalid_grant` among them) below a 5xx and not a 429: the refresh token is spent
 * or gone. A network failure, a 5xx, a 429 or an answer with neither grant nor error throws: the token is not taken for spent.
 * @param tokenEndpoint The provider's token endpoint, kept with the token.
 * @param clientId The server's OAuth client id, kept with the token.
 * @param refreshToken The refresh token held.
 * @param timeoutMs How long the request may take before it is given up, `REQUEST_MS` where absent.
 */
export const refreshOnce = async (tokenEndpoint: string, clientId: string, refreshToken: string, timeoutMs?: number) => {
  const answered = await asked(
    tokenEndpoint,
    formOf({ client_id: clientId, grant_type: 'refresh_token', refresh_token: refreshToken }),
    timeoutMs,
  );
  const { grant } = grantOf(answered.body);
  if (grant !== undefined) return grant;
  const error = textOf(answered.body.error);
  if (error === null || answered.status >= 500 || answered.status === 429) {
    throw new Error(`${tokenEndpoint} gave no refresh (status ${answered.status}${error === null ? '' : `, ${error}`}). Try again.`);
  }
  return 'refused' as const;
};
