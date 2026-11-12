/**
 * What the laws of `transcriptCut` (contracts/transcript-page.contract.ts) leave to the door (transcript-page.ts): the cursor
 * `<engine cursor>~<n>` read back as it was composed, a bare engine cursor read from its first event, a count that is no whole number from
 * 0 refused; the kinds asked, an unknown one refused; and a page read with `kinds` whose cursor still counts every event, so a read without
 * `kinds` from it misses none. Kinds of refusal are asserted, never sentences.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SaidAfter } from 'objects';
import { Invalid } from '../refusal/refusal.ts';
import {
  type TranscriptAt,
  transcriptCursorOf,
  transcriptCursorRead,
  transcriptKindsOf,
  transcriptPaged,
  type TranscriptPaged,
} from './transcript-page.ts';

const BOUNDS = { byDefault: 3, most: 5 };

/** A read's events, `n` of them, the kinds in turn: a call, its result, words. */
const KINDS: readonly SaidAfter[] = ['tool_use', 'tool_result', 'text'];
const said = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `e-${i}`, kind: KINDS[i % KINDS.length] }));

const at = (cursor: string | undefined): TranscriptAt => {
  const read = transcriptCursorRead(cursor);
  assert.ok(!(read instanceof Invalid), `cursor ${cursor} reads`);
  return read;
};

const page = <E extends { kind: SaidAfter }>(p: TranscriptPaged<E> | Invalid): TranscriptPaged<E> => {
  assert.ok(!(p instanceof Invalid), 'the page is cut');
  return p;
};

test('a cursor composed is read back as it was composed, a bare engine cursor reads from its first event, none from the start', () => {
  assert.deepEqual(transcriptCursorRead(transcriptCursorOf('120.0123456789abcdef', 7)), { engine: '120.0123456789abcdef', skip: 7 });
  assert.deepEqual(transcriptCursorRead(transcriptCursorOf(undefined, 4)), { engine: undefined, skip: 4 });
  assert.deepEqual(transcriptCursorRead('120.0123456789abcdef'), { engine: '120.0123456789abcdef', skip: 0 });
  assert.deepEqual(transcriptCursorRead(undefined), { engine: undefined, skip: 0 });
  assert.deepEqual(transcriptCursorRead(''), { engine: undefined, skip: 0 });
});

test('a count after ~ that is no whole number from 0 is refused Invalid', () => {
  for (const cursor of ['c~', 'c~-1', 'c~1.5', 'c~x', 'c~01', `c~${'9'.repeat(20)}`])
    assert.ok(transcriptCursorRead(cursor) instanceof Invalid, cursor);
});

test('kinds is a comma list of the words of SAID_AFTER, none for every kind, and a word that is no kind is refused Invalid', () => {
  assert.deepEqual(transcriptKindsOf('tool_use,text'), ['text', 'tool_use']);
  assert.equal(transcriptKindsOf(undefined), undefined);
  assert.equal(transcriptKindsOf(''), undefined);
  assert.ok(transcriptKindsOf('tool_use,frobs') instanceof Invalid);
});

test('a limit, a last that is no whole number from 1, both asked, or a kind unknown are refused Invalid before anything is cut', () => {
  const read = { events: said(4), cursor: 'end' };
  for (const asked of [{ limit: '0' }, { limit: 'x' }, { last: '-2' }, { last: '1.5' }, { limit: '1', last: '1' }, { kinds: 'frobs' }])
    assert.ok(transcriptPaged(read, at(undefined), asked, BOUNDS) instanceof Invalid, JSON.stringify(asked));
});

test('with kinds=tool_use the next cursor counts every event, so a read without kinds from it misses none', () => {
  const read = { events: said(9), cursor: '9.ffffffffffffffff' };
  const first = page(transcriptPaged(read, at('0.0000000000000000'), { kinds: 'tool_use', limit: '2' }, BOUNDS));
  assert.deepEqual(
    first.events.map((e) => e.id),
    ['e-0', 'e-3'],
  );
  assert.equal(first.more, true);
  assert.equal(first.cursor, transcriptCursorOf('0.0000000000000000', 4), 'the cursor counts the result and the words it left out');
  const rest = page(transcriptPaged(read, at(first.cursor), {}, { byDefault: 100, most: 100 }));
  assert.deepEqual(
    rest.events.map((e) => e.id),
    ['e-4', 'e-5', 'e-6', 'e-7', 'e-8'],
    'read on without kinds, every event after the last one answered',
  );
  assert.equal(rest.cursor, read.cursor, "a page that reaches the end of the engine's read answers its cursor, bare");
  assert.equal(rest.more, undefined, 'a page holding every event after its cursor says nothing of more');
});

test('a default read walked by its cursor answers every event once, the last page the engine cursor; last answers the last ones', () => {
  const read = { events: said(8), cursor: '8.ffffffffffffffff' };
  const seen: string[] = [];
  let cursor: string | undefined;
  let more: boolean | undefined = true;
  for (let pages = 0; more === true && pages < 10; pages++) {
    const p = page(transcriptPaged(read, at(cursor), {}, BOUNDS));
    assert.ok(p.events.length <= BOUNDS.byDefault);
    seen.push(...p.events.map((e) => e.id));
    cursor = p.cursor;
    more = p.more;
  }
  assert.deepEqual(
    seen,
    read.events.map((e) => e.id),
  );
  assert.equal(cursor, read.cursor);
  const last = page(transcriptPaged(read, at(undefined), { last: '2' }, BOUNDS));
  assert.deepEqual(
    last.events.map((e) => e.id),
    ['e-6', 'e-7'],
  );
  assert.equal(last.more, false);
  assert.equal(last.cursor, read.cursor);
  assert.equal(page(transcriptPaged(read, at(undefined), { limit: '50' }, BOUNDS)).events.length, BOUNDS.most, 'a limit past the most');
});
