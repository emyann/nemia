/**
 * What every object Nemia serves carries, whatever its kind: its `apiVersion`, the metadata that names it and says which change of it
 * a reader holds, and the envelope of a list of it. Each is a plain Schema of JSON — strings, numbers, records and literals, no brand
 * and no check — so that effect's OpenApi writes each into the document the api serves as it is.
 */
import { Schema } from 'effect';

/** The version every object of this package is served under: a new key is optional, and no key changes meaning under it. */
export const API_VERSION = 'nemia/v1';

/**
 * A schema that says what it is where its own description never reaches the document: `Schema.Number`, whose JSON side is a union with
 * the non-finite words, and `Schema.Unknown`, written as `{}`. Described as a union of that one member, which reads and writes the same.
 *
 * @param member The schema described.
 * @param description What the field it is holds, as a client reads the schema alone.
 */
export const describedOne = <S extends Schema.Top>(member: S, description: string) => Schema.Union([member]).annotate({ description });

/**
 * A number that says what it is (`describedOne`).
 *
 * @param description What the field it is holds, as a client reads the schema alone.
 */
export const describedNumber = (description: string) => describedOne(Schema.Number, description);

/** The namespace an object is in when nobody names one. */
export const DEFAULT_NAMESPACE = 'default';

/**
 * Who an object is and which change of it this is: its `name`, unique in its `namespace` for its kind; its `labels`; when it was
 * made; its `resourceVersion`, an opaque word that changes on every write and that a writer hands back to say which change it read;
 * and its `generation`, the count of changes to its spec, for a kind whose spec a person edits.
 */
export const ObjectMeta = Schema.Struct({
  name: Schema.String.annotate({ description: 'Its name, unique in its namespace for its kind.' }),
  namespace: Schema.optionalKey(
    Schema.String.annotate({
      description: 'The namespace it is in, default where nobody gave one; absent for a kind no namespace holds (cluster-scoped).',
    }),
  ),
  labels: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.String).annotate({
      description: 'Its labels, each a key and its value; absent where it has none.',
    }),
  ),
  creationTimestamp: Schema.String.annotate({ description: 'When it was made, as an ISO 8601 time.' }),
  resourceVersion: Schema.String.annotate({
    description:
      'A word that changes on every write of it, which a writer hands back, unmodified, to say which change it read: of an object of a kind the store watches, the revision of its last change, in decimal digits.',
  }),
  generation: Schema.optionalKey(
    describedNumber('How many times its spec was changed, for a kind whose spec a person edits; absent otherwise.'),
  ),
}).annotate({ description: 'Who the object is and which change of it this is: its name, namespace, labels and versions.' });
export type ObjectMeta = typeof ObjectMeta.Type;

/**
 * Where a page of a list stands: `continue`, the opaque word that asks for the next page, absent on the last; how many items
 * remain after this page, when the server counted them; and `resourceVersion`, the list's position as it was read, which a watch of the
 * list resumes from (`?watch=true&resourceVersion=`), as Kubernetes' ListMeta says it: the store's latest revision of a list of a kind
 * the store watches, a byte of the feed for the Event lists.
 */
export const ListMeta = Schema.Struct({
  continue: Schema.optionalKey(
    Schema.String.annotate({ description: 'The opaque word that asks for the next page (?continue=); absent on the last page.' }),
  ),
  remainingItemCount: Schema.optionalKey(
    describedNumber('How many items remain after this page; absent where the server did not count them.'),
  ),
  resourceVersion: Schema.optionalKey(
    Schema.String.annotate({
      description:
        "The list's position as it was read: the store's latest revision, or a byte of the feed for the Event lists, which a watch of the list resumes from (?watch=true&resourceVersion=), sent the objects changed after it and no state.",
    }),
  ),
}).annotate({ description: 'Where a page of a list stands: the word for the next page, how many items remain, and its position.' });
export type ListMeta = typeof ListMeta.Type;

/**
 * A page of a list of one kind: `<Kind>List`, its metadata, and its items, each an object of that kind without its files' content.
 * @param kind The kind of the list's items, which names the list.
 * @param item The schema of one item: the kind's listed one where it leaves a file's content out (`LISTED_WITHOUT`).
 */
export const listOf = <const Kind extends string, Item extends Schema.Constraint>(kind: Kind, item: Item) =>
  Schema.Struct({
    apiVersion: Schema.Literal(API_VERSION).annotate({ description: `The version the list is served under, ${API_VERSION}.` }),
    kind: Schema.Literal(`${kind}List`).annotate({ description: `What the object is: ${kind}List, a page of a list of ${kind}.` }),
    metadata: ListMeta,
    items: Schema.Array(item).annotate({
      description: `The ${kind} objects of this page, each without its files' content, which a read of one answers.`,
    }),
  });
