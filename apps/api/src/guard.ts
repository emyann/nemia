/**
 * The guard on the board's writes: a request refused before its body is read, whatever it asks for.
 *
 * Three writes pass it: a start (`POST /api/runs`, workflows.ts), which writes a run's record; an ask for another try
 * (`POST /api/runs/:id/steps/:step/retry`, app.ts), which writes a person's ask file; and words for a step's running session
 * (`POST /api/runs/:id/steps/:step/say`, app.ts), which the engine hands the session and journals. Each is what an agent acts on in
 * the repository — once a tick files it, or at once — so a page on another site must not be able to make any of them; and a
 * `fetch` with a body, from any page, reaches the api without the browser asking it first, unless the body is JSON.
 */

/** One status and what to do next. */
export type Refusal = { status: 400 | 403 | 404 | 409 | 415 | 422; error: string };

/** A write the guard stands in front of, in the words its refusals say it in. */
export type Guarded = {
  /** The request: `POST /api/runs`. */
  route: string;
  /** What the api does for it, and the same thing said of a site that would make one: `starts a run`, `start one`. */
  does: string;
  forAnother: string;
  /** Why a page on another site must not make it. */
  why: string;
  /** Where to make it instead: said after a refused name, and after a refused site. */
  reach: string;
  instead: string;
  /** The body it takes, as its refusal of another content type says it. */
  shape: string;
};

/** The names a write may be addressed to: this machine's loopback, on any port. The api listens on 127.0.0.1 alone (port.ts). */
const LOOPBACK_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i;

/**
 * Why a write is refused before its body is read, or null.
 *
 * - Addressed to a name that is not this machine (`Host`): a site whose name was pointed at 127.0.0.1, which the browser
 *   treats as that site's own origin. Absent — a client that sends none — is this machine.
 * - Made by a page on another site (`Sec-Fetch-Site`, which the browser sets and no page can): anything but `same-origin`,
 *   which the board is, through vite's proxy too. `same-site` is refused: another port on localhost is the same site.
 *   Absent is a client outside a browser, such as curl.
 * - Not sent as `application/json`: the one body a page on another site cannot send without the browser asking the api
 *   first, and the api answers no such question. That holds in a browser too old to send `Sec-Fetch-Site`.
 *
 * Not `Origin` against `Host`: vite's proxy rewrites `Host` to the api's (`changeOrigin`), so the board's own write would read
 * as another site's.
 */
export function refusedBeforeReading(write: Guarded, host: string | undefined, site: string | undefined, type: string | undefined): Refusal | null {
  if (host !== undefined && !LOOPBACK_HOST.test(host.trim())) {
    return {
      status: 403,
      error: `${write.route} refuses a request addressed to ${host}: the api ${write.does} only for a request to this machine — localhost, 127.0.0.1 or [::1] — so that a site whose name points here cannot ${write.forAnother}. Reach the api at http://127.0.0.1:<port>, or ${write.reach}.`,
    };
  }
  if (site !== undefined && site !== 'same-origin') {
    return {
      status: 403,
      error: `${write.route} refuses a request made by a page on another site (Sec-Fetch-Site: ${site}): ${write.why}. ${write.instead}.`,
    };
  }
  const media = type?.split(';')[0]?.trim().toLowerCase();
  if (media !== 'application/json') {
    return {
      status: 415,
      error: `${write.route} takes its body as \`content-type: application/json\`, and this request sent ${media ? `\`${media}\`` : 'no content-type'} — a body any page can send without asking. Send ${write.shape}, with that header.`,
    };
  }
  return null;
}
