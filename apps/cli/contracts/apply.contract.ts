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
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** What the read before the write found: no object of that name, or one, and whether it is the same as the file's. */
export type ApplyFound = { readonly exists: false } | { readonly exists: true; readonly same: boolean };

/** What the kind takes over the api: a create, an update, and whether its update makes an object that is missing. */
export type ApplyWrites = { readonly create: boolean; readonly update: boolean; readonly upsert: boolean };

/** What apply does with the object, or why it does nothing: the kind takes no create, or no update. */
export type ApplyAction = 'create' | 'update' | 'unchanged' | 'no-create' | 'no-update';

/** Whether the read found the object and it differs from the file's. */
const changed = (found: ApplyFound): boolean => found.exists && !found.same;

/** Whether the kind can make a missing object at all: a create, or an update that makes one. */
const makes = (writes: ApplyWrites): boolean => writes.create || (writes.upsert && writes.update);

const applyOfSpec = spec<(found: ApplyFound, writes: ApplyWrites) => ApplyAction>({
  ensures: {
    unchangedExactlyWhenSame: {
      description: 'An object served as the file says it is left alone, and nothing else is',
      condition: ({ input: [found], output }) => (output === 'unchanged') === (found.exists && found.same),
    },
    createOnlyWhatIsMissing: {
      description: 'An object is made only where none is served, by a kind that takes a create',
      condition: ({ input: [found, writes], output }) => output !== 'create' || (!found.exists && writes.create),
    },
    missingMadeByCreate: {
      description: 'A missing object of a kind that takes a create is made by the create',
      condition: ({ input: [found, writes], output }) => found.exists || !writes.create || output === 'create',
    },
    missingUpserted: {
      description: 'A missing object of a kind with no create, whose update makes one, is written by the update',
      condition: ({ input: [found, writes], output }) =>
        found.exists || writes.create || !writes.upsert || !writes.update || output === 'update',
    },
    missingWithNoWayRefused: {
      description: 'A missing object of a kind that can make none is refused as taking no create',
      condition: ({ input: [found, writes], output }) => found.exists || makes(writes) || output === 'no-create',
    },
    changedUpdated: {
      description: 'A served object the file changes is written, where the kind takes an update',
      condition: ({ input: [found, writes], output }) => !changed(found) || !writes.update || output === 'update',
    },
    changedWithNoUpdateRefused: {
      description: 'A served object the file changes, of a kind that takes no update, is refused as taking none',
      condition: ({ input: [found, writes], output }) => !changed(found) || writes.update || output === 'no-update',
    },
  },
});

/** `applyOf`'s type, which src/objects/apply.ts takes. */
export type ApplyOf = Implementation<typeof applyOfSpec>;
