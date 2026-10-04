/**
 * The store's pause on the board (src/lib/pause.ts): the store runs where no pause stands, Pausing with how many still finish while any
 * does, Paused once none does, each task and each landing held named in a sentence, and a read that failed said. `npm run e2e` presses
 * the button itself (`480-pause.ts`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Paused } from '../src/lib/api.ts';
import { clockWord } from '../src/lib/quota.ts';
import { pauseWords } from '../src/lib/pause.ts';

const NOW = new Date('2026-10-04T16:00:00.000Z');
const AT = '2026-10-04T15:40:00.000Z';
const PAUSE = { at: AT, by: 'ann', why: 'merging by hand' };

/** What `GET /api/pause` answers, with `extra` over a pause and nothing at work. */
const paused = (extra: Partial<Paused> = {}): Paused => ({ pause: PAUSE, finishing: [], staged: [], ...extra });

test('no pause: the store runs, with no short form, and the button pauses it', () => {
  const words = pauseWords({ pause: null, finishing: [], staged: [] }, null, NOW);
  assert.equal(words.state, 'running');
  assert.equal(words.text, null);
  assert.equal(words.label, 'Pause the store');
});

test('a pause with tasks at work is Pausing with their count, and names each, and each landing held', () => {
  const words = pauseWords(
    paused({
      finishing: [
        { run: 'r-1', step: 'plan', kind: 'session' },
        { run: 'r-2', step: 'ship', kind: 'landing' },
      ],
      staged: [{ run: 'r-3', step: 'ship', repo: '/code/app' }],
    }),
    null,
    NOW,
  );
  assert.equal(words.state, 'pausing');
  assert.equal(words.text, 'Pausing · 2');
  assert.equal(
    words.line,
    `Pausing: 2 finishing — paused since ${clockWord(new Date(AT), NOW)} by ann: merging by hand. Nothing new starts, and what runs finishes.`,
  );
  assert.deepEqual(words.finishing, [
    "r-1's plan is finishing: its session is at work",
    "r-2's ship is finishing: the check of its landing runs",
  ]);
  assert.deepEqual(words.staged, ["r-3's ship has its merge staged in /code/app (MERGE_HEAD), and its check waits on the resume"]);
});

test('a pause with nothing at work is Paused, since when, by whom and why, and what the file no longer says is said so', () => {
  const words = pauseWords(paused(), null, NOW);
  assert.equal(words.state, 'paused');
  assert.equal(words.text, 'Paused');
  assert.equal(words.line, `Paused since ${clockWord(new Date(AT), NOW)} by ann: merging by hand. Nothing runs and nothing new starts.`);
  const blank = pauseWords(paused({ pause: { at: '', by: '' } }), null, NOW);
  assert.equal(
    blank.line,
    'Paused since a time its file no longer says by someone its file no longer names. Nothing runs and nothing new starts.',
  );
});

test('nothing read yet is reading, and a read that failed says why', () => {
  assert.equal(pauseWords(undefined, null, NOW).state, 'reading');
  const failed = pauseWords(undefined, new Error('the api answered 500'), NOW);
  assert.equal(failed.state, 'reading');
  assert.equal(failed.line, 'Whether the store is paused could not be read: the api answered 500');
});
