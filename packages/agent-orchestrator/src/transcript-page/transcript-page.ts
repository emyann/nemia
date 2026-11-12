/**
 * A page of a step's conversation, as `?limit=`, `?last=` and `?kinds=` cut the engine's read after a cursor (`transcriptCut`, proved by
 * contracts/transcript-page.contract.ts), and what its laws leave to the door: the cursor the api answers, `<engine cursor>~<n>` — the
 * engine's own opaque cursor and the count of events already answered after it — composed by `transcriptCursorOf` and read back by
 * `transcriptCursorRead`, a bare engine cursor reading as n = 0 and a count that is no whole number from 0 refused `Invalid`; the kinds
 * asked (`transcriptKindsOf`, a comma list of `SAID_AFTER`'s words, an unknown one refused `Invalid`); and the page itself
 * (`transcriptPaged`), whose cursor counts every event after the engine's, kept by `kinds` or not, so a read without `kinds` from it
 * misses none, and is the engine's own new cursor, bare, where the page reaches the end of what the engine read. Pure.
 */
import { SAID_AFTER, type PageBounds, type SaidAfter } from 'objects';
import type { TranscriptCut } from '../../contracts/transcript-page.contract.ts';
import { Invalid } from '../refusal/refusal.ts';

/** The smaller of two counts. */
const least = (a: number, b: number): number => (a < b ? a : b);

/** Whether a `limit` or a `last` is one a read takes: none, or a whole number from 1. */
const taken = (n: number | null): boolean => n === null || (Number.isInteger(n) && n >= 1);

/**
 * The events `[from, to)` of the `count` a read holds after its cursor: the first `limit` (the default page where neither is asked), or
 * the last `last`, never more than `bounds.most`; whether any is left after them; or the refusal of a read that asks both, or a `limit` or
 * a `last` that is no whole number from 1. A size is compared with what there is before it is taken, so no difference is below 0.
 */
export const transcriptCut: TranscriptCut = (count, limit, last, bounds) => {
  if (limit !== null && last !== null) return { refused: 'both' };
  if (!taken(limit)) return { refused: 'limit' };
  if (!taken(last)) return { refused: 'last' };
  if (last !== null) {
    const size = least(least(last, bounds.most), count);
    return { from: count - size, to: count, more: false };
  }
  const size = least(limit === null ? bounds.byDefault : limit, bounds.most);
  const to = size >= count ? count : size;
  return { from: 0, to, more: to < count };
};

/** What separates the engine's cursor from the count of events already answered after it. */
const MARK = '~';

/** Where a read of a conversation starts: after the engine's cursor (none for the start), past the first `skip` events it reads. */
export type TranscriptAt = { readonly engine: string | undefined; readonly skip: number };

/** The cursor the api answers for `skip` events read after the engine's cursor `engine` (none for the start): `<engine>~<skip>`. */
export const transcriptCursorOf = (engine: string | undefined, skip: number): string => `${engine ?? ''}${MARK}${skip}`;

/**
 * Where the cursor `after` starts a read (`TranscriptAt`): none for the start; a bare engine cursor, with no `~`, at its first event, as a
 * read before the api paged gave it; `<engine>~<n>` past `n` events after it — or `Invalid` where `n` is no whole number from 0.
 */
export const transcriptCursorRead = (after: string | undefined): TranscriptAt | Invalid => {
  if (after === undefined || after === '') return { engine: undefined, skip: 0 };
  const mark = after.lastIndexOf(MARK);
  if (mark === -1) return { engine: after, skip: 0 };
  const count = after.slice(mark + 1);
  const skip = /^(0|[1-9][0-9]*)$/.test(count) ? Number(count) : Number.NaN;
  if (!Number.isSafeInteger(skip))
    return new Invalid({
      message: `after ${JSON.stringify(after)} is no cursor of this conversation, its count after ${MARK} no whole number from 0: pass the cursor the last read answered, as it is, or leave after out to read from the start`,
    });
  const engine = after.slice(0, mark);
  return { engine: engine === '' ? undefined : engine, skip };
};

/**
 * The kinds `?kinds=` asks for, `SAID_AFTER`'s words comma-separated, in `SAID_AFTER`'s order: undefined for every kind, where none is
 * asked; `Invalid` for a word that is no kind.
 */
