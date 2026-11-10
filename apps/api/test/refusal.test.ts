/**
 * The api's one map from a refusal to what it answers (`refusedAs`, src/objects/refused.ts): a refusal of the orchestrator's by its tag
 * as `objects`' class of the same name, at that class's own status (`httpApiStatus`) — `Missing` 404, `Conflict` 409, `Invalid` 422,
 * `Forbidden` 403 — and the api's own refusal of a session token, `Unauthorized` 401, each with its reason, in its own words; anything else
 * a 500. Hono's routes answer with it (`answerError`, app.ts), a router mounted as app.ts mounts its routers throwing to it, and so do the
 * `Api`'s handlers; a status the api's own readers refuse with is the class of that status (`declaredAs`), none folded into another.
 */
import './harness.ts';
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { Schema } from 'effect';
import * as objects from 'objects';
import { answerError, app } from '../src/app.ts';
import { Conflict, Forbidden, Invalid, Missing } from 'agent-orchestrator';
import { Unauthorized } from '../src/caller/caller.ts';
import { declaredAs } from '../src/objects/refused.ts';
import { WorkflowError } from 'agent-orchestrator/workflow';

/** The status `objects`' class `tag` declares (`httpApiStatus`). */
const declared = (tag: 'Missing' | 'Conflict' | 'Invalid' | 'Forbidden' | 'Unauthorized'): unknown =>
  Schema.resolveAnnotations(objects[tag])?.httpApiStatus;

/** A router that throws `thrown`, mounted on an app that answers with `answerError`, as app.ts mounts its routers and answers. */
const answered = async (thrown: unknown): Promise<{ status: number; body: unknown }> => {
  const router = new Hono().get('/thrown', () => {
    throw thrown;
  });
  const res = await new Hono().route('/', router).onError(answerError).request('/thrown');
  return { status: res.status, body: await res.json() };
};

/** A run of `answered` with stderr held: what an error that is no refusal says there, and nothing of it on the test's output. */
const quietly = async <T>(t: TestContext, run: () => Promise<T>) => {
  const said = t.mock.method(console, 'error', () => {});
  return { answer: await run(), said: said.mock.calls.length };
};

test('REFUSED: each kind thrown in a mounted router is answered its status, in its words alone', async () => {
  const cases: Array<[unknown, number, string]> = [
    [new Missing({ message: "no such run: r-nope  (try 'nemia ls')" }), 404, "no such run: r-nope  (try 'nemia ls')"],
    [new Conflict({ message: 'the step is still running.' }), 409, 'the step is still running.'],
    [new Invalid({ message: 'WF_MAX_RUNS=two is not a count.' }), 422, 'WF_MAX_RUNS=two is not a count.'],
    [new WorkflowError('dev/implement.md: `gate` is set twice.'), 422, 'dev/implement.md: `gate` is set twice.'],
  ];
  for (const [thrown, status, error] of cases) {
    assert.deepEqual(await answered(thrown), { status, body: { error } }, error);
  }
});

test('answerError: what each thrown thing is answered with, a refusal by its kind and anything else a 500', async (t) => {
  await t.test("every kind of refusal is answered at the status objects' class of its name declares, and no other", async () => {
    const kinds = [
      new Missing({ message: 'm' }),
      new Conflict({ message: 'c' }),
      new Invalid({ message: 'i' }),
      new Forbidden({ message: 'f', reason: 'person-only' }),
      new Unauthorized({ message: 'u', reason: 'unknown-token' }),
    ];
    for (const thrown of kinds) assert.equal((await answered(thrown)).status, declared(thrown._tag), thrown._tag);
    assert.deepEqual(
      kinds.map((k) => declared(k._tag)),
      [404, 409, 422, 403, 401],
    );
  });
  await t.test("a status the api's own readers refuse with is the class of that status: a 400 stays 400 and a 403 stays 403", () => {
    const kinds = [objects.BadRequest, objects.Forbidden, objects.Missing, objects.Conflict, objects.Invalid, objects.UnsupportedMediaType];
    for (const status of [400, 403, 404, 409, 415, 422]) {
      const refused = declaredAs(kinds, { status, error: 'e' });
      assert.equal(Schema.resolveAnnotations(refused.constructor as typeof objects.Missing)?.httpApiStatus, status, String(status));
    }
    assert.throws(
      () => declaredAs([objects.Missing], { status: 403, error: 'e' }),
      'a status its endpoint declares no class of is a fault',
    );
  });
  await t.test('a caller refused is answered by its kind, its reason beside its words: Forbidden 403, Unauthorized 401', async () => {
    const forbidden = await answered(new Forbidden({ message: 'f', reason: 'person-only' }));
    assert.equal(forbidden.status, 403);
    assert.equal((forbidden.body as { reason?: string }).reason, 'person-only');
    const unauthorized = await answered(new Unauthorized({ message: 'u', reason: 'session-ended' }));
    assert.equal(unauthorized.status, 401);
    assert.equal((unauthorized.body as { reason?: string }).reason, 'session-ended');
  });
  await t.test('a Conflict that names the steps holding what is asked of is answered 409 with them, as `users`', async () => {
    const thrown = new Conflict({ message: 'agents/reviewer.md is named by a step beside it.', users: ['dev/review'] });
    assert.deepEqual(await answered(thrown), {
      status: 409,
      body: { error: 'agents/reviewer.md is named by a step beside it.', users: ['dev/review'] },
    });
  });
  await t.test(
    'REFUSED: an Error carrying exitCode 2 by hand is no refusal — a 500, said on stderr — and so is any other error; an HTTPException answers its own',
    async (t) => {
      const byHand = await quietly(t, () => answered(Object.assign(new Error('refused by hand.'), { exitCode: 2 })));
      assert.deepEqual(byHand, { answer: { status: 500, body: { error: 'refused by hand.' } }, said: 1 });
      const broken = await quietly(t, () => answered(new TypeError('x is undefined')));
      assert.deepEqual(broken.answer, { status: 500, body: { error: 'x is undefined' } });
      const own = await new Hono()
        .get('/thrown', () => {
          throw new HTTPException(418, { message: 'a teapot' });
        })
        .onError(answerError)
        .request('/thrown');
      assert.deepEqual([own.status, await own.text()], [418, 'a teapot']);
    },
  );
  await t.test(
    "the api's own app answers with it: a card written whole that is not there is the package's Missing, a 404 in its words",
    async () => {
      const res = await app.request('/api/namespaces/default/cards/no-such-card', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ metadata: {}, spec: { body: 'An idea' } }),
      });
      assert.equal(res.status, 404);
      const { error } = (await res.json()) as { error: string };
      assert.ok(error.includes('no-such-card') && error.includes('nemia inbox add'), error);
    },
  );
});
