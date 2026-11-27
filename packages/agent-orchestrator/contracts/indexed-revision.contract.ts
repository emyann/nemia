/**
 * The revision a definition is served and judged at, numbered without a write (agent-orchestrator,
 * src/definition-index/definition-index.ts, `indexedRevision`): a definition stays a file, and the index holds one record of it under
 * `/registry/definitions/<scope>/<kind>/<name>` whose text says where it is and a digest of what it holds. The daemon's sweep writes
 * that record where the files moved; a GET writes nothing, in any process. So a read, and the write that names what the read served,
 * each number the definition from what they are handed: the index's live record of it (its text and its revision, none where no sweep
 * has numbered it), the text the files hold now (none where they hold no such definition), and the keyspace head read beside them.
 * A record that still holds the files is the definition's revision; a definition the index holds no record of, or one whose files
 * moved since the record was written, reads as the next revision, the one a sweep would give it now — as `driftNow` numbers a content
 * nobody has swept with no write. Pure.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** The index's live record of one definition: the text it holds (`{ digest, path }` as JSON) and the revision it was written at. */
export type IndexRecord = { readonly value: string; readonly revision: number };

/** Whether `n` is a whole number from 0 that a double holds exactly, as a revision is. */
const whole = (n: number) => Number.isSafeInteger(n) && n >= 0;

/** Whether the index's record holds what the files hold now: written by a sweep that read the files as they are. */
const holds = (held: IndexRecord | null, wanted: string | null) => held !== null && wanted !== null && held.value === wanted;

const indexedRevisionSpec = spec<(held: IndexRecord | null, wanted: string | null, head: number) => number | null>({
  requires: ({ input: [held, wanted, head] }) =>
    whole(head) &&
    (held === null || (whole(held.revision) && held.revision >= 1 && held.revision <= head)) &&
    (wanted === null || wanted.length > 0),
  ensures: {
    noneExactlyWhereTheFilesHoldNone: {
      description: 'A definition the files no longer hold is served at no revision, and every definition they hold is served at one',
      condition: ({ input: [, wanted], output }) => (output === null) === (wanted === null),
    },
    theRecordsRevisionWhereItHoldsTheFiles: {
      description: 'A definition whose index record holds its files as they are is at the revision that record was written at',
      condition: ({ input: [held, wanted], output }) => !holds(held, wanted) || output === held?.revision,
    },
    theNextRevisionWhereNoRecordHoldsTheFiles: {
      description:
        'A definition no sweep has numbered, or whose files moved since its record was written, is at the revision a sweep would give it now: one past the head',
      condition: ({ input: [held, wanted, head], output }) => wanted === null || holds(held, wanted) || output === head + 1,
    },
  },
});

/**
 * `indexedRevision`'s type, which `src/definition-index/definition-index.ts` takes and the dry numbering of the definition index
 * (`definitionsNumbered`) asks of each definition the files hold.
 */
export type IndexedRevisionOf = Implementation<typeof indexedRevisionSpec>;
