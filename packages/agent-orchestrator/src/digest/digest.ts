/**
 * The one recipe of a `resourceVersion` that is a digest (`versionDigest`): the sha256 of a text, cut to 16 hex characters — the same
 * text, the same word, across a restart too. A value's is the digest of its JSON (`valueVersion`). Every kind whose version says what it
 * holds takes it here: a card's text, a run, a factory's part, a proposal, an agent's files, a skill held in memory. An event's and a
 * delegation's `resourceVersion` are no digest but a position — the byte after the event's line in the feed (`feedPosition`), when the
 * delegation was written (`writtenPosition`) — and are named so where they are made. Pure.
 */
import { createHash } from 'node:crypto';

/** The digest of `text` as a `resourceVersion`: its sha256, in hex, cut to 16 characters. */
export const versionDigest = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 16);

/** The digest of `value`'s JSON as a `resourceVersion` (`versionDigest`). */
export const valueVersion = (value: unknown): string => versionDigest(JSON.stringify(value));
