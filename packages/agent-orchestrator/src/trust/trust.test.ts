/**
 * The words of a place's trust, line for line: what is printed of each place asked (`trustedLines`) — the three lines of one written,
 * nothing of one already trusted, why of one refused or not asked — and what a listing says under a factory (`untrustedLines`): its
 * own places alone, each with the line that repairs it, or why nothing can. And the second thing a refusal that counted a repository's
 * own allow rules says of the trust those rules wait on (`untrustedNote`): said only where the trust is withheld, and repaired by the
 * factory's verb where the run has a factory and by a person at the harness where it has none.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trustedLines, untrustedLines, untrustedNote, type PlaceTrust, type Untrusted } from './trust.ts';

const asked = (over: Partial<Extract<PlaceTrust, { harness: string }>>): PlaceTrust => ({
  place: '/code/one',
  harness: 'A harness',
  folder: '/code/one',
  grants: 'its allow rules',
  back: 'unset the key',
  wrote: true,
  refused: null,
  ...over,
});

test('a place written is said in three lines: the place and harness, what the trust grants, and how to take it back', () => {
  assert.deepEqual(trustedLines('nemia', [asked({})]), [
    'trusted for A harness: /code/one',
    '  it grants its allow rules',
    '  take it back: unset the key',
  ]);
  assert.equal(trustedLines('nemia', [asked({ place: '/ws/cut' })])[0], 'trusted for A harness: /ws/cut (kept under /code/one)');
});

test('REFUSED: nothing is said of a place already trusted; one refused says why, and one not asked says the line that asks again', () => {
  assert.deepEqual(trustedLines('nemia', [asked({ wrote: false })]), []);
  assert.deepEqual(trustedLines('nemia', [asked({ wrote: false, refused: 'the file does not read' })]), [
    'not trusted for A harness: /code/one — the file does not read',
  ]);
  assert.deepEqual(trustedLines('nemia', [{ place: '/code/one', unasked: 'the place did not answer' }]), [
    'not trusted: /code/one was not asked of — the place did not answer. Ask again: nemia factory trust nemia',
  ]);
});

test("a listing says a factory's own untrusted places alone, each with the line that trusts it, or why nothing can", () => {
  const lacking = (over: Partial<Untrusted>): Untrusted => ({
    factory: 'nemia',
    place: '/code/one',
    harness: 'A harness',
    folder: '/code/one',
    withheld: 'its allow rules',
    never: null,
    ...over,
  });
  const all = [
    lacking({}),
    lacking({ factory: 'pipao', place: '/code/two' }),
    lacking({ place: '/home/me', never: 'Name a folder inside.' }),
  ];
  assert.deepEqual(untrustedLines('nemia', all, 2), [
    '    not trusted for A harness: /code/one — withheld: its allow rules. Trust it: nemia factory trust nemia',
    '    not trusted for A harness: /home/me — withheld: its allow rules. Name a folder inside.',
  ]);
  assert.deepEqual(untrustedLines('pipao', all, 0), [
    '  not trusted for A harness: /code/two — withheld: its allow rules. Trust it: nemia factory trust pipao',
  ]);
  assert.deepEqual(untrustedLines('other', all, 0), []);
});

/** A harness's trust of one repository as the refusal's note reads it: withheld unless `trusted` says otherwise. */
const read = (trusted: boolean) => ({ harness: 'A harness', folder: '/code/one', grants: 'its allow rules', trusted });

test('a trust withheld is the second thing to check, naming the harness, the folder, what is withheld, and the factory verb that gives it', () => {
  const note = untrustedNote(read(false), 'ours');
  assert.equal(
    note,
    'Check too that A harness trusts /code/one: it does not, and until it does it withholds its allow rules, so the rules counted ' +
      'above may not reach the session at all. nemia factory trust ours gives it.',
  );
});

test('a run in no factory is repaired by a person at the harness instead, since no factory verb can ask the trust for it', () => {
  const note = untrustedNote(read(false));
  assert.match(note ?? '', /Run A harness in \/code\/one once and accept its prompt gives it\.$/);
  assert.ok(!note?.includes('nemia factory trust'), 'a run in no factory is told no factory verb');
  assert.notEqual(note, untrustedNote(read(false), 'ours'), 'the two repairs are not one sentence');
});

test('nothing is said of a trust that is given, nor of a harness that keeps none: a refusal says the trust only where it is true', () => {
  assert.equal(untrustedNote(read(true), 'ours'), undefined);
  assert.equal(untrustedNote(read(true)), undefined);
  assert.equal(untrustedNote(undefined, 'ours'), undefined);
  assert.equal(untrustedNote(undefined), undefined);
});
