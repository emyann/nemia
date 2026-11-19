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
 * src/caller/caller.ts), a token refused there never reaching it, so presenting one here means a live one. It still says a JSON body, or
 * a form of files (`multipart/form-data`, a file uploaded for a start): a form a page on another site posts carries no `Authorization`
 * without the browser asking first, so a token's form is the client's own. With no token, a form is refused.
 *
 * A form of files by the board's cookie (a file the board uploads for a start) passes where it carries the header a script sets
 * (`scripted`): a header no form sends, which a page of another origin — another site, or another port of this host — cannot set
 * without the browser asking the api first, as it cannot set `Authorization`, and the api answers no such question. Without it the
 * cookie's form is refused 415, as before. Not `Sec-Fetch-Site: same-origin` alone: a browser sends no `Sec-Fetch-*` to an address that
 * is not potentially trustworthy (a store exposed over plain http at a network's address), nor does an old one, and that store's board
 * would upload nothing; the site is still refused first where the browser says it. So the cookie's form admits what the board's JSON
 * writes already admit, and no more.
 *
 * A write that presents a token by the board's cookie alone (`cookie`, `objects`' `TOKEN_COOKIE`: the HttpOnly cookie the api sets
 * (`POST /api/session`) once a person pastes a token of theirs into the board, which no script of the page reads, and the one credential
 * a browser sends on a stream it follows) passes the host, but not the site. The host: a site whose name was pointed at this machine is
 * another origin, which the browser never hands the cookie, and a board reached at a private network's address names that address. Not
 * the site: a cookie is the browser's to send, scoped by host and not by port, and `SameSite=Strict` by site, so a page on another port
 * of the same host carries it; only the board's own page, `same-origin`, or no browser, writes by it.
 *
 * On a store marked exposed, a name it is served at (`served`: the address it binds, `NEMIA_BIND`, or a name the person declares it
 * reached by, `WF_SERVED_NAMES`) is this machine as the loopback is: a browser on another device that opens the board at that name asks a
 * pairing there. A site whose name points here is still another name, and still refused.
 */
import { assume, type Implementation, spec } from '@emyann/tsverify';
import { loopback } from '../src/address/address.ts';
import { saysForm, saysJson } from '../src/media/media.ts';

/**
 * A request as the guard reads it: its method, its `Host`, `Sec-Fetch-Site` and `Content-Type` headers, each absent where not sent,
 * whether it presents a bearer token (`bearer`), whether it presents a token by the board's cookie alone (`cookie`, `TOKEN_COOKIE`,
 * with no bearer beside it), whether its `Host` names a name the store marked exposed is served at (`served`), which no store not
 * marked exposed has, and whether it sends the header a script sets (`scripted`, `objects`' `SCRIPTED_HEADER`, not empty), which no
 * form sends.
 */
export type WriteRequest = {
  readonly method: string;
  readonly host: string | undefined;
  readonly site: string | undefined;
  readonly contentType: string | undefined;
  readonly bearer: boolean;
  readonly cookie: boolean;
  readonly served: boolean;
  readonly scripted: boolean;
};

/** Which refusal a write meets: another host, another site, or a body that is not JSON. */
export type WriteRefusal = 'host' | 'site' | 'media';

/**
 * Whether a header names this machine's loopback (`localhost`, `127.0.0.1` or `[::1]`, on any port, in any case), and whether one says a
 * JSON body (`application/json`, its parameters and case left out): patterns and case folds, which the verifier does not read (a regular
 * expression, `toLowerCase`), so each is the code's (`src/address/address.ts`, `src/media/media.ts`), declared pure and nothing more, and
 * the laws read the same two the
 * code calls. Which spellings each takes is held by its tests (`src/guard.test.ts`).
 */
export const loopbackName = assume(loopback, { pure: true });
export const jsonType = assume(saysJson, { pure: true });
export const formType = assume(saysForm, { pure: true });

/** The methods that write nothing, which the guard never stands in front of. */
const reads = (method: string) => method === 'GET' || method === 'HEAD';

