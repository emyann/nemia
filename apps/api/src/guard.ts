/**
 * The guard on the board's writes: a request refused before its body is read, whatever it asks for.
 *
 * Twenty-eight writes pass it: a factory signed in to a server (`POST /api/factories/:factory/servers/:server/sign-in`,
 * servers/sign-in.ts) or signed out of one (`DELETE` on the same path), each of which writes the harness's own store, which every
 * session of the factory reads; a start (`POST /api/runs`, workflows.ts), which writes a run's record — and, for an inbox card, removes the
 * card; an ask for another try (`POST /api/runs/:id/steps/:step/retry`, asks.ts) or another round (`POST /api/runs/:id/round`, asks.ts,
 * kept for `nemia retry --round`), each of which writes a person's ask file; an approval of a step waiting at its gate (`POST
 * /api/runs/:id/steps/:step/approve`, asks.ts), which writes a person's approval file, or an acceptance of a loop out of rounds as it
 * stands (`POST /api/runs/:id/steps/:step/accept`, asks.ts, kept for `nemia approve` of a loop), which writes a person's acceptance file;
 * words for a step's running session (`POST /api/runs/:id/steps/:step/say`, asks.ts),
 * which the engine hands the session and journals; a card filed in the inbox (`POST /api/inbox`, inbox.ts) or dropped from it (`DELETE
 * /api/inbox/:name`, inbox.ts); a card queued to start on its own (`POST /api/inbox/:name/queue`, inbox.ts) or taken off the queue (`DELETE
 * /api/inbox/:name/queue`), each of which writes the store's inbox; and a workflow of yours built on the board — made (`POST
 * /api/workflows/yours`), or put back from its steps and the schemas pasted for them (`PUT /api/workflows/yours/:name`), builder.ts — each
 * of which writes the store's `workflows/`, and removes a step's file the folder has dropped — or removed whole (`DELETE
 * /api/workflows/yours/:name`, remove.ts); and an agent of yours made (`POST
 * /api/agents/yours`), put back or renamed (`PUT /api/agents/yours/:name`) or removed (`DELETE /api/agents/yours/:name`), agents.ts — each
 * of which writes the store's `workflows/agents/`, what every step naming the agent is told; and a person's custom instructions for an
 * agent written (`PUT /api/custom-instructions/:name`) or cleared (`DELETE /api/custom-instructions/:name`), custom.ts, each of which
 * writes the store's `custom-instructions/`, what every run started after is told after the agent's instructions; and a skill of yours made
 * — written on the board, or a builtin one copied into your library (`POST /api/skills/yours`) — or changed, whole or its `preload:`
 * alone (`PUT /api/skills/yours/:name`), skills.ts, each of which writes the store's `workflows/skills/`, what every agent giving it is
 * told; and an agent of yours tried on a short brief (`POST /api/agents/yours/:name/try`, agents.ts), which writes its try's folder in the
 * store's `tries/` and a run's record, and a try's run removed (`DELETE /api/runs/:id`, commands/routes.ts, the route of `nemia rm`), which
 * removes the record and the folders it worked in; and a person's hold on a run lifted (`DELETE /api/runs/:id/hold`, commands/routes.ts,
 * the route of `nemia hold --off`), which removes the hold file, so the run goes on at the next tick; and the store paused (`POST
 * /api/pause`) or its pause lifted (`DELETE /api/pause`), commands/routes.ts, the routes of `nemia pause` and `nemia resume`, which write
 * or remove the store's pause file, so no pass starts new work until the lift; and a finished run pruned (`POST /api/runs/:id/prune`,
 * commands/routes.ts, the route of `nemia prune --yes`), which removes its worktrees, and its files when asked, for good. Each is what an
 * agent acts on in the repository — once a tick files it, or at once, or once a person starts the card or the workflow, or once a run
 * slot frees for a queued card — or a person's idea or step gone, or its place, so a page on another site must not be able to make any of
 * them; and a `fetch` with a body, from any page, reaches the api without the browser asking it first, unless the body is JSON.
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
export function refusedBeforeReading(
  write: Guarded,
  host: string | undefined,
  site: string | undefined,
  type: string | undefined,
): Refusal | null {
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
