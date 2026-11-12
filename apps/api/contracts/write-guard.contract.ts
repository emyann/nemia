/**
 * The guard on every write the api serves (apps/api, src/guard.ts, `writeRefused`): a request refused before its body is read, decided
 * by what its endpoint of `objects`' `Api` declares — its method — three headers, and whether it presents a bearer token, never by words
 * a route keeps of its own. The sentence a refusal says is built by the caller from the endpoint's method and path and where the
 * document lists what it takes, and its status is the class of `objects` it is answered as (`Forbidden` 403 for `host` and `site`, the
 * 415 class for `media`), so this function decides which refusal and nothing else.
 *
 * Why each: a write is what an agent acts on in the repository, or a person's idea or step gone, so a page on another site must not
 * make one. A name that is not this machine (`Host`) is a site whose name was pointed at 127.0.0.1; a page on another site
 * (`Sec-Fetch-Site`, which the browser sets and no page can) is anything but `same-origin`, `same-site` included, since another port on
 * localhost is the same site; and a body not sent as `application/json` is one any page can send without the browser asking first.
 * An absent `Host` or `Sec-Fetch-Site` is a client outside a browser, such as curl, and passes.
 *
 * A write that presents a bearer token (`Authorization: Bearer <token>`) passes the host and the site: a page on another site cannot
 * send that header without the browser asking the api first, which the api never answers, and cannot know a token; behind a proxy or a
 * tunnel the `Host` is the store's public name, which only a token makes safe. The token itself is judged before the guard (`callerGate`,
 * src/caller/caller.ts), a token refused there never reaching it, so presenting one here means a live one. It still says a JSON body.
 *
 * A write that presents a token by the board's cookie alone (`cookie`, `objects`' `TOKEN_COOKIE`, which the board sets once a person
 * pastes a token of theirs: the one credential a browser sends on a stream it follows) passes the host, but not the site. The host:
 * a site whose name was pointed at this machine is another origin, which the browser never hands the cookie, and a board reached at a
 * private network's address names that address. Not the site: a cookie is the browser's to send, scoped by host and not by port, so a
 * page on another port of the same host carries it; only the board's own page, `same-origin`, or no browser, writes by it.
 */
import { assume, type Implementation, spec } from '@emyann/tsverify';
import { loopback, saysJson, type WriteRefusal, type WriteRequest as Headers } from '../src/guard.ts';

/**
 * A request as the guard reads it: its method and headers, whether it presents a bearer token, and whether it presents a token by the
 * board's cookie alone (`cookie`; absent, none). Implement folds `cookie` into `src/guard.ts`'s own `WriteRequest`, required, and this
 * type then reads it from there.
 */
export type WriteRequest = Headers & { readonly cookie?: boolean };

/**
 * Whether a header names this machine's loopback (`localhost`, `127.0.0.1` or `[::1]`, on any port, in any case), and whether one says a
 * JSON body (`application/json`, its parameters and case left out): patterns and case folds, which the verifier does not read (a regular
 * expression, `toLowerCase`), so each is the code's (`src/guard.ts`), declared pure and nothing more, and the laws read the same two the
 * code calls. Which spellings each takes is held by its tests (`src/guard.test.ts`).
 */
export const loopbackName = assume(loopback, { pure: true });
export const jsonType = assume(saysJson, { pure: true });

/** The methods that write nothing, which the guard never stands in front of. */
const reads = (method: string): boolean => method === 'GET' || method === 'HEAD';

/** Whether `host` names this machine's loopback, on any port; an absent one is this machine. */
const here = (host: string | undefined): boolean => host === undefined || loopback(host);

/** Whether `site` is the board's own page or no browser at all. */
const ours = (site: string | undefined): boolean => site === undefined || site === 'same-origin';

/** Whether `contentType` says a JSON body, its parameters (`; charset=utf-8`) and its case left out. */
const json = (contentType: string | undefined): boolean => contentType !== undefined && saysJson(contentType);

/** Whether a write presents a token by the board's cookie. */
const byCookie = (r: WriteRequest): boolean => r.cookie === true;

/**
 * Whether a write may come from where it says it does: this machine, from no other site; with the board's cookie, from no other site at
 * whatever host; or with a bearer token, from anywhere.
 */
const fromWhereItMay = (r: WriteRequest): boolean => r.bearer || ((here(r.host) || byCookie(r)) && ours(r.site));

const writeRefusedSpec = spec<(request: WriteRequest) => WriteRefusal | null>({
  ensures: {
    aReadIsNeverRefused: {
      description: 'A GET or a HEAD writes nothing, and the guard never refuses one',
      condition: ({ input: [r], output }) => !reads(r.method) || output === null,
    },
    anotherHostIsRefused: {
      description: 'A write with no token addressed to a name that is not this machine is refused for its host, before anything else',
      condition: ({ input: [r], output }) => reads(r.method) || r.bearer || byCookie(r) || here(r.host) || output === 'host',
    },
    anotherSiteIsRefused: {
      description:
        'A write with no bearer token, to this machine or by the board’s cookie, made by a page on another site, same-site included, is refused for its site',
      condition: ({ input: [r], output }) =>
        reads(r.method) || r.bearer || !(here(r.host) || byCookie(r)) || ours(r.site) || output === 'site',
    },
    aCookiePassesTheHost: {
      description: 'A write that presents the board’s cookie is never refused for its host',
      condition: ({ input: [r], output }) => !byCookie(r) || output !== 'host',
    },
    aTokenPassesHostAndSite: {
      description: 'A write that presents a token is never refused for its host or its site',
      condition: ({ input: [r], output }) => !r.bearer || (output !== 'host' && output !== 'site'),
    },
    aBodyNotJsonIsRefused: {
      description: 'A write from where it may come that does not say a JSON body is refused for its media, a token or none',
      condition: ({ input: [r], output }) => reads(r.method) || !fromWhereItMay(r) || json(r.contentType) || output === 'media',
    },
    aJsonWriteFromWhereItMayPasses: {
      description: 'A write from this machine and no other site, or with a token, saying a JSON body, is never refused',
      condition: ({ input: [r], output }) => !(fromWhereItMay(r) && json(r.contentType)) || output === null,
    },
  },
});

/** `writeRefused`'s type, which `src/guard.ts` takes: it then imports nothing of tsverify. */
export type WriteRefused = Implementation<typeof writeRefusedSpec>;
