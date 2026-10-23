/**
 * The api's one answer to an error a route threw (`answerError`, app.ts): a refusal of the orchestrator's by its kind, from
 * `REFUSAL_STATUS` — `Missing` 404, `Conflict` 409, `Invalid` 422 — in its own words, and anything else a 500. A router mounted as app.ts
 * mounts its routers throws to it, and the api's own app answers with it.
 */
import './harness.ts';
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { answerError, app, REFUSAL_STATUS } from '../src/app.ts';
import { Conflict, Invalid, Missing } from 'agent-orchestrator';
import { WorkflowError } from 'agent-orchestrator/workflow';
import { noCardLine } from 'agent-orchestrator';

type Refusal = import('agent-orchestrator').Refusal;

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
  await t.test('REFUSAL_STATUS answers every kind of refusal, each once: 404 for Missing, 409 for Conflict, 422 for Invalid', () => {
    const kinds = [new Missing({ message: 'm' }), new Conflict({ message: 'c' }), new Invalid({ message: 'i' })].map((r) => r._tag);
    assert.deepEqual(Object.keys(REFUSAL_STATUS).sort(), [...kinds].sort());
    assert.deepEqual(REFUSAL_STATUS, { Missing: 404, Conflict: 409, Invalid: 422 });
    // @ts-expect-error -- REFUSED by the compiler: a table that leaves out a kind, as REFUSAL_STATUS is checked
    const partial = { Missing: 404, Conflict: 409 } as const satisfies Record<Refusal['_tag'], ContentfulStatusCode>;
    assert.equal(Object.keys(partial).length, 2);
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
    "the api's own app answers with it: a card to queue that is not there is the package's Missing, a 404 in its words",
    async () => {
      const res = await app.request('/api/inbox/no-such-card/queue', { method: 'POST', headers: { 'content-type': 'application/json' } });
      assert.equal(res.status, 404);
      const { error } = (await res.json()) as { error: string };
      assert.ok(error.startsWith(`${noCardLine('no-such-card', [])} Queue one of those`), error);
    },
  );
});
