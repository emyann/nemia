/** How an ask of `STORIES_WORKERS` is spelt (`workers.ts`), read by its contract's laws too (`contracts/stories-workers.contract.ts`). */

/**
 * How many story files `asked` asks for: a whole number of one or more, as decimal digits with no sign, space or leading zero; nothing
 * for any other spelling.
 * @param asked What `STORIES_WORKERS` holds, set and not empty.
 */
export const askedCount = (asked: string) => (/^[1-9][0-9]*$/.test(asked) ? Number(asked) : undefined);
