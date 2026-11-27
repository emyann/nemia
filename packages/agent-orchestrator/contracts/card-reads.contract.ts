/**
 * A card's parse kept across reads (agent-orchestrator, src/inbox/card-reads.ts). A serving process keeps each card's parse
 * (`cardOrWhy`) on its informer, by the card's file, beside the file name and the very text it parsed. `cardReadServed` says whether
 * that kept parse answers a read of the card now: exactly where the read hands the same file and the same text, since a card's parse is
 * a function of its file's name and its text alone. A card written since, by a person, a verb or the import, reads another text and is
 * parsed afresh, so no read serves a card older than its record.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** What a kept parse was made of: the card's file in the inbox (`<name>.md`) and the text parsed. */
export type CardReadKey = { readonly file: string; readonly text: string };

const cardReadServedSpec = spec<(kept: CardReadKey | undefined, file: string, text: string) => boolean>({
  ensures: {
    nothingKeptIsParsed: {
      description: 'A card with no parse kept is parsed afresh',
      condition: ({ input: [kept], output }) => kept !== undefined || !output,
    },
    otherTextIsParsed: {
      description: 'A card whose text is not the one its kept parse was made of is parsed afresh: no read serves a card older than its record',
      condition: ({ input: [kept, , text], output }) => kept === undefined || kept.text === text || !output,
    },
    otherFileIsParsed: {
      description: 'A parse kept for another file answers no read of this one, since the file names the card in what a refusal says',
      condition: ({ input: [kept, file], output }) => kept === undefined || kept.file === file || !output,
    },
    sameCardIsServed: {
      description: 'A card read with the very file and text its kept parse was made of is served that parse, never parsed again',
      condition: ({ input: [kept, file, text], output }) =>
        kept === undefined || kept.file !== file || kept.text !== text || output,
    },
  },
});

/** `cardReadServed`'s type, which `src/inbox/card-reads.ts` takes. */
export type CardReadServed = Implementation<typeof cardReadServedSpec>;
