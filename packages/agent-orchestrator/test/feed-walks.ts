/**
 * The Feed door's contract (`FeedDoor`, `src/feed/feed.store.ts`), as walks (`door-walks.ts`): every method's rows, run on the files by
 * `src/feed/feed.store.test.ts` and on the memory stand-in by `src/feed/memory.store.test.ts`. A feed not written has no end; lines
 * appended are read back from 0 with the byte after each and the cursor to read on from, and their end is that cursor, in the same
 * generation; a read at the end reads none; a cursor past the end or inside a line is said why. And the door's checks: a cursor that is
 * no whole number of bytes, or that the feed has no line boundary at, is refused `Invalid`; a line the model's `FeedLine` refuses is
 * refused `Invalid`, and nothing of its append is written.
 *
 * Each walk is on a side of its own: a fresh store, or a fresh stand-in. What only the files can be asked — a partial last line, a line
 * that does not read, a feed cut under a reader — is their own test's, never a walk.
 */
import type { DoorWalk } from './door-walks.ts';
import { act, done } from './door-walks.ts';
import type { FeedDoorShape } from '../src/feed/feed.store.ts';
import type { FeedLine, RunLine } from '../src/feed/feed.ts';

type Walk = DoorWalk<FeedDoorShape>;
type Door = FeedDoorShape;

/** A run's line as a pass writes one. */
const aLine = (word: string, run = 'r-1'): RunLine => ({ at: '2026-11-01T00:00:00.000Z', run, word });

/** The bytes `lines` take on the feed, one JSON line each. */
const bytesOf = (lines: readonly FeedLine[]): number => Buffer.byteLength(lines.map((l) => `${JSON.stringify(l)}\n`).join(''));

const TWO = [aLine('running'), aLine('done · a note with a dash — in it')];

/** `TWO` appended on `door`, and where they ended. */
const appended = (door: Door): number => done(door.lines.append(TWO)).after;

export const FEED_WALKS: Readonly<Record<string, readonly Walk[]>> = {
  'lines.end': [
    { name: 'a feed not written has none', walk: ({ door }) => done(door.lines.end()), says: null },
    {
      name: 'the bytes written, in one generation across appends',
      walk: ({ door }) => {
        done(door.lines.append([aLine('running')]));
        const first = done(door.lines.end());
        done(door.lines.append([aLine('done')]));
        const second = done(door.lines.end());
        return { cursor: second?.cursor, same: first?.generation === second?.generation };
      },
      says: { cursor: bytesOf([aLine('running'), aLine('done')]), same: true },
    },
  ],
  'lines.read': [
    { name: 'a feed not written reads none, at 0', walk: ({ door }) => done(door.lines.read(0)), says: { lines: [], ends: [], cursor: 0 } },
    {
      name: 'from 0: each line appended, the byte after it in bytes, and the cursor at the end',
      walk: ({ door }) => {
        appended(door);
        const read = done(door.lines.read(0));
        return { words: read.lines.map((l) => l.word), ends: read.ends, cursor: read.cursor };
      },
      says: { words: TWO.map((l) => l.word), ends: [bytesOf(TWO.slice(0, 1)), bytesOf(TWO)], cursor: bytesOf(TWO) },
    },
    {
      name: 'from the end of a line: the lines after it alone',
      walk: ({ door }) => {
        appended(door);
        const read = done(door.lines.read(bytesOf(TWO.slice(0, 1))));
        return read.lines.map((l) => l.word);
      },
      says: [TWO[1]?.word],
    },
    {
      name: 'at the end: none, and the cursor where it was',
      walk: ({ door }) => {
        const end = appended(door);
        return done(door.lines.read(end));
      },
      says: { lines: [], ends: [], cursor: bytesOf(TWO) },
    },
    { name: 'REFUSED: a negative cursor is Invalid', walk: ({ door }) => act(door.lines.read(-1)), says: { refused: 'Invalid' } },
    { name: 'REFUSED: a cursor of no whole bytes is Invalid', walk: ({ door }) => act(door.lines.read(1.5)), says: { refused: 'Invalid' } },
    {
      name: 'REFUSED: a cursor inside a line is Invalid',
      walk: ({ door }) => {
        appended(door);
        return act(door.lines.read(3));
      },
      says: { refused: 'Invalid' },
    },
    {
      name: 'REFUSED: a cursor past the end is Invalid',
      walk: ({ door }) => {
        const end = appended(door);
        return act(door.lines.read(end + 10));
      },
      says: { refused: 'Invalid' },
    },
  ],
  'lines.cursorRefusal': [
    {
      name: 'none at 0, at the end of a line and at the end',
      walk: ({ door }) => {
        const none = done(door.lines.cursorRefusal(0));
        const end = appended(door);
        return [none, done(door.lines.cursorRefusal(bytesOf(TWO.slice(0, 1)))), done(door.lines.cursorRefusal(end))];
      },
      says: [undefined, undefined, undefined],
    },
    {
      name: 'words for a cursor past the end, inside a line, and of no whole bytes',
      walk: ({ door }) => {
        const end = appended(door);
        return [end + 1, 3, -1].map((at) => typeof done(door.lines.cursorRefusal(at)));
      },
      says: ['string', 'string', 'string'],
    },
  ],
  'lines.append': [
    {
      name: 'the lines written and where their bytes went, the next append after the last',
      walk: ({ door }) => {
        const first = done(door.lines.append(TWO.slice(0, 1)));
        const second = done(door.lines.append(TWO.slice(1)));
        return [first, second];
      },
      says: [
        { lines: TWO.slice(0, 1), before: 0, after: bytesOf(TWO.slice(0, 1)), leading: '' },
        { lines: TWO.slice(1), before: bytesOf(TWO.slice(0, 1)), after: bytesOf(TWO), leading: '' },
      ],
    },
    {
      name: "a daemon's line and the store's, beside a run's",
      walk: ({ door }) => {
        const daemon: FeedLine = { at: '2026-11-01T00:00:00.000Z', daemon: 42, word: 'daemon started' };
        const store: FeedLine = { at: '2026-11-01T00:00:00.000Z', store: 'store', word: 'store paused' };
        done(door.lines.append([daemon, store, aLine('running')]));
        return done(door.lines.read(0)).lines.map((l) => l.word);
      },
      says: ['daemon started', 'store paused', 'running'],
    },
    {
      name: 'REFUSED: a line the model refuses is Invalid, and nothing of the append is written',
      walk: ({ door }) => {
        const broken = { at: '2026-11-01T00:00:00.000Z', run: 'r-1', word: 42 } as unknown as FeedLine;
        return [act(door.lines.append([aLine('running'), broken])), done(door.lines.end())];
      },
      says: [{ refused: 'Invalid' }, null],
    },
    {
      name: 'REFUSED: a line that is no line of the feed is Invalid, after lines written, which stay',
      walk: ({ door }) => {
        const end = appended(door);
        const none = { at: '2026-11-01T00:00:00.000Z', word: 'running' } as unknown as FeedLine;
        return [act(door.lines.append([none])), done(door.lines.end())?.cursor === end];
      },
      says: [{ refused: 'Invalid' }, true],
    },
  ],
};
