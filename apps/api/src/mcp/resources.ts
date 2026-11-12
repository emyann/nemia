/**
 * The feed as resources of the MCP port: the templates of its views, read off `objects`' `Api` as the port's tools are (`ENDPOINTS`, every
 * GET whose success is an `EventList`: `/api/events` and `/api/namespaces/{namespace}/events`), each a URI under the `nemia` scheme that
 * takes the feed's own selector, `labelSelector`, repeatable and OR'd as `nemia watch -l` takes it (`FEED_TEMPLATES`); which view a URI
 * names, or why it names none (`viewOf`); and the answer a read of one gives, an `EventList` of its newest events held under
 * `ANSWER_BOUND`, the oldest left out first (`readAnswer`). No second vocabulary: the content is `objects`' `EventList`, its items the
 * Events the api serves. Pure.
 */
import type { Event, EventList } from 'objects';
import { ENDPOINTS, type Endpoint } from '../objects/endpoints.ts';
import { ANSWER_BOUND } from './bound.ts';

/** The scheme of the port's resources: a path of the api under it, `nemia:///api/events`. */
export const SCHEME = 'nemia';

/** The one query key a feed resource takes: the feed's selector, repeatable, OR'd. */
export const SELECTOR_KEY = 'labelSelector';

/** A template of the feed's resources, as `resources/templates/list` says it, beside the endpoint it reads. */
export type FeedTemplate = {
  readonly uriTemplate: string;
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly mimeType: 'application/json';
  readonly endpoint: Endpoint;
};

/** A view a URI names: the URI itself, the path of the api it reads and the selectors it keeps (none for every event). */
export type FeedView = { readonly uri: string; readonly path: string; readonly selectors: readonly string[] };

/** What `viewOf` answers: the view, or why the URI names none, in words that say which URIs do. */
export type ViewOrNot = { readonly kind: 'view'; readonly view: FeedView } | { readonly kind: 'none'; readonly message: string };

/** An endpoint's path as a URI template: each `:name` as `{name}`, under the scheme, the selector its query. */
const uriTemplateOf = (path: string): string => `${SCHEME}://${path.replace(/:([A-Za-z]+)/g, '{$1}')}{?${SELECTOR_KEY}*}`;

/** A template's name: its path's words, the `api` and each `:name` left out (`events`, `namespaces-events`). */
const nameOf = (path: string): string =>
  path
    .split('/')
    .filter((part) => part !== '' && part !== 'api' && !part.startsWith(':'))
    .join('-');

/** Whether `endpoint` lists the feed's events: a GET whose success is an `EventList`. */
export const listsEvents = (endpoint: Endpoint): boolean => endpoint.method === 'GET' && endpoint.kinds.includes('EventList');

/** The templates of the feed's resources, one per Event list of the `Api`, in `ENDPOINTS`' order (the fewest names first). */
export const FEED_TEMPLATES: readonly FeedTemplate[] = ENDPOINTS.filter(listsEvents).map((endpoint) => ({
  uriTemplate: uriTemplateOf(endpoint.path),
  name: nameOf(endpoint.path),
  title: endpoint.path.includes(':namespace') ? "A factory's feed" : 'The feed',
  description:
    `The feed's events (GET ${endpoint.path}) as an EventList, the newest last, kept by each ${SELECTOR_KEY} given (repeatable, OR'd). ` +
    'Subscribe with subscriptions/listen (resourceSubscriptions) to be told of each new one; a read answers the newest seen since ' +
    'the first subscriber opened it, and its metadata.resourceVersion the feed position to read the list from.',
  mimeType: 'application/json',
  endpoint,
}));

/** The templates as a refusal names them. */
const named = (): string => FEED_TEMPLATES.map((t) => t.uriTemplate).join(' or ');

/**
 * The view `uri` names: a URI of the `nemia` scheme with no host, whose path is one an Event list serves and whose query holds the
 * selector alone (each `labelSelector` kept, in order); else why it names none, naming the templates that do.
 */
export const viewOf = (uri: string): ViewOrNot => {
  const none = (why: string): ViewOrNot => ({ kind: 'none', message: `${uri} ${why}: give a URI of ${named()}` });
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return none('is no URI');
  }
  if (url.protocol !== `${SCHEME}:` || url.host !== '') return none(`is not of the ${SCHEME}:/// scheme`);
  if (!FEED_TEMPLATES.some((t) => t.endpoint.pattern.test(url.pathname))) return none('is no feed of the api');
  const other = [...url.searchParams.keys()].filter((key) => key !== SELECTOR_KEY);
  if (other.length > 0) return none(`takes ${SELECTOR_KEY} alone, not ${[...new Set(other)].join(', ')}`);
  return { kind: 'view', view: { uri, path: url.pathname, selectors: url.searchParams.getAll(SELECTOR_KEY) } };
};

/** The path and query a view is read at with `extra` (a page's `limit`, a watch's `resourceVersion`), its selectors after them. */
export const pathOf = (view: FeedView, extra: Readonly<Record<string, string>>): string => {
  const query = new URLSearchParams(extra);
  for (const selector of view.selectors) query.append(SELECTOR_KEY, selector);
  return `${view.path}?${query.toString()}`;
};

/**
 * The text a read of a view answers: an `EventList` of `events` (the newest last) at `resourceVersion` where one is known, within
 * `bound` characters (`ANSWER_BOUND`): past it, the oldest events left out, one by one, so it stays a whole `EventList`.
 */
export const readAnswer = (events: readonly Event[], resourceVersion: string | undefined, bound = ANSWER_BOUND): string => {
  const metadata = resourceVersion === undefined ? {} : { resourceVersion };
  const textOf = (items: readonly Event[]) =>
    JSON.stringify({ apiVersion: 'nemia/v1', kind: 'EventList', metadata, items } satisfies EventList);
  let from = 0;
  let text = textOf(events);
  while (text.length > bound && from < events.length) {
    from += 1;
    text = textOf(events.slice(from));
  }
  return text;
};
