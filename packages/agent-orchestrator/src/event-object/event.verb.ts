/**
 * The feed's lines as Events (`Event`, `EventList`, from `objects`), read through the Feed door. A list reads the feed in the order it was
 * written, from the cursor its `continue` token carries (0 where it carries none), keeps the lines the feed's own selector takes
 * (`selects`, as `/api/feed/stream?selector=` does) and, for a namespace, those `eventNamespace` puts there, then cuts the page
 * (`listPage`). An event is read by its name, the byte its line starts at: one read from that byte of its first line alone, never the
 * rest of the feed. A line's start is the cursor before it — the end of the line before, or the cursor the read began at — so where a
 * line nobody can read lies between two, the one after it is named by where the unreadable one starts, and read from there all the same.
 */
import { Effect } from 'effect';
import { API_VERSION, type Event, type EventList } from 'objects';
import { FeedDoor } from '../feed/feed.store.ts';
import type { ObjectQuery } from '../factory-object/factory.verb.ts';
import { Invalid, Missing } from '../refusal/refusal.ts';
import { parseSelectors, selectorsRefusal, selects } from '../watch/selector.ts';
import { eventOf } from './event.ts';
import { continuedAfter, continueToken, listPage } from '../object/page.ts';

/** What a list of events is asked: its namespace (none for every event, cluster-scoped too), `?limit=`, `?continue=`, its selectors. */
export type EventQuery = ObjectQuery;

/** A byte of the feed spelled as a name or a token carries it: a decimal with no sign and no leading zero. */
const byteOf = (text: string): number | undefined => (/^(0|[1-9][0-9]*)$/.test(text) ? Number(text) : undefined);

/** The Events of the lines after `cursor`, in feed order, each named by the cursor before it: every one, or the first `limit`. */
const eventsAfter = Effect.fn('eventsAfter')(function* (cursor: number, limit?: number) {
  const door = yield* FeedDoor;
  const read = yield* door.lines.read(cursor, limit);
  return read.lines.map((line, i) => ({
    line,
    event: eventOf(line, i === 0 ? cursor : (read.ends[i - 1] ?? cursor), read.ends[i] ?? cursor),
  }));
});

/** A page of the feed's events (`EventList`); `Invalid` for a selector, a limit or a token that is not one, or a cursor refused. */
export const eventList = Effect.fn('eventList')(function* (query: EventQuery) {
  const asked = query.labelSelector ?? [];
  const refusal = selectorsRefusal(asked);
  if (refusal !== undefined)
    return yield* Effect.fail(
      new Invalid({ message: `labelSelector: ${refusal}. Correct it, or leave labelSelector out to list every event` }),
    );
  const selectors = parseSelectors(asked);
  let cursor = 0;
  if (query.continue !== undefined) {
    const after = continuedAfter(query.continue);
    if (after instanceof Invalid) return yield* Effect.fail(after);
    const byte = byteOf(after);
    if (byte === undefined)
      return yield* Effect.fail(
        new Invalid({
          message: `continue ${JSON.stringify(query.continue)} carries no cursor of the feed: pass the continue a page of GET /api/events answered, as it is, or leave continue out to read from the first event`,
        }),
      );
    cursor = byte;
  }
  const kept = (yield* eventsAfter(cursor))
    .filter(
      ({ line, event }) => selects(selectors, line) && (query.namespace === undefined || event.metadata.namespace === query.namespace),
    )
    .map(({ event }) => event);
  const cut = listPage(kept.length, 0, query.limit ?? null);
  if ('refused' in cut)
    return yield* Effect.fail(
      new Invalid({
        message: `limit ${String(query.limit)} is no whole number from 1: pass ?limit=<n>, n from 1, or leave limit out for every event`,
      }),
    );
  const items = kept.slice(cut.from, cut.to);
  const last = items.at(-1);
  const list: EventList = {
    apiVersion: API_VERSION,
    kind: 'EventList',
    metadata: {
      remainingItemCount: cut.remainingItemCount,
      ...(cut.more && last !== undefined ? { continue: continueToken(last.metadata.resourceVersion) } : {}),
    },
    items,
  };
  return list;
});

/** The event named `name`, the byte its line starts at, in `namespace` where one is given; `Missing` where there is none. */
export const eventObject = Effect.fn('eventObject')(function* (name: string, namespace?: string) {
  const missing = new Missing({
    message: `no event ${JSON.stringify(name)}${namespace !== undefined ? ` in namespace ${namespace}` : ''}: an event is named by the byte its line starts at — GET /api/events lists them`,
  });
  const byte = byteOf(name);
  if (byte === undefined) return yield* Effect.fail(missing);
  const door = yield* FeedDoor;
  if ((yield* door.lines.cursorRefusal(byte)) !== undefined) return yield* Effect.fail(missing);
  const first = (yield* eventsAfter(byte, 1)).at(0);
  if (first === undefined) return yield* Effect.fail(missing);
  const event: Event = first.event;
  if (namespace !== undefined && event.metadata.namespace !== namespace) return yield* Effect.fail(missing);
  return event;
});
