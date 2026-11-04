/**
 * The Feed door's files layer: the door's walks (`test/feed-walks.ts`) on a fresh scratch store each, and what only the files can be
 * asked — the generation of a feed cut and put back, the fold a pass keeps read afresh after a cut (`feedPass`), the default door's
 * root — and the debt of
 * the module spellings `src` still calls (`test/feed-door.baseline.ts`). The partial-line and malformed-line reads are `feed.test.ts`'s.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { scratch } from '../../test/scratch.ts';
import { act, done, doorFrom, walksOn } from '../../test/door-walks.ts';
import { FEED_WALKS } from '../../test/feed-walks.ts';
import { FeedDoor, feedDoorFiles, feedPass } from './feed.store.ts';
import { freshMemo } from './feed.ts';
import { StoreRoot } from '../config/root.store.ts';
import type { RunLine } from './feed.ts';

const PKG = path.join(import.meta.dirname, '..', '..');

for (const [name, body] of walksOn(FEED_WALKS, () => {
  const root = scratch('wf-feed-door-');
  return { door: doorFrom(FeedDoor, feedDoorFiles(root)), root, layer: 'files' };
}))
  test(name, body);

/** A fresh store, its Feed door over the files, and its feed. */
const store = () => {
  const root = scratch('wf-feed-door-');
  return { root, door: doorFrom(FeedDoor, feedDoorFiles(root)), feed: path.join(root, 'feed.jsonl') };
};
const aLine = (word: string): RunLine => ({ at: '2026-11-01T00:00:00.000Z', run: 'r-1', word });

test("a feed cut and put back is another generation: the end's generation is the file's inode, and changes with it", () => {
  const { door, feed } = store();
  done(door.lines.append([aLine('running')]));
  const first = done(door.lines.end());
  assert.equal(first?.generation, fs.statSync(feed).ino);
  fs.renameSync(feed, `${feed}.old`);
  fs.writeFileSync(feed, `${JSON.stringify(aLine('running'))}\n`);
  const cut = done(door.lines.end());
  assert.notEqual(cut?.generation, first?.generation, 'a file put in its place is a feed the fold has not read');
  assert.equal(cut?.cursor, first?.cursor, 'though it is as long');
});

test('a fold kept across passes is read again from the start when the feed is cut under it, and says every word again', () => {
  const { door, feed } = store();
  const memo = freshMemo();
  const now = new Map([['r-1', { run: { word: 'running' }, steps: [] }]]);
  const pass = () => done(feedPass(door, memo, now, { at: '2026-11-01T00:00:00.000Z' })).lines.map((l) => l.word);
  assert.deepEqual(pass(), ['running']);
  assert.deepEqual(pass(), [], 'a word the feed holds is not said again');
  const said = fs.readFileSync(feed);
  fs.writeFileSync(`${feed}.new`, Buffer.alloc(said.length, 0x0a));
  fs.renameSync(`${feed}.new`, feed);
  assert.deepEqual(pass(), ['running'], 'another file as long as the one it read is another generation: the fold starts afresh');
  assert.deepEqual(pass(), []);
  fs.truncateSync(feed, 3);
  assert.deepEqual(pass(), ['running'], 'a cursor the feed refuses starts it afresh too');
});

test('the default door reads the feed at the store root the program is given, and refuses Invalid where it was given none', () => {
  const { root, door } = store();
  done(door.lines.append([aLine('running')]));
  const end = Effect.gen(function* () {
    return (yield* (yield* FeedDoor).lines.end())?.cursor;
  });
  assert.equal(act(Effect.provideService(end, StoreRoot, root)), Buffer.byteLength(`${JSON.stringify(aLine('running'))}\n`));
  assert.deepEqual(act(end), { refused: 'Invalid' });
});

/** The feed's module spellings that `src`'s code still calls rather than yielding the door. */
const SEAM = ['watchFeed', 'recordFeed', 'recordDaemonLine', 'readFeed', 'readFeedEnds', 'feedSize', 'feedCursorRefusal', 'feedFile'];

/** The door's own files: where the seam is defined, not a debt. */
const OWN = ['src/feed/feed.store.ts', 'src/feed/memory.store.ts'];

/** Every file of `src` but the tests and the door's own, by its path from the package. */
function sourcesOfSrc(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of fs.readdirSync(path.join(PKG, 'src'), { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;
    const file = path.relative(PKG, path.join(entry.parentPath, entry.name)).split(path.sep).join('/');
    if (!OWN.includes(file)) out[file] = fs.readFileSync(path.join(PKG, file), 'utf8');
  }
  return out;
}

/** The seam's calls in each file, comment lines left out: what `FEED_DOOR_DEBT` counts. */
function seamUses(sources: Record<string, string>): Map<string, number> {
  const call = new RegExp(`(?<![\\w$.])(?:${SEAM.join('|')})\\s*\\(`, 'g');
  const uses = new Map<string, number>();
  for (const [file, text] of Object.entries(sources)) {
    const code = text
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
      .join('\n');
    const n = [...code.matchAll(call)].length;
    if (n) uses.set(file, n);
  }
  return uses;
}

/** Why the uses of `sources` break the baseline `debt`: a file it does not name, a count grown, a count fallen. */
function debtBreaks(sources: Record<string, string>, debt: Readonly<Record<string, number>>): string[] {
  const uses = seamUses(sources);
  const out: string[] = [];
  for (const [file, n] of uses) {
    const owed = debt[file] ?? 0;
    if (n > owed)
      out.push(
        `${file} calls the feed's module spellings ${n} time(s) where test/feed-door.baseline.ts names ${owed}: yield FeedDoor (src/feed/feed.store.ts) instead`,
      );
    if (n < owed)
      out.push(
        `${file} calls the feed's module spellings ${n} time(s): lower its count in test/feed-door.baseline.ts to ${n}, which only shrinks`,
      );
  }
  for (const file of Object.keys(debt))
    if (!uses.has(file)) out.push(`${file} calls the feed's module spellings no more: take its line out of test/feed-door.baseline.ts`);
  return out;
}

test("no file of src calls the feed's module spellings but as test/feed-door.baseline.ts counts it, and the count only shrinks", async () => {
  const { FEED_DOOR_DEBT } = await import('../../test/feed-door.baseline.ts');
  assert.deepEqual(debtBreaks(sourcesOfSrc(), FEED_DOOR_DEBT), []);
});

test('REFUSED: a converted file that calls a spelling again, and a count the baseline holds above what is left', async () => {
  const { FEED_DOOR_DEBT } = await import('../../test/feed-door.baseline.ts');
  const sources = sourcesOfSrc();
  const again = { ...sources, 'src/feed/feed.verb.ts': `${sources['src/feed/feed.verb.ts']}\nconst x = feedSize();\n` };
  assert.equal(debtBreaks(again, FEED_DOOR_DEBT).length, 1);
  const [first] = Object.keys(FEED_DOOR_DEBT);
  assert.equal(debtBreaks(sources, { ...FEED_DOOR_DEBT, [first]: (FEED_DOOR_DEBT[first] ?? 0) + 1 }).length, 1);
});
