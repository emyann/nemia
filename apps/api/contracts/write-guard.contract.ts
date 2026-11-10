/**
 * The guard on every write the api serves (apps/api, src/guard.ts, `writeRefused`): a request refused before its body is read, decided
 * by what its endpoint of `objects`' `Api` declares — its method — and three headers, never by words a route keeps of its own. It
 * replaces the hand guard and the words each hand route spelled for it: the sentence a refusal says is built by the caller from the
 * endpoint's method and path and
 * where the document lists what it takes, and its status is the class of `objects` it is answered as (`Forbidden` 403 for `host` and
 * `site`, the 415 class for `media`), so this function decides which refusal and nothing else.
 *
 * Why each: a write is what an agent acts on in the repository, or a person's idea or step gone, so a page on another site must not
 * make one. A name that is not this machine (`Host`) is a site whose name was pointed at 127.0.0.1; a page on another site
 * (`Sec-Fetch-Site`, which the browser sets and no page can) is anything but `same-origin`, `same-site` included, since another port on
 * localhost is the same site; and a body not sent as `application/json` is one any page can send without the browser asking first.
 * An absent `Host` or `Sec-Fetch-Site` is a client outside a browser, such as curl, and passes.
 */
import { assume, type Implementation, spec } from '@emyann/tsverify';
import { loopback, saysJson, type WriteRefusal, type WriteRequest } from '../src/guard.ts';

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

/** Whether `host` names this machine's loopback, on any port; an absent one is this machine. The api listens on 127.0.0.1 alone. */
const here = (host: string | undefined): boolean => host === undefined || loopback(host);

/** Whether `site` is the board's own page or no browser at all. */
const ours = (site: string | undefined): boolean => site === undefined || site === 'same-origin';

/** Whether `contentType` says a JSON body, its parameters (`; charset=utf-8`) and its case left out. */
const json = (contentType: string | undefined): boolean => contentType !== undefined && saysJson(contentType);

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
      condition: ({ input: [r], output }) => reads(r.method) || !here(r.host) || !ours(r.site) || json(r.contentType) || output === 'media',
    },
    aJsonWriteFromHerePasses: {
      description: 'A write to this machine, from no other site, saying a JSON body, is never refused',
      condition: ({ input: [r], output }) => !(here(r.host) && ours(r.site) && json(r.contentType)) || output === null,
    },
  },
});

/** `writeRefused`'s type, which `src/guard.ts` takes: it then imports nothing of tsverify. */
export type WriteRefused = Implementation<typeof writeRefusedSpec>;
