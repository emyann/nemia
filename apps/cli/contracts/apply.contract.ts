/**
 * What `nemia apply` does with one object of its file (apps/cli, src/objects/apply.ts, `applyOf`), as `kubectl apply` says it: the object
 * read first in its namespace, then made where it is missing (`create`), written where what the file says differs from what is served
 * (`update`), and left alone where it does not (`unchanged`). What the kind takes over the api decides the rest: a kind that cannot be
 * made is refused for a missing object (`no-create`), and one that cannot be written for a changed object (`no-update`). A kind whose
 * write makes a missing object (`upsert`: a PUT of one that creates, as the McpServer's, the Schedule's and the Hire's do) is written
 * where it has no create.
 *
 * What the kind takes is the client's table of the `Api` (`KIND_CALLS`, src/objects/kinds.ts), never a guess from a word; whether the
 * object is the same is its `spec` and its labels compared with the served object's, the caller's to say.
 *
 * An object copied from a list is no object to write: a list never carries a file's content (objects' `LISTED_WITHOUT`), so its spec
 * lacks what a read of one holds, and a write of it would make or overwrite the object with its files left empty. Such an object
 * (`whole` false, the caller's to say from the kind's `LISTED_WITHOUT` paths under `spec`) is refused (`partial`) whatever its read
 * found, before anything else is judged; every other law speaks of a whole object.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** What the read before the write found: no object of that name, or one, and whether it is the same as the file's. */
export type ApplyFound = { readonly exists: false } | { readonly exists: true; readonly same: boolean };

/** What the kind takes over the api: a create, an update, and whether its update makes an object that is missing. */
export type ApplyWrites = { readonly create: boolean; readonly update: boolean; readonly upsert: boolean };

/** What apply does with the object, or why it does nothing: the kind takes no create, or no update, or the object is a list's copy. */
export type ApplyAction = 'create' | 'update' | 'unchanged' | 'no-create' | 'no-update' | 'partial';

/** Whether the read found the object and it differs from the file's. */
const changed = (found: ApplyFound) => found.exists && !found.same;

/** Whether the kind can make a missing object at all: a create, or an update that makes one. */
const makes = (writes: ApplyWrites) => writes.create || (writes.upsert && writes.update);

const applyOfSpec = spec<(found: ApplyFound, writes: ApplyWrites, whole: boolean) => ApplyAction>({
  ensures: {
    partialExactlyWhenNotWhole: {
      description: "An object copied from a list, lacking its files' content, is refused as partial, and no whole object is",
      condition: ({ input: [, , whole], output }) => (output === 'partial') === !whole,
    },
    unchangedExactlyWhenSame: {
      description: 'A whole object served as the file says it is left alone, and nothing else is',
      condition: ({ input: [found, , whole], output }) => (output === 'unchanged') === (whole && found.exists && found.same),
    },
    createOnlyWhatIsMissing: {
      description: 'An object is made only where none is served, whole, by a kind that takes a create',
      condition: ({ input: [found, writes, whole], output }) => output !== 'create' || (whole && !found.exists && writes.create),
    },
    updateOnlyWhole: {
      description: 'An object is written only where the file holds it whole',
      condition: ({ input: [, , whole], output }) => output !== 'update' || whole,
    },
    missingMadeByCreate: {
      description: 'A missing whole object of a kind that takes a create is made by the create',
      condition: ({ input: [found, writes, whole], output }) => !whole || found.exists || !writes.create || output === 'create',
    },
    missingUpserted: {
      description: 'A missing whole object of a kind with no create, whose update makes one, is written by the update',
      condition: ({ input: [found, writes, whole], output }) =>
        !whole || found.exists || writes.create || !writes.upsert || !writes.update || output === 'update',
    },
    missingWithNoWayRefused: {
      description: 'A missing whole object of a kind that can make none is refused as taking no create',
      condition: ({ input: [found, writes, whole], output }) => !whole || found.exists || makes(writes) || output === 'no-create',
    },
    changedUpdated: {
      description: 'A served object the file changes, and holds whole, is written, where the kind takes an update',
      condition: ({ input: [found, writes, whole], output }) => !whole || !changed(found) || !writes.update || output === 'update',
    },
    changedWithNoUpdateRefused: {
      description: 'A served object the file changes, and holds whole, of a kind that takes no update, is refused as taking none',
      condition: ({ input: [found, writes, whole], output }) => !whole || !changed(found) || writes.update || output === 'no-update',
    },
  },
});

/** `applyOf`'s type, which src/objects/apply.ts takes. */
export type ApplyOf = Implementation<typeof applyOfSpec>;