export const transcriptKindsOf = (kinds: string | undefined): readonly SaidAfter[] | undefined | Invalid => {
  if (kinds === undefined || kinds.trim() === '') return undefined;
  const asked = kinds.split(',').map((k) => k.trim());
  const unknown = asked.find((k) => !(SAID_AFTER as readonly string[]).includes(k));
  if (unknown !== undefined)
    return new Invalid({
      message: `kinds: ${JSON.stringify(unknown)} is no kind of event: pass ?kinds= as a comma list of ${SAID_AFTER.join(', ')}, or leave kinds out for every kind`,
    });
  return SAID_AFTER.filter((k) => asked.includes(k));
};

/** A count as a query carries it: null where none is given; the number a whole decimal spells; NaN, which no read takes, otherwise. */
const countOf = (text: string | undefined): number | null =>
  text === undefined || text === '' ? null : /^[0-9]+$/.test(text) ? Number(text) : Number.NaN;

/** What a read of a conversation asks, as its query spells it: the first `limit` events or the last `last`, and the `kinds` to answer. */
export type TranscriptAsked = {
  readonly limit?: string | undefined;
  readonly last?: string | undefined;
  readonly kinds?: string | undefined;
};

/** An event of a conversation, as far as a page reads it: its kind. */
type Said = { readonly kind: SaidAfter };

/** A page of a conversation: its events, the cursor to read on from, and whether events already said are left after it. */
export type TranscriptPaged<E> = { readonly events: E[]; readonly cursor: string; readonly more?: boolean };

/**
 * The kinds `asked` keeps, or its refusal before anything is read: a `limit` or a `last` that is no whole number from 1, both asked, or a
 * kind `SAID_AFTER` has not.
 */
export const transcriptAskedRead = (
  asked: TranscriptAsked,
  bounds: PageBounds,
): { readonly kinds: readonly SaidAfter[] | undefined } | Invalid => {
  const cut = transcriptCut(0, countOf(asked.limit), countOf(asked.last), bounds);
  if ('refused' in cut)
    return new Invalid({
      message:
        cut.refused === 'both'
          ? 'limit and last are both asked: pass ?limit=<n> for the first events after the cursor, or ?last=<n> for the last ones, not both'
          : `${cut.refused} ${JSON.stringify(asked[cut.refused])} is no whole number from 1: pass ?${cut.refused}=<n>, n from 1, or leave it out for the first ${bounds.byDefault} events`,
    });
  const kinds = transcriptKindsOf(asked.kinds);
  return kinds instanceof Invalid ? kinds : { kinds };
};

/**
 * The page `asked` cuts of `read`, every event the engine read after the cursor `at.engine` and its new cursor: of those past the first
 * `at.skip`, the ones of the kinds asked, cut by `transcriptCut` within `bounds`. Its cursor counts every event up to the last it answers,
 * kept or not, and is the engine's own, bare, where that reaches the end of what the engine read. `more` is absent where the page holds
 * every event after the cursor, and says otherwise whether events are left after it. `Invalid` as `transcriptAskedRead` refuses.
 */
export const transcriptPaged = <E extends Said>(
  read: { readonly events: readonly E[]; readonly cursor: string },
  at: TranscriptAt,
  asked: TranscriptAsked,
  bounds: PageBounds,
): TranscriptPaged<E> | Invalid => {
  const checked = transcriptAskedRead(asked, bounds);
  if (checked instanceof Invalid) return checked;
  const after = read.events.slice(at.skip);
  const kept = after.flatMap((event, i) => (checked.kinds === undefined || checked.kinds.includes(event.kind) ? [i] : []));
  const cut = transcriptCut(kept.length, countOf(asked.limit), countOf(asked.last), bounds);
  if ('refused' in cut) return new Invalid({ message: `${cut.refused}: pass ?limit=<n> or ?last=<n>, n from 1, not both` });
  const answered = kept.slice(cut.from, cut.to);
  const lastAnswered = answered.at(-1);
  const reached = lastAnswered === undefined ? 0 : lastAnswered + 1;
  const events = answered.flatMap((i) => {
    const event = after[i];
    return event === undefined ? [] : [event];
  });
  return {
    events,
    cursor: reached >= after.length ? read.cursor : transcriptCursorOf(at.engine, at.skip + reached),
    ...(events.length === after.length ? {} : { more: cut.more }),
  };
};
