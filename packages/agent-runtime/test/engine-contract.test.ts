/**
 * The stand-in's side of the engine's contract: every walk of `WALKS` (`engine-walks.ts`) asked of a new `testEngine`, which must say
 * what the real engine says (`engine-contract.boundary.test.ts` runs the same walks on it). Then that the contract bites: a stand-in
 * that lies about one verb fails a walk of that verb, for every kept verb; a verb with no walk is named; each verb it does not keep
 * dies naming itself; each difference `APART` declares is what it answers; and two stand-ins share nothing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cause, Effect, Exit } from 'effect';
import { testEngine } from '../src/testing.ts';
import { builtEngine } from './engine.ts';
import { APART, apartOn, failing, UNKEPT, unwalked, WALKS, walksOn, type Kept, type Side } from './engine-walks.ts';

/** A new stand-in as a side: its verbs, and its own `settle`. */
function standIn(): Side {
  const made = testEngine();
  return { engine: builtEngine(made.layer), settle: async (id, moved, end) => void made.settle(id, moved, end) };
}

for (const [name, walk] of walksOn(standIn)) test(name, walk);

/** A verb's answer, whatever its verb. */
type Answer = Effect.Effect<unknown, unknown>;

/** For each kept verb, an answer the real engine would not give, made of the true one. */
const LIES: { readonly [V in Kept]: (answer: Answer) => Answer } = {
  file: Effect.map((id) => `${String(id)}.elsewhere`),
  view: Effect.map((view) => ({ ...(view as object), phase: 'elsewhere' })),
  stop: Effect.catch(() => Effect.void),
  logs: Effect.map(() => 'elsewhere'),
  feed: Effect.map((feed) => ({ ...(feed as object), cursor: 1 })),
  output: Effect.catch(() => Effect.succeed('elsewhere')),
  list: Effect.map((list) => ({ ...(list as object), unreadable: [{ taskId: 'elsewhere', why: 'elsewhere' }] })),
  say: Effect.map((said) => ({ ...(said as object), attempt: 2 })),
  interrupt: Effect.catch(() => Effect.succeed({ at: '2026-01-01T00:00:00.000Z', attempt: 1 })),
  answerAsk: Effect.catch(() => Effect.succeed({ at: '2026-01-01T00:00:00.000Z', attempt: 1 })),
  transcript: Effect.catch(() => Effect.succeed({ events: [], cursor: 'elsewhere' })),
  forget: Effect.map((report) => ({ ...(report as object), forgotten: !(report as { forgotten: boolean }).forgotten })),
  kept: Effect.match({ onFailure: () => ({ tasks: [] }), onSuccess: () => ({ tasks: [{ taskId: 'elsewhere' }] }) }),
  hold: Effect.map(() => 'elsewhere'),
  drain: Effect.catch(() => Effect.void),
  mcpState: Effect.catch(() => Effect.succeed({ read: true, servers: [] })),
  io: Effect.map((io) => ({ ...(io as object), reads: 0 })),
};

/** A new stand-in whose `verb` does what it does and answers `lie` of its true answer. */
function lying(verb: Kept, lie: (answer: Answer) => Answer): Side {
  const side = standIn();
  const truly = side.engine[verb] as (...args: unknown[]) => Answer;
  return { ...side, engine: { ...side.engine, [verb]: (...args: unknown[]) => lie(truly(...args)) } };
}

for (const verb of Object.keys(WALKS) as Kept[])
  test(`REFUSED: a stand-in that lies about ${verb} fails a walk of ${verb}, which the true one passes`, async () => {
    assert.deepEqual(await failing(verb, standIn), [], 'the stand-in says every walk');
    const failed = await failing(verb, () => lying(verb, LIES[verb]));
    assert.ok(failed.length > 0, `no walk of ${verb} caught the lie`);
    assert.deepEqual(
      await failing(verb, () => lying(verb, (answer) => answer)),
      [],
      'and a wrapped one that tells the truth passes them all',
    );
  });

