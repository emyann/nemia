/**
 * The guard on the board's writes: a request refused before its body is read, whatever it asks for.
 *
 * These writes pass it: a factory signed in to a server (`POST /api/namespaces/:namespace/mcpservers/:name/sign-in`,
 * factory/parts/parts.ts) or signed out of one (`DELETE` on the same path), each of which writes the harness's own store, which every
 * session of the factory reads; a factory's server recorded or taken off, a schedule written or taken back, an agent hired into a step or
 * fired, its rules written or cleared and its instruction placed, written or cleared (factory/parts/parts.ts), each what every run started
 * in the factory after acts on; the run's named actions (objects/serve.ts), each guarded in its command's words before the objects' handler
 * reads its body: a start (`POST /api/namespaces/:namespace/runs`, `runStart` in workflows.ts), which writes a run's record; an ask for
 * another try or another round (`POST /api/namespaces/:namespace/runs/:runId/steps/:step/retry`, with `"round": true` for `nemia retry
 * --round`), which writes a person's ask file; an approval of a step waiting at its gate, or of a loop out of rounds as it stands (`POST
 * …/runs/:runId/steps/:step/approve`), which writes a person's approval or acceptance file; words for a step's running session (`POST
 * …/runs/:runId/steps/:step/say`), which the engine hands the session and journals; a run's refresh and its labels edited (`POST
 * …/runs/:runId/refresh`, `…/labels`); a run held (`POST …/runs/:runId/hold`) and its hold lifted (`DELETE …/runs/:runId/hold`, the route
 * of `nemia hold --off`), which removes the hold file, so the run goes on at the next tick; a try's run removed (`DELETE …/runs/:runId`,
 * the route of `nemia rm`), which removes the record and the folders it worked in; and a finished run pruned (`POST …/runs/:runId/prune`,
 * the route of `nemia prune --yes`), which removes its worktrees, and its files when asked, for good; the Card's six writes
 * (objects/serve.ts): a card filed (`POST /api/namespaces/:namespace/cards`) or dropped (`DELETE …/cards/:name`), started (`POST
 * …/cards/:name/start`), queued (`…/queue`) or taken off the queue (`…/unqueue`), and its labels edited (`…/labels`), each of which writes
 * the store's inbox or starts a run, guarded before the objects' handler reads its body; and the Workflow's, Agent's and Skill's writes
 * (definitions/routes.ts, `DEFINITION_WRITES`), taken in `default` alone: a workflow of yours made (`POST
 * /api/namespaces/:namespace/workflows`), put back from its steps and the schemas pasted for them (`PUT …/workflows/:name`) or removed
 * whole (`DELETE …/workflows/:name`), each of which writes the store's `workflows/`, and removes a step's file the folder has dropped; an
 * agent of yours made (`POST …/agents`), put back or renamed (`PUT …/agents/:name`) or removed (`DELETE …/agents/:name`), each of which
 * writes the store's `workflows/agents/`, what every step naming the agent is told; a skill of yours made (`POST …/skills`), a builtin one
 * copied into your library (`POST …/skills/:name/copy`), or changed, whole or its `preload:` alone (`PUT …/skills/:name`), each of which
 * writes the store's `workflows/skills/`, what every agent giving it is told; and an agent of yours tried on a short brief (`POST
 * …/agents/:name/try`), which writes its try's folder in the store's `tries/` and a run's record; and a person's custom instructions for an
 * agent written (`PUT /api/custom-instructions/:name`) or cleared (`DELETE /api/custom-instructions/:name`), custom.ts, each of which
 * writes the store's `custom-instructions/`, what every run started after is told after the agent's instructions; and the store paused
 * (`POST /api/pause`) or its pause lifted (`DELETE /api/pause`), commands/routes.ts, the routes of `nemia pause` and `nemia resume`, which
 * write or remove the store's pause file, so no pass starts new work until the lift; and a factory's Proposals and Delegations
 * (proposals/routes.ts, `PROPOSAL_WRITES`): a proposal filed (`POST /api/namespaces/:namespace/proposals`), approved (`POST
 * …/proposals/:name/approve`), which applies it at once where it is due and so writes the factory's definitions and wiring, or declined
 * (`POST …/proposals/:name/decline`), each of which writes the factory's `proposals/`; and an agent's delegation written whole (`PUT
 * …/delegations/:name`) or removed (`DELETE …/delegations/:name`), each of which writes the factory's `delegations/`, what that agent may
 * approve with no person asked. Each is what an agent acts on in the repository — once
 * a tick files it, or at once, or once a person starts the card or the workflow, or once a run slot frees for a queued card — or a person's
 * idea or step gone, or its place, so a page on another site must not be able to make any of them; and a `fetch` with a body, from any
 * page, reaches the api without the browser asking it first, unless the body is JSON.
 */

/** One status and what to do next. */
export type Refusal = { status: 400 | 403 | 404 | 409 | 415 | 422; error: string };

/** A write the guard stands in front of, in the words its refusals say it in. */
export type Guarded = {
  /** The request: `POST /api/namespaces/default/runs`. */
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