/**
 * Whether a request is addressed to this machine: its `Host` absent, the loopback on any port, or a name the exposed store is served at.
 */
const here = (r: WriteRequest) => r.host === undefined || loopback(r.host) || r.served;

/** Whether `site` is the board's own page or no browser at all. */
const ours = (site: string | undefined) => site === undefined || site === 'same-origin';

/** Whether `contentType` says a JSON body, its parameters (`; charset=utf-8`) and its case left out. */
const json = (contentType: string | undefined) => contentType !== undefined && saysJson(contentType);

/** Whether `contentType` says a form of files (`multipart/form-data`), its boundary and its case left out. */
const form = (contentType: string | undefined) => contentType !== undefined && saysForm(contentType);

/** Whether a write sends a form of files with a bearer token, which no page on another site can send without asking first. */
const tokenForm = (r: WriteRequest) => r.bearer && form(r.contentType);

/** Whether a write presents a token by the board's cookie. */
const byCookie = (r: WriteRequest) => r.cookie;

/**
 * Whether a write sends a form of files by the board's cookie alone with the header a script sets (`scripted`), which no form sends
 * and a page of another origin cannot set without the browser asking the api first.
 */
const boardForm = (r: WriteRequest) => !r.bearer && byCookie(r) && r.scripted && form(r.contentType);

/**
 * Whether a write may come from where it says it does: this machine, from no other site; with the board's cookie, from no other site at
 * whatever host; or with a bearer token, from anywhere.
 */
const fromWhereItMay = (r: WriteRequest) => r.bearer || ((here(r) || byCookie(r)) && ours(r.site));

const writeRefusedSpec = spec<(request: WriteRequest) => WriteRefusal | null>({
  ensures: {
    aReadIsNeverRefused: {
      description: 'A GET or a HEAD writes nothing, and the guard never refuses one',
      condition: ({ input: [r], output }) => !reads(r.method) || output === null,
    },
    anotherHostIsRefused: {
      description: 'A write with no token addressed to a name that is not this machine is refused for its host, before anything else',
      condition: ({ input: [r], output }) => reads(r.method) || r.bearer || byCookie(r) || here(r) || output === 'host',
    },
    anotherSiteIsRefused: {
      description:
        'A write with no bearer token, to this machine or by the board’s cookie, made by a page on another site, same-site included, is refused for its site',
      condition: ({ input: [r], output }) => reads(r.method) || r.bearer || !(here(r) || byCookie(r)) || ours(r.site) || output === 'site',
    },
    aServedNamePassesTheHost: {
      description: 'A write addressed to a name the exposed store is served at is never refused for its host',
      condition: ({ input: [r], output }) => !r.served || output !== 'host',
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
      description:
        'A write from where it may come that does not say a JSON body is refused for its media, a token or none, but a form of files with a bearer token, or by the board’s cookie with the header a script sets',
      condition: ({ input: [r], output }) =>
        reads(r.method) || !fromWhereItMay(r) || json(r.contentType) || tokenForm(r) || boardForm(r) || output === 'media',
    },
    aFormWithATokenPasses: {
      description: 'A write that presents a bearer token and sends a form of files (multipart/form-data) is never refused',
      condition: ({ input: [r], output }) => !tokenForm(r) || output === null,
    },
    aFormFromTheBoardPasses: {
      description:
        'A write by the board’s cookie alone that sends a form of files with the header a script sets, from no other site, is never refused, at whatever host',
      condition: ({ input: [r], output }) => !boardForm(r) || !ours(r.site) || output === null,
    },
    aJsonWriteFromWhereItMayPasses: {
      description: 'A write from this machine and no other site, or with a token, saying a JSON body, is never refused',
      condition: ({ input: [r], output }) => !(fromWhereItMay(r) && json(r.contentType)) || output === null,
    },
  },
});

/** `writeRefused`'s type, which `src/guard.ts` takes: it then imports nothing of tsverify. */
export type WriteRefused = Implementation<typeof writeRefusedSpec>;
