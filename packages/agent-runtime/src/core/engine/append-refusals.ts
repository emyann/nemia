/**
 * Why the Task door refuses an append (`append-refusal.ts`), a list and its word, read by the door and its contract
 * (`contracts/journal.contract.ts`).
 */

/** Why the door refuses an append, a closed set: the words of `JournalError.reason`. */
export const APPEND_REFUSALS = ['malformed-id', 'filed-twice', 'not-filed', 'attempt-out-of-order'] as const;

export type AppendRefusalReason = (typeof APPEND_REFUSALS)[number];
