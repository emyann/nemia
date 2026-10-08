/**
 * A step's conversation is read once a request on the api, never again on a timer: a session is pushed by the runtime as it is
 * written, or the stream says it is not and ends. `rereads` names what in a source of `src/steps/` reads again — a timer (a sleep,
 * `setInterval`, `setTimeout`, an Effect `Schedule`), or a loop whose body calls `readTranscript` — and these tests hold the folder's
 * sources to none, and refuse the stream's old beat as it was written.
 */
import '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

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

/** What in the source `text` reads a step's conversation again: each timer it starts, and each loop around `readTranscript`. */
const rereads = (text: string): string[] => [
  ...TIMERS.filter(([pattern]) => pattern.test(text)).map(([, what]) => what),
  ...loopBodies(text)
    .filter((body) => /\breadTranscript\s*\(/.test(body))
    .map(() => 'a loop around readTranscript'),
];

const STEPS = import.meta.dirname;
const sources = fs.readdirSync(STEPS).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

test("the api's step routes read a step's conversation once a request: no timer, and no loop around `readTranscript`", () => {
  const routes = fs.readFileSync(path.join(STEPS, 'steps.ts'), 'utf8');
  assert.match(routes, /async function readTranscript\s*\(/, 'the one read of a conversation this guard is about');
  assert.ok(sources.includes('steps.ts') && sources.length > 1);
  for (const file of sources) assert.deepEqual(rereads(fs.readFileSync(path.join(STEPS, file), 'utf8')), [], file);
});

test('REFUSED: the old beat, a loop that sleeps and reads the conversation again, by its sleep and its loop', () => {
  const beat = `async function beat(stream, e, id, step, taskId, from) {
  let read = from;
  await send(stream, read);
  while (read.live) {
    await stream.sleep(STREAM_EVERY_MS);
    if (stream.aborted) return;
    try {
      read = await readTranscript(e, id, step, taskId, read.cursor);
    } catch (err) {
      continue;
    }
    await send(stream, read);
  }
}`;
  assert.deepEqual(rereads(beat), ['a sleep', 'a loop around readTranscript']);
});

test('REFUSED: a loop around `readTranscript` with no timer, a timer of any kind, and a loop of one statement', () => {
  assert.deepEqual(rereads('for (;;) {\n  read = await readTranscript(e, id, step, taskId, read.cursor);\n}'), [
    'a loop around readTranscript',
  ]);
  assert.deepEqual(rereads('while (live) read = await readTranscript(e, id, step, taskId, read.cursor);'), [
    'a loop around readTranscript',
  ]);
  assert.deepEqual(rereads('const t = setInterval(() => readTranscript(e, id, step, taskId), 1_000);'), ['setInterval']);
  assert.deepEqual(rereads('setTimeout(again, 1_000);'), ['setTimeout']);
  assert.deepEqual(rereads('Effect.repeat(read, Schedule.spaced("1 second"))'), ['an Effect Schedule']);
  assert.deepEqual(rereads('for (const event of read.events) await stream.writeSSE(event);'), [], 'a loop that reads nothing again');
});
