/**
 * The LibraryAdd: one item of the store's library — an Agent, a Skill or an McpServer — that a factory has added, served as an object in
 * the factory's namespace and named `<kind>.<name>`, as a Hire is named `<workflow>.<step>`. A factory resolves a library item once it
 * has added it, and the add is a live reference: its kind and its name, never a copy. Its `status` says what the add is in the factory
 * (`resolved`, `shadowed` by the factory's own, or `missing` from the library), and where the item is read from.
 *
 * An add is written with no body (`PUT …/libraryadds/<kind>.<name>`): the path says it all. Plain Schemas of JSON, as every object of this
 * package is.
 */
import { Schema } from 'effect';
import { API_VERSION, ObjectMeta, listOf } from './meta.ts';
import { DEFINITION_ORIGINS, LIBRARY_ADD_STATES, LIBRARY_KINDS } from './words.ts';

/** The library item added, by its kind and its name. */
export const LibraryAddSpec = Schema.Struct({
  kind: Schema.Literals(LIBRARY_KINDS).annotate({ description: 'The kind of the library item added: an Agent, a Skill or an McpServer.' }),
  name: Schema.String.annotate({ description: "The library item's name." }),
}).annotate({ description: 'The library item added, by its kind and its name.' });
export type LibraryAddSpec = typeof LibraryAddSpec.Type;

/** What the add is in its factory, the origin that shadows it, and where the library holds it. */
export const LibraryAddStatus = Schema.Struct({
  state: Schema.Literals(LIBRARY_ADD_STATES).annotate({
    description: "What the add is in its factory: resolved, shadowed by the factory's own, or missing from the library.",
  }),
  shadowedBy: Schema.optionalKey(
    Schema.Literals(DEFINITION_ORIGINS).annotate({
      description: "The factory's own origin that holds the name first, the factory's tree or its repository; absent where none does.",
    }),
  ),
  origin: Schema.optionalKey(
    Schema.Literals(DEFINITION_ORIGINS).annotate({
      description: "Where the library holds the item: the person's (`user`) or a builtin; absent where it is missing.",
    }),
  ),
  recorded: Schema.Boolean.annotate({
    description:
      "Whether the factory's adds are recorded: false where none has been written yet, and its adds are those its workflows resolve today.",
  }),
  message: Schema.optionalKey(
    Schema.String.annotate({ description: 'What to do about a missing add, naming the fix; absent where the add resolves.' }),
  ),
}).annotate({ description: 'What the add is in its factory, the origin that shadows it, and where the library holds it.' });
export type LibraryAddStatus = typeof LibraryAddStatus.Type;

/** A factory's add of a library item, as an object. */
export const LibraryAdd = Schema.Struct({
  apiVersion: Schema.Literal(API_VERSION).annotate({ description: 'The version the object is served under, nemia/v1.' }),
  kind: Schema.Literal('LibraryAdd').annotate({
    description: "What the object is: a LibraryAdd, one item of the store's library a factory has added.",
  }),
  metadata: ObjectMeta,
  spec: LibraryAddSpec,
  status: LibraryAddStatus,
});
export type LibraryAdd = typeof LibraryAdd.Type;

/** A page of a factory's adds from the library. */
export const LibraryAddList = listOf('LibraryAdd', LibraryAdd);
export type LibraryAddList = typeof LibraryAddList.Type;
