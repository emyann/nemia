/**
 * The readiness routes: the read lists its pieces, the test place's need among them; a fix of that need, its answers given, is filed on
 * the engine, read back as it settles, and its output followed as server-sent events, `output` then `ended`; an unknown fix is a 404, on
 * its read and on its stream; a fix a person types is refused as objects' `Invalid` and a removal a run still needs as its `Conflict`,
 * nothing filed. Statuses, phases and event names are asserted, never a sentence.
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
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { PlaceService, runningRelease, startRun, TokenDoor, tokenDoorFiles } from 'agent-orchestrator';
import { Conflict, Invalid, type Fix, type Need, type Readiness } from 'objects';
import { Schema } from 'effect';
import { appOver, eachTest, engineFor, runOver } from '../../test/placed.ts';
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
    { command: 'echo unset', message: 'take it away', kind: 'removes' },
    { command: 'set-it-by-hand', message: 'set it on the server', kind: 'typed' },
  ],
};

/** The machine's facts as this test hands them: no command runs, no file is there, no sign-in is known. */
const facts = Layer.succeed(Facts, (env: NodeJS.ProcessEnv) => ({
  env,
  user: 'tester',
  exists: () => false,
  run: () => undefined,
  running: runningRelease(),
}));

const stand = eachTest(testPlace);
const engine = eachTest(testEngine);
/** The app over the stand-ins, its place declaring `IDENTITY`. */
/** The test place, declaring `IDENTITY`. */
const placed = () => PlaceService.layer({ ...stand().place, declared: { ...stand().place.declared, needs: [IDENTITY] } });
const app = eachTest(() => appOver(engine(), stand(), placed(), facts));

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
  assert.equal(((await res.json()) as { reason?: string }).reason, 'person-only');
  assert.equal(Effect.runSync(engineFor(engine()).list()).views.length, before, 'no fix filed');
});

/** The status objects' error class `kind` answers with. */
const statusOf = (kind: typeof Invalid | typeof Conflict): unknown => Schema.resolveAnnotations(kind)?.httpApiStatus;

test("REFUSED: a fix a person types is objects' Invalid, and a removal a run still needs its Conflict, nothing filed", async () => {
  const typed = await send('POST', '/api/readiness/fixes', { need: 'identity', index: 2 });
  assert.equal(typed.status, statusOf(Invalid), await typed.clone().text());
  const repo = scratch('nemia-api-readiness-repo-');
  stand().world.repository(repo, { 'README.md': 'readme\n' });
  const workflowDir = scratch('nemia-api-readiness-workflow-');
  fs.writeFileSync(path.join(workflowDir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  const run = await runOver(placed)(engineFor(engine()), startRun({ brief: 'Build it.', repo, workflowDir }));
  const held = await send('POST', '/api/readiness/fixes', { need: 'identity', index: 1 });
  assert.equal(held.status, statusOf(Conflict), await held.clone().text());
  assert.deepEqual(((await held.json()) as { users?: string[] }).users, [run.id]);
  assert.deepEqual(engine().filings, [], 'no fix filed');
});
