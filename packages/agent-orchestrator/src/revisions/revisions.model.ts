/**
 * The revisions model: one entry of the ledger of a kind and name, as a Schema at the Ledger door (`revisions.store.ts`). Checked on an
 * append; a stored entry is read nominally (`RevisionOnRead`), so a ledger written before the check still reads.
 */
import { Schema } from 'effect';
import type { ErModel } from '../model/er.model.ts';
import { REVISION_KINDS } from './revisions.ts';

/** A time as the ledger writes one: an ISO string `Date` reads. */
const Instant = Schema.String.check(
  Schema.makeFilter<string>((s) => (!Number.isNaN(Date.parse(s)) ? true : 'an ISO time, as new Date().toISOString() writes one'), {
    expected: 'an ISO time',
  }),
);

/** What a ledger is kept for (`RevisionOf`): a kind of `REVISION_KINDS`, and a name within it. */
export const RevisionOf = Schema.Struct({ kind: Schema.Literals([...REVISION_KINDS]), name: Schema.NonEmptyString });
export type RevisionOf = typeof RevisionOf.Type;

const hash = Schema.NonEmptyString;

/**
 * One entry of a kind and name's ledger (`Revision`): its number, a whole one from 1, the digest of the content it was given for, and
 * when it was first seen.
 */
export const Revision = Schema.Struct({
  ...RevisionOf.fields,
  n: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  hash,
  at: Instant,
}).annotate({ identifier: 'Revision' });
export type Revision = typeof Revision.Type;

/** What an append is given, before the ledger numbers it: an entry of `Revision` but its `n`. */
export const RevisionAppended = Schema.Struct({ ...RevisionOf.fields, hash, at: Instant });

/** An entry as a ledger's file keeps it, read nominally: a number, a digest and a time, as the ledger has always kept them. */
export const RevisionOnRead = Schema.Struct({ n: Schema.Number, hash: Schema.String, at: Schema.String });

/** The revisions' part of the orchestrator's diagram. */
export const revisionsModel = { entities: [Revision], ids: {} } satisfies ErModel;
