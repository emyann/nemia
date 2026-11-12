/**
 * What a watch of a list sends (`?watch=true`), one event per server-sent `message`, its data the JSON of `watchEventOf(item)`: an
 * object ADDED, MODIFIED or DELETED, or a BOOKMARK whose object is the list's kind carrying a `resourceVersion` alone, as Kubernetes'
 * watch says them. A watch keeps nothing between connections: a reconnect is sent the state whole again, each object ADDED, then a
 * BOOKMARK, so a reader takes ADDED as an upsert and the first BOOKMARK as the end of the initial state. The Event lists, whose objects
 * are the feed's lines, keep their old versions: a watch of one asked a `resourceVersion` (the last event's, a BOOKMARK's, or a page's
 * `metadata`) is sent no state, only each event after it, so a reader resumes where it stopped and loses no line.
 */
import { Schema } from 'effect';
import { API_VERSION, ObjectMeta } from './meta.ts';

/** Any object of the package as a watch reads it: its `apiVersion`, `kind` and `metadata`, the rest of its keys kept as they are. */
export const WatchedObject = Schema.StructWithRest(
  Schema.Struct({ apiVersion: Schema.String, kind: Schema.String, metadata: ObjectMeta }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);
export type WatchedObject = typeof WatchedObject.Type;

/** A list of any kind as a watch reads it: its items, each a `WatchedObject`, the rest of its keys kept. */
export const AnyObjectList = Schema.StructWithRest(
  Schema.Struct({ apiVersion: Schema.String, kind: Schema.String, items: Schema.Array(WatchedObject) }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);
export type AnyObjectList = typeof AnyObjectList.Type;

/** A BOOKMARK's object: the list's kind and the `resourceVersion` every change up to which was sent. */
export const BookmarkObject = Schema.Struct({
  apiVersion: Schema.Literal(API_VERSION),
  kind: Schema.String,
  metadata: Schema.Struct({ resourceVersion: Schema.String }),
});

/** One event of a watch whose objects are `item`: what happened to an object, or a BOOKMARK. */
export const watchEventOf = <Item extends Schema.Constraint>(item: Item) =>
  Schema.Union([
    Schema.Struct({ type: Schema.Literals(['ADDED', 'MODIFIED', 'DELETED']), object: item }),
    Schema.Struct({ type: Schema.Literal('BOOKMARK'), object: BookmarkObject }),
  ]);
