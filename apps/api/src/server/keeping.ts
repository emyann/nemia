/**
 * How long the board's cookie is kept, and whether a request came over https, which decides its `Secure`: read by the session's
 * handlers (`cookieSent`, session.ts) and by the caller gate's renewal (`callerGate`, caller/caller.ts) alike, each off its own request.
 * Pure, so the gate reads it without the HttpApi's groups.
 */
import { Duration } from 'effect';

/**
 * How long the browser keeps the board's cookie after the person's last visit: each read it signs in sets it again for as long
 * (`cookieRenewed`, server/renewal.ts), so a person who opens the board within a month stays signed in, and one who does not, or whose
 * token is removed, signs in again.
 */
export const KEPT = Duration.days(30);

/** The board's cookie's keeping in seconds, as a `Max-Age` says it: what `callerGate` renews it with. */
export const KEPT_SECONDS = Duration.toSeconds(KEPT);

/** The first value of `header`, a proxy's list (`https, http`) read at its first, in lower case. */
const firstOf = (header: string | undefined) => (header ?? '').split(',')[0]?.trim().toLowerCase() ?? '';

/**
 * Whether a request came over https: a proxy in front that says so (`X-Forwarded-Proto: https`), else its own URL's scheme.
 * @param forwardedProto The request's `X-Forwarded-Proto` header, or undefined where it sends none.
 * @param url The request's URL, as it was sent.
 */
export function httpsBy(forwardedProto: string | undefined, url: string) {
  if (firstOf(forwardedProto) === 'https') return true;
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}
