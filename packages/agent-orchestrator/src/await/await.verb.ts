/**
 * `nemia wait`'s follow: the feed read from a cursor until the first line its selectors take, or its bound (`waitFeed`), on the feed's live
 * reader (`followFeed`) — from the process's hub where it has one (the api's), else from the file on the reader's beat (the command line).
 */
import { Duration, Effect, Option, Ref, Stream } from 'effect';
import type { FeedWaitEnd } from 'objects';
import { FeedDoor } from '../feed/feed.store.ts';
import type { FeedLine } from '../feed/feed.ts';
import { followFeed } from '../feed/feed.verb.ts';
import { selects, type Selectors } from '../watch/selector.ts';

/** A line a wait answers, with the byte it starts at (`from`, its Event's name) and the cursor just after it (`to`). */
export type Waited = { readonly line: FeedLine; readonly from: number; readonly to: number };

/**
 * What a wait answers: why it ended — `matched`, a line its selectors take; `bound`, its bound with none — the lines it took (none at its
 * bound), and the cursor after the last line it read, taken or not, from which the next wait starts and loses no line.
 */
export type WaitAnswer = { readonly ended: FeedWaitEnd; readonly lines: readonly Waited[]; readonly cursor: number };

/**
 * What a wait is asked: the selectors a line must be taken by (none: every line), the cursor it reads from (none: the feed's end as it
 * opens), its bound in milliseconds (`waitBound` judged it), and the reader's beat, which a test sets.
 */
export type WaitAsked = { readonly selectors: Selectors; readonly from?: number; readonly ms: number; readonly beat?: Duration.Input };

/**
 * The feed followed from `from` (the feed's end as it opens where none is given) until a chunk of it — the lines of one pass, or of one
 * read of the file — holds a line `selectors` take, answering those lines of that chunk, `matched`; or until `ms` pass with none,
 * answering none, `bound`. Either way the cursor answered is after the last line it read, so every line after it is the next wait's.
 * Fails with the refusal of a cursor the feed cannot be read from (`followFeed`'s, exit 2), and of the store.
 */
export const waitFeed = Effect.fn('waitFeed')(function* ({ selectors, from, ms, beat }: WaitAsked) {
  const start = from ?? (yield* (yield* FeedDoor).lines.end())?.cursor ?? 0;
  const read = yield* Ref.make(start);
  const taken = followFeed(start, beat === undefined ? {} : { beat }).pipe(
    Stream.chunks,
    Stream.mapEffect((chunk) =>
      Ref.modify(read, (at): readonly [Waited[], number] => {
        const lines: Waited[] = [];
        let cursor = at;
        for (const f of chunk) {
          if (f.kind !== 'line') continue;
          if (selects(selectors, f.line)) lines.push({ line: f.line, from: cursor, to: f.cursor });
          cursor = f.cursor;
        }
        return [lines, cursor];
      }),
    ),
    Stream.filter((lines) => lines.length > 0),
    Stream.runHead,
  );
  const found = yield* taken.pipe(Effect.timeoutOption(Duration.millis(ms)), Effect.map(Option.flatten));
  const cursor = yield* Ref.get(read);
  return Option.match(found, {
    onNone: (): WaitAnswer => ({ ended: 'bound', lines: [], cursor }),
    onSome: (lines): WaitAnswer => ({ ended: 'matched', lines, cursor }),
  });
});
