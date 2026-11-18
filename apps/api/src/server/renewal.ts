/**
 * Whether a request renews the board's sign-in (`cookieRenewed`, proved by `apps/api/contracts/cookie-renewal.contract.ts`), asked by
 * `callerGate` (caller/caller.ts) once the request's token is judged live: a read (`GET`) the person's cookie alone signed in sets the
 * cookie again with its whole keeping, so a board in use stays signed in. Pure: it imports the contract's types alone, so the verifier
 * loads it without the api.
 */
import type { CookieRenewed } from '../../contracts/cookie-renewal.contract.ts';

/**
 * Whether the board's cookie is set again for a request: a read, its token presented by the cookie alone, the person's.
 * @param method The request's method, in upper case.
 * @param presented Where the token it was judged by came from: the bearer, the board's cookie, or none.
 * @param caller What kind of caller the token is: the person, or an agent.
 */
export const cookieRenewed: CookieRenewed = (method, presented, caller) =>
  method === 'GET' && presented === 'cookie' && caller === 'person';
