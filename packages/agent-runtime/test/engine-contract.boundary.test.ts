/**
 * The real engine's side of the engine's contract: every walk of `WALKS` (`engine-walks.ts`) asked of `Engine.layer` over a journal in
 * a scratch folder and a harness that costs nothing, its sessions a map this file moves and its streams the text a walk's settle was
 * given, with no process. What it says is what the stand-in must say (`engine-contract.test.ts` runs the same walks on `testEngine`).
 * Then that the lists are whole: every verb of the engine is walked or named unkept, each unkept verb is one the engine has, and each
 * difference `APART` declares is one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import { Engine, testOps, type RunnerOps, type Sighting } from '../src/index.ts';
import { noTranscript } from '../src/harness/transcript.ts';
import { builtEngine } from './engine.ts';
import { APART, apartOn, UNKEPT, unwalked, walksOn, type End, type Moved, type Side } from './engine-walks.ts';
import { scratch } from './scratch.ts';

/** The session of a task's first attempt, as the engine names it. */
const sessionOf = (id: string): string => `ae/${id}/1`;

/** A stream's text as a harness keeps it: whole, or its last `lastBytes` bytes, and `undefined` for none. */
const tailOf = (text: string | undefined, lastBytes?: number): string | undefined =>
  text === undefined || lastBytes === undefined ? text : Buffer.from(text).subarray(-lastBytes).toString();

/**
 * A real engine over a store of its own and one harness, `test`, whose sessions `settle` moves: at work after the pass that starts it,
 * ended as asked and read by the pass after, and stopped by the two passes that stop a session and record its end.
 */
function realSide(): Side {
  const sessions = new Map<string, Sighting>();
  const printed = new Map<string, NonNullable<End['printed']>>();
  const harness: RunnerOps = {
    ...testOps({ sessions }),
    say: () => Effect.void,
    transcript: () => Effect.succeed(noTranscript()),
    output: (name, stream, lastBytes) => Effect.succeed(tailOf(printed.get(name)?.[stream], lastBytes)),
  };
  const engine = builtEngine(Engine.layer({ root: scratch('ae-engine-walks-'), harnesses: { test: harness }, defaultHarness: 'test' }));
  const pass = () => Effect.runPromise(engine.tick());
  const settle = async (id: string, moved: Moved, end: End = {}): Promise<void> => {
    if (moved === 'stopped') {
      await pass();
      await pass();
      return;
    }
    if (!sessions.has(sessionOf(id))) await pass();
    if (end.printed) printed.set(sessionOf(id), end.printed);
    if (moved === 'working') return;
    sessions.set(sessionOf(id), {
      ...sessions.get(sessionOf(id))!,
      state: moved === 'succeeded' ? 'completed' : 'failed',
      ...(end.exitCode === undefined ? {} : { exitCode: end.exitCode }),
      ...(end.closeout === undefined ? {} : { closeout: { payload: end.closeout } }),
    });
    await pass();
  };
  return { engine, settle };
}

for (const [name, walk] of walksOn(realSide)) test(name, walk);

test('every verb of the engine is walked or named unkept, and each unkept verb is one the engine has', () => {
  const { engine } = realSide();
  const verbs = Object.keys(engine);
  assert.ok(verbs.includes('file') && verbs.length > 20, `the engine was read: ${verbs.join(', ')}`);
  assert.deepEqual(unwalked(verbs), []);
  for (const verb of UNKEPT) assert.equal(typeof engine[verb], 'function', `${verb} is named unkept and is no verb of the engine`);
});

for (const apart of APART)
  test(`APART, ${apart.name}: the real engine answers otherwise than the stand-in`, async () => {
    assert.notDeepStrictEqual(await apartOn(apart, realSide()), apart.standIn, `${apart.name} is no longer apart: take it off APART`);
  });
