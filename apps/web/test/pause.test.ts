/**
 * The pause of all factories on the board (src/lib/pause.ts): they run where no pause stands, Pausing with how many still finish while any
 * does — under a pause with a timeout, how many sessions finish a tool call and when what is left is cut — Paused once none does, each
 * session it parked named by the call it stopped after, each task and each landing held named in a sentence, and a read that failed
 * said; what a pause at once would stop, and a task it asked to stop, each in its words. `npm run e2e` presses the buttons themselves
 * (`480-pause.ts`, `481-pause-now.ts`), and reads a parked step (`482-paused-step.ts`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Paused } from '../src/lib/api.ts';
import { clockWord } from '../src/lib/quota.ts';
import { finishingSentence, interruptSentence, parkedSentence, pauseWords } from '../src/lib/pause.ts';

const NOW = new Date('2026-10-04T16:00:00.000Z');
const AT = '2026-10-04T15:40:00.000Z';
const PAUSE = { at: AT, by: 'ann', why: 'merging by hand' };

/** What `GET /api/pause` answers, with `extra` over a pause and nothing at work. */
const paused = (extra: Partial<Paused> = {}): Paused => ({ pause: PAUSE, finishing: [], parked: [], staged: [], held: [], ...extra });

test('pauseWords: what the pause says, from none to Pausing to Paused', async (t) => {
  await t.test('no pause: all factories run, with no short form, and the button pauses them all', () => {
    const words = pauseWords({ pause: null, finishing: [], parked: [], staged: [], held: [] }, null, NOW);
    assert.equal(words.state, 'running');
    assert.equal(words.text, null);
    assert.equal(words.label, 'Pause all factories');
    assert.equal(words.line, 'Pause all factories: nothing new starts, and what runs finishes.');
  });
  await t.test(
    'a pause with tasks at work is Pausing with their count and the checks it holds, and names each, each landing staged and each check held',
    () => {
      const words = pauseWords(
        paused({
          finishing: [
            { run: 'r-1', step: 'plan', kind: 'session' },
            { run: 'r-2', step: 'ship', kind: 'landing' },
          ],
          staged: [{ run: 'r-3', step: 'ship', repo: '/code/app' }],
          held: [{ run: 'r-4', step: 'land' }],
        }),
        null,
        NOW,
      );
      assert.equal(words.state, 'pausing');
      assert.equal(words.text, 'Pausing · 2');
      assert.equal(
        words.line,
        `Pausing: 2 finishing, 2 checks held — paused since ${clockWord(new Date(AT), NOW)} by ann: merging by hand. Nothing new starts, and what runs finishes.`,
      );
      assert.deepEqual(words.finishing, [
        "r-1's plan is finishing: its session is at work",
        "r-2's ship is finishing: the check of its landing runs",
      ]);
      assert.deepEqual(words.staged, ["r-3's ship has its merge staged in /code/app (MERGE_HEAD), and its check waits on the resume"]);
      assert.deepEqual(words.held, ["r-4's land has signed off, and its check waits on the resume"]);
    },
  );
  await t.test('a pause with nothing at work counts the check it holds, and says none where it holds none', () => {
    const words = pauseWords(paused({ held: [{ run: 'r-4', step: 'land' }] }), null, NOW);
    assert.equal(words.state, 'paused');
    assert.equal(
      words.line,
      `Paused since ${clockWord(new Date(AT), NOW)} by ann: merging by hand. Nothing runs and nothing new starts, 1 check held.`,
    );
    assert.doesNotMatch(pauseWords(paused(), null, NOW).line, /held/);
  });
  await t.test('a pause with nothing at work is Paused, since when, by whom and why, and what the file no longer says is said so', () => {
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
  await t.test('nothing read yet is reading, and a read that failed says why', () => {
    assert.equal(pauseWords(undefined, null, NOW).state, 'reading');
    const failed = pauseWords(undefined, new Error('the api answered 500'), NOW);
    assert.equal(failed.state, 'reading');
    assert.equal(failed.line, 'Whether all factories are paused could not be read: the api answered 500');
  });
});

test('interruptSentence and finishingSentence: what a pause stops and what finishes', async (t) => {
  await t.test("what a pause at once would stop is named by its run, then its step's session or check", () => {
    assert.equal(interruptSentence({ run: 'r-1', step: 'implement', kind: 'session', taskId: 't-1' }), "r-1: implement's session");
    assert.equal(interruptSentence({ run: 'r-2', step: 'review', kind: 'check', taskId: 't-2' }), "r-2: review's check");
  });
  await t.test('a task a pause at once asked to stop is stopping, and tried again on the resume, not finishing', () => {
    assert.equal(
      finishingSentence({ run: 'r-1', step: 'implement', kind: 'session', stopping: true, resumed: true }),
      "r-1's implement is stopping: its session was asked to stop, and is tried again on the resume",
    );
    assert.equal(
      finishingSentence({ run: 'r-2', step: 'review', kind: 'check', stopping: true, resumed: true }),
      "r-2's review is stopping: its check was asked to stop, and is tried again on the resume",
    );
    assert.equal(finishingSentence({ run: 'r-2', step: 'review', kind: 'check' }), "r-2's review is finishing: its check runs");
  });
  await t.test('a task asked to stop that no pause ask names is stopping, and promised no try on the resume', () => {
    assert.equal(
      finishingSentence({ run: 'r-1', step: 'implement', kind: 'session', stopping: true }),
      "r-1's implement is stopping: its session was asked to stop",
    );
  });
  await t.test('a session in a tool call is finishing its call, named by its tool', () => {
    const finishing = { run: 'r1', step: 'implement', kind: 'session' as const, calling: 'Bash' };
    assert.equal(finishingSentence(finishing), "r1's implement is finishing: its call to Bash runs");
    assert.equal(finishingSentence({ ...finishing, calling: undefined }), "r1's implement is finishing: its session is at work");
  });
});

test('pauseWords under a pause with a timeout: sessions finishing a call and when they are cut, then each parked, then Paused', async (t) => {
  const timed = { ...PAUSE, timeoutMs: 600_000 };
  const parked = [
    { run: 'r-5', step: 'plan', after: 'Bash' },
    { run: 'r-6', step: 'review', cut: 'Edit' },
    { run: 'r-7', step: 'design' },
  ];
  await t.test('while sessions finish a call, the count line says how many and in how many minutes what is left is cut', () => {
    const words = pauseWords(
      paused({
        pause: timed,
        finishing: [
          { run: 'r-1', step: 'plan', kind: 'session', calling: 'Bash' },
          { run: 'r-2', step: 'implement', kind: 'session' },
          { run: 'r-3', step: 'ship', kind: 'landing' },
        ],
        parked,
        held: [{ run: 'r-4', step: 'land' }],
      }),
      null,
      NOW,
    );
    assert.equal(words.state, 'pausing');
    assert.equal(words.text, 'Pausing · 3');
    assert.equal(
      words.line,
      `Pausing: 2 sessions finishing a tool call, cut in 1 min, 1 check held — paused since ${clockWord(new Date(AT), NOW)} by ann: merging by hand. Nothing new starts, and what runs finishes.`,
    );
    assert.deepEqual(words.parked, parked.map(parkedSentence));
  });
  await t.test('the minutes left are rounded up, never below one, and one session is said so', () => {
    const at = new Date(Date.parse(AT) + 60_500);
    const one = paused({ pause: { ...timed, at: at.toISOString() }, finishing: [{ run: 'r-1', step: 'plan', kind: 'session' }] });
    assert.match(pauseWords(one, null, NOW).line, /^Pausing: 1 session finishing a tool call, cut in 1 min — /);
    const early = paused({ pause: { ...timed, at: NOW.toISOString() }, finishing: [{ run: 'r-1', step: 'plan', kind: 'session' }] });
    assert.match(pauseWords(early, null, new Date(NOW.getTime() + 60_001)).line, /cut in 9 min — /);
  });
  await t.test('with only checks finishing, or no timeout, it counts what finishes as before', () => {
    const checks = paused({ pause: timed, finishing: [{ run: 'r-3', step: 'ship', kind: 'landing' }] });
    assert.match(pauseWords(checks, null, NOW).line, /^Pausing: 1 finishing — /);
    const untimed = paused({ finishing: [{ run: 'r-1', step: 'plan', kind: 'session' }] });
    assert.match(pauseWords(untimed, null, NOW).line, /^Pausing: 1 finishing — /);
  });
  await t.test('once nothing finishes it is Paused, each parked session still named', () => {
    const words = pauseWords(paused({ pause: timed, parked }), null, NOW);
    assert.equal(words.state, 'paused');
    assert.equal(words.text, 'Paused');
    assert.match(words.line, /^Paused since /);
    assert.equal(words.parked.length, 3);
  });
  await t.test('a parked session is named by the call it stopped after, the call cut, or neither', () => {
    assert.deepEqual(parked.map(parkedSentence), [
      "r-5's plan is paused after its call to Bash",
      "r-6's review is paused, its call to Edit cut",
      "r-7's design is paused",
    ]);
  });
});
