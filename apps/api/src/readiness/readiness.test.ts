/**
 * The readiness routes: the read lists its pieces, the test place's need among them; a fix of that need, its answers given, is filed on
 * the engine, read back as it settles, and its output followed as server-sent events, `output` then `ended`; an unknown fix is a 404, on
 * its read and on its stream. Statuses, phases and event names are asserted, never a sentence.
 *
 * On the stand-ins: the runtime's test engine, which runs no command — the fix's task is settled by the test with what it printed — and
 * the test place, declaring one need here; the machine's facts the read asks are the test's own (`Facts`), so it runs no command.
 */
import '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect, Layer } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import { PlaceService, runningRelease, TokenDoor, tokenDoorFiles } from 'agent-orchestrator';
import type { Fix, Need, Readiness } from 'objects';
import { appOver, eachTest, engineFor } from '../../test/placed.ts';
import { root } from '../../test/harness.ts';
import { Facts } from './readiness.ts';

/** The need the test place declares here: an identity, asked of the person, whose fix prints it. */
const IDENTITY: Need = {
  name: 'identity',
  message: 'an identity is set',
  check: 'exit 1',
  fixes: [
    {
      command: 'echo "$NEMIA_ANSWER_NAME <$NEMIA_ANSWER_EMAIL>"',
      message: 'set it',
      asks: [
        { name: 'name', message: 'your name' },
        { name: 'email', message: 'your email' },
      ],
    },
  ],
};

/** The machine's facts as this test hands them: no command runs, no file is there, no sign-in is known. */
const facts = Layer.succeed(Facts, (env: NodeJS.ProcessEnv) => ({
  env,
  user: 'tester',
  exists: () => false,
  run: () => undefined,
  signIn: () => ({ state: 'unknown' as const }),
  ownSignIn: () => 'unknown' as const,
  running: runningRelease(),
}));

const stand = eachTest(testPlace);
const engine = eachTest(testEngine);
/** The app over the stand-ins, its place declaring `IDENTITY`. */
const app = eachTest(() =>
  appOver(engine(), stand(), PlaceService.layer({ ...stand().place, declared: { ...stand().place.declared, needs: [IDENTITY] } }), facts),
);

/** A request of `method` to `url`, as a client sends one: JSON, from the board's own page. */
const send = (method: 'GET' | 'POST', url: string, body?: unknown, bearer?: string) =>
  app().request(url, {
    method,
    headers: {
      'content-type': 'application/json',
      'sec-fetch-site': 'same-origin',
      ...(bearer === undefined ? {} : { authorization: `Bearer ${bearer}` }),
    },
    ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
  });

/** The event names of a server-sent stream's text, in order. */
const eventsOf = (text: string): string[] => [...text.matchAll(/^event: ?(.*)$/gm)].map((m) => m[1] ?? '');

test("GET /api/readiness lists its pieces, the place's need among them, missing", async () => {
  const res = await send('GET', '/api/readiness');
  assert.equal(res.status, 200, await res.clone().text());
  const read = (await res.json()) as Readiness;
  assert.ok(read.pieces.length > 1, 'more pieces than the need');
  const identity = read.pieces.find((p) => p.name === 'identity');
  assert.equal(identity?.state, 'missing');
  assert.equal(read.ready, false);
});

test("a place need's fix: filed with its answers, read back as it settles, and its output followed to its end", async () => {
  const started = await send('POST', '/api/readiness/fixes', { need: 'identity', answers: { name: 'Lin', email: 'lin@example.com' } });
  assert.equal(started.status, 200, await started.clone().text());
  const fix = (await started.json()) as Fix;
  assert.equal(fix.phase, 'pending');
  assert.equal(engine().tasks.get(fix.id)?.spec.harness, 'command', 'filed on the engine as a command task');

  engine().settle(fix.id, 'succeeded', { exitCode: 0, printed: { stdout: 'Lin <lin@example.com>\n' } });
  const read = (await (await send('GET', `/api/readiness/fixes/${fix.id}`)).json()) as Fix;
  assert.equal(read.phase, 'succeeded');
  assert.equal(read.output, 'Lin <lin@example.com>\n');

  const stream = await send('GET', `/api/readiness/fixes/${fix.id}/output`);
  assert.equal(stream.status, 200);
  assert.match(stream.headers.get('content-type') ?? '', /text\/event-stream/);
  const text = await stream.text();
  assert.deepEqual(eventsOf(text), ['output', 'ended']);
  assert.match(text, /Lin <lin@example\.com>/, "the command's line is carried");
});

test('REFUSED: a fix of no such need is a 404, an answer left out a 422, and an unknown fix a 404 on its read and its stream', async () => {
  assert.equal((await send('POST', '/api/readiness/fixes', { need: 'nothing' })).status, 404);
  assert.equal((await send('POST', '/api/readiness/fixes', { need: 'identity', answers: { name: 'Lin' } })).status, 422);
  assert.equal((await send('GET', '/api/readiness/fixes/no-such-fix')).status, 404);
  assert.equal((await send('GET', '/api/readiness/fixes/no-such-fix/output')).status, 404);
});

test("a session's token starts no fix: 403, and nothing is filed", async () => {
  const task = 't-readiness-session';
  const token = Effect.runSync(
    Effect.gen(function* () {
      return yield* (yield* TokenDoor).tokens.mint({ agent: 'nemia', factory: null, run: null, step: null, attempt: 1, task });
    }).pipe(Effect.provide(tokenDoorFiles(root))),
  );
  Effect.runSync(engineFor(engine()).file({ id: task, brief: 'Be on.', cwd: root, harness: 'claude' }));
  engine().settle(task, 'working');
  const before = Effect.runSync(engineFor(engine()).list()).views.length;
  assert.ok(before > 0, 'the session task is listed, so the count is read');
  const res = await send('POST', '/api/readiness/fixes', { need: 'identity', answers: { name: 'x', email: 'y@example.com' } }, token);
  assert.equal(res.status, 403);
  assert.equal(Effect.runSync(engineFor(engine()).list()).views.length, before, 'no fix filed');
});
