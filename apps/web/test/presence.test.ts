/**
 * Nemia's face wears one expression for every presence that holds at once, picked in the owner's order: waits on you > not sent >
 * down > answering > unread > up. Her cues say every presence that holds, in the same order.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cuesOf, faceOf, UP, type Presence } from '../src/lib/presence.ts';

/** Every presence holding at once. */
const ALL: Presence = { waitsOnYou: 2, notSent: true, down: true, answering: true, unread: 1 };

test('the face is the first presence that holds in the owner’s order, each winner taken away in turn', () => {
  const steps: [Partial<Presence>, string][] = [
    [{}, 'surprised'],
    [{ waitsOnYou: 0 }, 'unsure'],
    [{ notSent: false }, 'sleepy'],
    [{ down: false }, 'thinking'],
    [{ answering: false }, 'happy'],
    [{ unread: 0 }, 'idle'],
  ];
  let presence = ALL;
  const faces = steps.map(([without]) => {
    presence = { ...presence, ...without };
    return faceOf(presence);
  });
  assert.deepEqual(
    faces,
    steps.map(([, face]) => face),
  );
});

test('each pair of neighbours in the order: the earlier wins whichever way they meet', () => {
  assert.equal(faceOf({ ...UP, waitsOnYou: 1, notSent: true }), 'surprised');
  assert.equal(faceOf({ ...UP, notSent: true, down: true }), 'unsure');
  assert.equal(faceOf({ ...UP, down: true, answering: true }), 'sleepy');
  assert.equal(faceOf({ ...UP, answering: true, unread: 3 }), 'thinking');
  assert.equal(faceOf({ ...UP, unread: 3 }), 'happy');
  assert.equal(faceOf(UP), 'idle');
});

test('the cues say every presence that holds, in the owner’s order, each in its hue and words', () => {
  assert.deepEqual(cuesOf(ALL), [
    { hue: 'yours', words: '2 wait on you' },
    { hue: 'failure', words: 'Not sent' },
    { hue: 'none', words: 'Down' },
    { hue: 'alive', words: 'Answering' },
    { hue: 'alive', words: '1 new' },
  ]);
  assert.deepEqual(cuesOf({ ...UP, waitsOnYou: 1 }), [{ hue: 'yours', words: '1 waits on you' }]);
  assert.equal(cuesOf(UP).length, 0, 'up alone says nothing');
});
