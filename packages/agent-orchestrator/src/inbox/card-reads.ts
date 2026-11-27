/**
 * A card's parse kept across reads: the informer keeps each card's `cardOrWhy` by the card's file, beside the very text it parsed, and a
 * read is served it exactly where it hands that file and that text (`cardReadServed`). A cache of a pure function, never a source of
 * truth: in memory alone, empty after a restart, and swept to the cards a listing read lists.
 */
import { isDeepStrictEqual } from 'node:util';
import type { CardReadKey, CardReadServed } from '../../contracts/card-reads.contract.ts';
import { cardOrWhy, type CardOrWhy } from './inbox.ts';

/** A card's parse with the file and the text it was made of. */
type KeptCardRead = CardReadKey & { readonly read: CardOrWhy };

/** The kept parses by card file, and how many parses were made (not served) since the memo began. */
export type CardReads = { readonly kept: Map<string, KeptCardRead>; parsed: number };

/**
 * Whether a kept parse answers a read of a card now: where the read hands the same file and the same text.
 * @param kept What was kept for the file, none where nothing was.
 * @param file The card's file name.
 * @param text The card's text as read now.
 */
export const cardReadServed: CardReadServed = (kept, file, text) => kept !== undefined && kept.file === file && kept.text === text;

/** A memo that holds nothing: what a serving process starts with. */
export const cardReadsMemo = () => ({ kept: new Map(), parsed: 0 }) satisfies CardReads as CardReads;

// oxlint-disable-next-line landmines-types/no-explicit-return-types -- recursive: the checker cannot infer it
const frozen = <T>(value: T): T => {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const v of Object.values(value)) frozen(v);
    Object.freeze(value);
  }
  return value;
};

/**
 * A card's parse as the memo answers it: the kept parse where `cardReadServed`, else a fresh parse, frozen and kept. With no memo, a
 * fresh parse, as every caller without an informer gets.
 * @param reads The memo, none where the caller keeps none.
 * @param verify Whether a served parse is parsed afresh too, and a difference dies as a defect (`WF_VERIFY_REST`).
 */
export const cardReadThrough = (reads: CardReads | undefined, verify: boolean) => (file: string, text: string) => {
  if (reads === undefined) return cardOrWhy(file, text);
  const kept = reads.kept.get(file);
  if (kept !== undefined && cardReadServed(kept, file, text)) {
    if (verify && !isDeepStrictEqual(kept.read, cardOrWhy(file, text)))
      throw new Error(
        `the kept parse of the card ${file} differs from a fresh one: a card's parse is kept by its file and text, so this is a defect (WF_VERIFY_REST)`,
      );
    return kept.read;
  }
  const read = frozen(cardOrWhy(file, text));
  reads.kept.set(file, { file, text, read });
  reads.parsed += 1;
  return read;
};

/**
 * Each entry of a listing read with its parse, and the memo swept to the files listed.
 * @param reads The memo, none where the caller keeps none: the entries come back as they are.
 * @param verify Whether a served parse is parsed afresh too (`cardReadThrough`).
 * @param entries Every card file of the inbox, each with its text.
 */
export const cardsRead = <E extends { readonly file: string; readonly text: string }>(
  reads: CardReads | undefined,
  verify: boolean,
  entries: readonly E[],
) => {
  if (reads === undefined) return entries;
  const readOf = cardReadThrough(reads, verify);
  const listed = new Set(entries.map((e) => e.file));
  for (const file of reads.kept.keys()) if (!listed.has(file)) reads.kept.delete(file);
  return entries.map((e) => (e.file.endsWith('.md') ? { ...e, read: readOf(e.file, e.text) } : e));
};
