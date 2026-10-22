/**
 * A step's conversation is read again on the api in one place and for one reason: where no live stream of it can be had — its harness
 * does not push the session, or the upstream failed — the stream's `readAgain` reads it from the cursor every served beat (`Beats.step`,
 * `STEP_BEAT_MS` by default) for as long as a reader is there. Everywhere else it is read once a request: a session the runtime pushes
 * is relayed as it is written, and is never put on a timer.
 *
 * `timers` names what in a source of `src/steps/` reads again on its own — a sleep, `setInterval`, `setTimeout`, an Effect `Schedule` —
 * and `loopsAround` counts the loops whose body calls a function. These tests hold the folder to the one beat and no other, and refuse a
 * second one.
 */
import '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { Beats } from '../layer.ts';
import { STEP_BEAT_MS } from './steps.ts';

const TIMERS: readonly [RegExp, string][] = [
  [/\.sleep\s*\(/, 'a sleep'],
  [/\bsetInterval\s*\(/, 'setInterval'],
  [/\bsetTimeout\s*\(/, 'setTimeout'],
  [/\bSchedule\s*\./, 'an Effect Schedule'],
];

/** The index past the bracket that closes the one opened at `from` (`open`, then `close`), or the text's end. */
const closing = (text: string, from: number, open: string, close: string): number => {
  let depth = 0;
  for (let i = from; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close && --depth === 0) return i + 1;
  }
  return text.length;
};

/** The body of each `while` and `for` loop in `text`: its block, or its one statement. */
const loopBodies = (text: string): string[] =>
  [...text.matchAll(/\b(?:while|for)\s*\(/g)].map((m) => {
    const head = closing(text, m.index + m[0].length - 1, '(', ')');
    const start = text.slice(head).search(/\S/) + head;
    return text[start] === '{' ? text.slice(start, closing(text, start, '{', '}')) : text.slice(start, text.indexOf(';', start) + 1);
  });

/** What in the source `text` reads again on its own: each timer it starts, named. */
const timers = (text: string): string[] => TIMERS.filter(([pattern]) => pattern.test(text)).map(([, what]) => what);

/** What each sleep of `text` is given to wait. */
const sleepsOf = (text: string): string[] => [...text.matchAll(/\.sleep\s*\(([^)]*)\)/g)].map((m) => m[1]);

/** How many loops of `text` call `name` in their body. */
const loopsAround = (text: string, name: string): number =>
  loopBodies(text).filter((body) => new RegExp(`\\b${name}\\s*\\(`).test(body)).length;

/** The body of the function `name` declared in `text`: from its head to the bracket that closes it. */
const bodyOf = (text: string, name: string): string => {
  const at = text.indexOf(`function ${name}(`);
  assert.notEqual(at, -1, `${name}: the function this guard is about`);
  const block = text.indexOf('{', closing(text, text.indexOf('(', at), '(', ')'));
  return text.slice(block, closing(text, block, '{', '}'));
};

const STEPS = import.meta.dirname;
const sources = fs.readdirSync(STEPS).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
const routes = fs.readFileSync(path.join(STEPS, 'steps.ts'), 'utf8');

test("a step's conversation is read again in one place alone: `readAgain`, the beat the stream falls back to", () => {
  assert.match(routes, /async function readTranscript\s*\(/, 'the one read of a conversation this guard is about');
  assert.ok(sources.includes('steps.ts') && sources.length > 1);
  assert.equal(loopsAround(routes, 'readTranscript'), 1, 'one loop around the read, and no second beat beside it');
  assert.equal(loopsAround(bodyOf(routes, 'readAgain'), 'readTranscript'), 1, 'and that loop is the beat');
  for (const file of sources.filter((f) => f !== 'steps.ts')) {
    assert.equal(loopsAround(fs.readFileSync(path.join(STEPS, file), 'utf8'), 'readTranscript'), 0, file);
  }
});

test('the beat is the folder’s one timer, and it waits the served beat, `STEP_BEAT_MS` by default', () => {
  assert.match(routes, /export const STEP_BEAT_MS = /, 'the beat is a constant of its own, the served one by default');
  for (const file of sources) {
    const text = fs.readFileSync(path.join(STEPS, file), 'utf8');
    assert.deepEqual(timers(text), file === 'steps.ts' ? ['a sleep'] : [], `${file}: no timer but the beat's own sleep`);
  }
  assert.deepEqual(
    sleepsOf(routes),
    ['r.beatMs', 'r.beatMs'],
    'each wait of the beat is the one beat, and nothing waits for another reason',
  );
  assert.match(routes, /beatMs:\s*beats\.step \?\? STEP_BEAT_MS\b/, "the beat is the app's served `Beats.step`, `STEP_BEAT_MS` unserved");
  assert.equal(
    Effect.runSync(
      Effect.gen(function* () {
        return (yield* Beats).step;
      }),
    ),
    undefined,
    'served none by default, so the shipped `STEP_BEAT_MS` is the beat',
  );
});

test('REFUSED: a second beat — a loop around `readTranscript` beside the one — and a timer of any kind', () => {
  const twice = `${bodyOf(routes, 'readAgain')}\nwhile (live) read = await readTranscript(e, place, id, step, taskId, read.cursor);`;
  assert.equal(loopsAround(twice, 'readTranscript'), 2, 'a second loop around the read is seen, wherever it is written');
  assert.equal(loopsAround('for (;;) {\n  read = await readTranscript(e, id, step, taskId, read.cursor);\n}', 'readTranscript'), 1);
  assert.equal(
    loopsAround('for (const event of read.events) await stream.writeSSE(event);', 'readTranscript'),
    0,
    'a loop that reads nothing again',
  );
  assert.deepEqual(timers('const t = setInterval(() => readTranscript(e, id, step, taskId), 1_000);'), ['setInterval']);
  assert.deepEqual(timers('setTimeout(again, 1_000);'), ['setTimeout']);
  assert.deepEqual(timers('Effect.repeat(read, Schedule.spaced("1 second"))'), ['an Effect Schedule']);
  assert.deepEqual(timers('await stream.sleep(r.beatMs);'), ['a sleep']);
  assert.notDeepEqual(
    sleepsOf('await stream.sleep(r.beatMs);\nawait stream.sleep(STEP_BEAT_MS);'),
    ['r.beatMs', 'r.beatMs'],
    'a sleep of a length of its own beside the served beat',
  );
});
