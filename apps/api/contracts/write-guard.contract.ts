/**
 * The guard on every write the api serves (apps/api, src/guard.ts, `writeRefused`): a request refused before its body is read, decided
 * by what its endpoint of `objects`' `Api` declares — its method — and three headers, never by words a route keeps of its own. It
 * replaces `refusedBeforeReading`, whose `Guarded` words each hand route spelled (`CARD_WRITES`, `WORDS`, `DEFINITION_WRITES`,
 * `PROPOSAL_WRITES`, the parts' guard words): the sentence a refusal says is built by the caller from the endpoint's method and path and
 * where the document lists what it takes, and its status is the class of `objects` it is answered as (`Forbidden` 403 for `host` and
 * `site`, the 415 class for `media`), so this function decides which refusal and nothing else.
 *
 * Why each: a write is what an agent acts on in the repository, or a person's idea or step gone, so a page on another site must not
 * make one. A name that is not this machine (`Host`) is a site whose name was pointed at 127.0.0.1; a page on another site
 * (`Sec-Fetch-Site`, which the browser sets and no page can) is anything but `same-origin`, `same-site` included, since another port on
 * localhost is the same site; and a body not sent as `application/json` is one any page can send without the browser asking first.
 * An absent `Host` or `Sec-Fetch-Site` is a client outside a browser, such as curl, and passes.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** A request as the guard reads it: its method, and its `Host`, `Sec-Fetch-Site` and `Content-Type` headers, each absent where not sent. */
export type WriteRequest = {
  readonly method: string;
  readonly host: string | undefined;
  readonly site: string | undefined;
  readonly type: string | undefined;
};

/** Which refusal a write meets: another host, another site, or a body that is not JSON. Implement moves it into `src/guard.ts`. */
export type WriteRefusal = 'host' | 'site' | 'media';

/** The methods that write nothing, which the guard never stands in front of. */
const reads = (method: string): boolean => method === 'GET' || method === 'HEAD';

/** Whether `host` names this machine's loopback, on any port; an absent one is this machine. The api listens on 127.0.0.1 alone. */
const here = (host: string | undefined): boolean =>
  host === undefined || /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i.test(host.trim());

/** Whether `site` is the board's own page or no browser at all. */
const ours = (site: string | undefined): boolean => site === undefined || site === 'same-origin';

/** Whether `type` says a JSON body, its parameters (`; charset=utf-8`) and its case left out. */
const json = (type: string | undefined): boolean => type !== undefined && type.split(';')[0]?.trim().toLowerCase() === 'application/json';

const writeRefusedSpec = spec<(request: WriteRequest) => WriteRefusal | null>({
  ensures: {
    aReadIsNeverRefused: {
      description: 'A GET or a HEAD writes nothing, and the guard never refuses one',
      condition: ({ input: [r], output }) => !reads(r.method) || output === null,
    },
    anotherHostIsRefused: {
      description: 'A write addressed to a name that is not this machine is refused for its host, before anything else is read',
      condition: ({ input: [r], output }) => reads(r.method) || here(r.host) || output === 'host',
    },
    anotherSiteIsRefused: {
      description: 'A write to this machine made by a page on another site, same-site included, is refused for its site',
      condition: ({ input: [r], output }) => reads(r.method) || !here(r.host) || ours(r.site) || output === 'site',
    },
    aBodyNotJsonIsRefused: {
      description: 'A write from here that does not say a JSON body is refused for its media: any page can send one without asking',
      condition: ({ input: [r], output }) => reads(r.method) || !here(r.host) || !ours(r.site) || json(r.type) || output === 'media',
    },
    aJsonWriteFromHerePasses: {
      description: 'A write to this machine, from no other site, saying a JSON body, is never refused',
      condition: ({ input: [r], output }) => !(here(r.host) && ours(r.site) && json(r.type)) || output === null,
    },
  },
});

/** `writeRefused`'s type, which `src/guard.ts` takes: it then imports nothing of tsverify. */
export type WriteRefused = Implementation<typeof writeRefusedSpec>;
