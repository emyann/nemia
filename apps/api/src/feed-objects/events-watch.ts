/**
 * The Event lists' watch (decision 23: the feed is the Event's watch): rather than read the whole feed again for every line it writes,
 * the watch follows it (`followFeed`) and makes each line an Event by the rule a page of events reads (`eventKept`), in the namespace
 * and by the selectors the list was asked, each line's name the byte it starts at. The watch sends each as ADDED once (`watchable`).
 */
import type { Duration } from 'effect';
import { Stream } from 'effect';
import { eventKept, followFeed } from 'agent-orchestrator';
import type { Follow } from '../watch/watch.ts';

/**
 * The namespace a path of the Event lists names, `/api/namespaces/<ns>/events`, or none for `/api/events`: read off the path, which the
 * mount serves on one wildcard (`.all('/api/*')`) that names no parameter.
 */
const namespaceOf = (url: string): string | undefined => {
  const named = /^\/api\/namespaces\/([^/]+)\//.exec(new URL(url).pathname)?.[1];
  if (named === undefined) return undefined;
  try {
    return decodeURIComponent(named);
  } catch {
    return named;
  }
};

/** The Events a watch of `/api/events` or `/api/namespaces/<ns>/events` follows, from byte `from` of the feed. */
export const eventsFollowed: Follow = (c, from, beat: Duration.Input | undefined) => {
  const kept = eventKept({
    namespace: namespaceOf(c.req.url),
    labelSelector: [...(c.req.queries('labelSelector') ?? []), ...(c.req.queries('selector') ?? [])],
  });
  const at = { cursor: from };
  return followFeed(from, beat === undefined ? {} : { beat }).pipe(
    Stream.filter((f) => f.kind === 'line'),
    Stream.map((f) => {
      const start = at.cursor;
      at.cursor = f.cursor;
      return { object: kept(f.line, start, f.cursor), at: f.cursor };
    }),
  );
};
