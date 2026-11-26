/**
 * The one recipe of a version that is a digest (`versionDigest`): the sha256 of a text, cut to 16 hex characters — the same text, the
 * same word, across a restart too. A value's is the digest of its JSON (`valueVersion`). A digest is a content's own version, never a
 * served object's `resourceVersion` but a run's (until the run's status is a record): the definition index's records hold one, and a door's
 * compare-and-swap judges by it. A watched kind serves the keyspace revision of its last change (`atRevisions`), an event the byte after
 * its line in the feed (`feedPosition`). Pure.
 */
import { createHash } from 'node:crypto';

/**
 * The digest of `text` as a `resourceVersion`: its sha256, in hex, cut to 16 characters.
 * @param text The text to digest.
 */
export const versionDigest = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 16);

/**
 * The digest of `value`'s JSON as a `resourceVersion` (`versionDigest`).
 * @param value The value to digest, written as JSON.
 */
export const valueVersion = (value: unknown) => versionDigest(JSON.stringify(value));