test('REFUSED: a verb with no walk — one added to the engine, and one whose walks were taken away — is named', () => {
  const verbs = Object.keys(standIn().engine);
  assert.deepEqual([...verbs].sort(), [...Object.keys(WALKS), ...UNKEPT].sort(), 'every verb is kept or unkept, and none twice');
  assert.deepEqual(unwalked(verbs), [], 'every verb of the engine is walked or named unkept');
  assert.deepEqual(unwalked([...verbs, 'mirror']), ['mirror']);
  assert.deepEqual(unwalked(verbs, { ...WALKS, stop: [] }), ['stop']);
  assert.deepEqual(
    unwalked(
      verbs,
      WALKS,
      UNKEPT.filter((verb) => verb !== 'tick'),
    ),
    ['tick'],
  );
});

for (const verb of UNKEPT)
  test(`a verb the stand-in does not keep dies naming itself and its file: ${verb}`, async () => {
    const unkept = standIn().engine[verb] as () => Answer;
    const exit = await Effect.runPromiseExit(unkept());
    assert.ok(Exit.isFailure(exit) && Cause.hasDies(exit.cause), `${verb} did not die`);
    assert.equal(
      (Cause.squash(exit.cause) as Error).message,
      `the test engine keeps no \`${verb}\`: add it to src/service/test-engine.ts, with its walk in test/engine-walks.ts`,
    );
  });

for (const apart of APART)
  test(`APART, ${apart.name}: the stand-in answers as declared`, async () => {
    assert.deepStrictEqual(await apartOn(apart, standIn()), apart.standIn);
  });

test('two stand-ins share no task, no filing and no word said', async () => {
  const [one, two] = [testEngine(), testEngine()];
  const engine = builtEngine(one.layer);
  await Effect.runPromise(engine.file({ id: 'a', brief: 'do a', cwd: '/r' }));
  one.settle('a', 'running (working)');
  await Effect.runPromise(engine.say('a', 'hello'));
  await Effect.runPromise(engine.stop('a'));
  assert.deepEqual([one.tasks.size, one.filings, one.specs.length, one.said.length, one.stopped], [1, ['a'], 1, 1, ['a']]);
  assert.deepEqual([two.tasks.size, two.filings, two.specs, two.said, two.stopped, two.forgets], [0, [], [], [], [], []]);
  one.refuseSay(1);
  const other = builtEngine(two.layer);
  await Effect.runPromise(other.file({ id: 'a', brief: 'another', cwd: '/r' }));
  two.settle('a', 'running (working)');
  assert.equal((await Effect.runPromise(other.say('a', 'hi'))).text, 'hi', 'a say refused on one is not refused on the other');
  assert.equal(one.tasks.get('a')?.spec.brief, 'do a');
});

test('REFUSED: settling a task never filed, by a sentence naming the fix', () => {
  assert.throws(
    () => testEngine().settle('nope', 'succeeded'),
    (err: Error) => err.message === 'the test engine holds no task nope: file it before settling it',
  );
});

test('a transcript planted for each attempt reads by its cursor, a restart starts the next attempt, and a word follows its last event', async () => {
  const made = testEngine();
  const engine = builtEngine(made.layer);
  await Effect.runPromise(engine.file({ id: 'a', brief: 'do a', cwd: '/r' }));
  made.settle('a', 'running (working)');
  const event = (id: string) => ({ id, at: '2026-10-15T00:00:00.000Z', role: 'assistant' as const, kind: 'text' as const, text: id });
  made.plantTranscript('a', 1, [event('one'), event('two')]);
  made.restart('a');
  made.plantTranscript('a', 2, [event('three')]);
  const first = await Effect.runPromise(engine.transcript('a', undefined, { attempt: 1 }));
  const rest = await Effect.runPromise(
    engine.transcript('a', undefined, { attempt: 1 }).pipe(Effect.andThen((t) => engine.transcript('a', t.cursor, { attempt: 1 }))),
  );
  const latest = await Effect.runPromise(engine.transcript('a'));
  const said = await Effect.runPromise(engine.say('a', 'hi'));
  const view = await Effect.runPromise(engine.view('a'));
  assert.deepEqual(
    [
      first.events.map((e) => e.id),
      rest.events,
      latest.events.map((e) => e.id),
      said.attempt,
      said.after,
      view.state.attempts.map((a) => [a.n, a.ended]),
    ],
    [
      ['one', 'two'],
      [],
      ['three'],
      2,
      { kind: 'text', id: 'three' },
      [
        [1, 'failed'],
        [2, null],
      ],
    ],
  );
});
