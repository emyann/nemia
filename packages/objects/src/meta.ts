/**
 * What every object Nemia serves carries, whatever its kind: its `apiVersion`, the metadata that names it and says which change of it
 * a reader holds, and the envelope of a list of it. Each is a plain Schema of JSON — strings, numbers, records and literals, no brand
 * and no check — so that effect's OpenApi writes each into the document the api serves as it is.
 */
import { Schema } from 'effect';

/** The version every object of this package is served under: a new key is optional, and no key changes meaning under it. */
export const API_VERSION = 'nemia/v1';

/** The namespace an object is in when nobody names one. */
export const DEFAULT_NAMESPACE = 'default';

/**
 * Who an object is and which change of it this is: its `name`, unique in its `namespace` for its kind; its `labels`; when it was
 * made; its `resourceVersion`, an opaque word that changes on every write and that a writer hands back to say which change it read;
 * and its `generation`, the count of changes to its spec, for a kind whose spec a person edits.
 */
export const ObjectMeta = Schema.Struct({
  name: Schema.String,
  namespace: Schema.optionalKey(Schema.String),
  labels: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  creationTimestamp: Schema.String,
  resourceVersion: Schema.String,
  generation: Schema.optionalKey(Schema.Number),
});
export type ObjectMeta = typeof ObjectMeta.Type;

/**
 * Where a page of a list stands: `continue`, the opaque word that asks for the next page, absent on the last; how many items
 * remain after this page, when the server counted them; and `resourceVersion`, the list's position as it was read, which a watch of a
 * list that keeps its old versions (the Event lists, the feed's lines) resumes from (`?watch=true&resourceVersion=`), as Kubernetes'
 * ListMeta says it.
 */
export const ListMeta = Schema.Struct({
  continue: Schema.optionalKey(Schema.String),
  remainingItemCount: Schema.optionalKey(Schema.Number),
  resourceVersion: Schema.optionalKey(Schema.String),
});
export type ListMeta = typeof ListMeta.Type;

/** A page of a list of one kind: `<Kind>List`, its metadata, and its items, each an object of that kind. */
export const listOf = <const Kind extends string, Item extends Schema.Constraint>(kind: Kind, item: Item) =>
  Schema.Struct({
    apiVersion: Schema.Literal(API_VERSION),
    kind: Schema.Literal(`${kind}List`),
    metadata: ListMeta,
    items: Schema.Array(item),
  });
