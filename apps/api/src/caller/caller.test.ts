/**
 * What a request's route needs of a token (`callerGate`): a store not marked exposed takes a request with none as the person; one marked
 * exposed (`WF_EXPOSED=1` in the environment record its settings are read from) refuses it 401 `token-required` on every route, and
 * takes a token of the person's as the person and a live session's as its agent; and the MCP port refuses no token and a session's,
 * saying `WWW-Authenticate: Bearer`. Statuses and refusal words are asserted, never a sentence.
 *
 * On the stand-ins: the runtime's test engine, a session's task filed on it and left working (its token live), and the test place; the
 * tokens minted through the package's `TokenDoor` under the harness's store.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import { storeConfigLayer, TokenDoor, tokenDoorFiles } from 'agent-orchestrator';
import { appOver, eachTest, engineFor } from '../../test/placed.ts';

const stand = eachTest(testPlace);
const standIn = eachTest(testEngine);
const engine = () => engineFor(standIn());
/** The app over a store not marked exposed. */
const app = eachTest(() => appOver(standIn(), stand()));
/** The app over the same store, marked exposed. */
const exposed = eachTest(() => appOver(standIn(), stand(), storeConfigLayer({ ...process.env, WF_ROOT: root, WF_EXPOSED: '1' })));

const TASK = 't-caller-session';

/** A token of the person's, named `caller-laptop`, minted through the token door over the harness's store. */
const personToken = Effect.runSync(
  Effect.gen(function* () {
    return yield* (yield* TokenDoor).persons.mint('caller-laptop');
  }).pipe(Effect.provide(tokenDoorFiles(root))),
);

/** A session's token, of no run, live while `TASK` is filed and unsettled. */
const sessionToken = Effect.runSync(
  Effect.gen(function* () {
    return yield* (yield* TokenDoor).tokens.mint({ agent: 'nemia', factory: null, run: null, step: null, attempt: 1, task: TASK });
  }).pipe(Effect.provide(tokenDoorFiles(root))),
);

/** The session's task filed on the stand-in and left working: its token is live. */
const sessionRunning = () => {
  Effect.runSync(engine().file({ id: TASK, brief: 'Be on.', cwd: root, harness: 'claude' }));
  standIn().settle(TASK, 'working');
};

/** A GET of `url` on `on`, presenting `bearer` where given. */
const get = (on: () => ReturnType<typeof appOver>, url: string, bearer?: string) =>
  on().request(url, bearer === undefined ? {} : { headers: { authorization: `Bearer ${bearer}` } });

/** The refusal word a 401 answers. */
const reasonOf = async (res: Response): Promise<string | undefined> => ((await res.json()) as { reason?: string }).reason;

test('a store not marked exposed: a request with no token is the person', async () => {
  assert.equal((await get(app, '/api/runs')).status, 200);
});

test('REFUSED 401 token-required: a store marked exposed refuses a request with no token, on any route', async () => {
  for (const url of ['/api/runs', '/api/health']) {
    const res = await get(exposed, url);
    assert.equal(res.status, 401, url);
    assert.equal(await reasonOf(res), 'token-required', url);
  }
});

test("a store marked exposed: a token of the person's is the person, and a live session's is its agent", async () => {
  assert.equal((await get(exposed, '/api/runs', personToken)).status, 200, "the person's token");
  sessionRunning();
  assert.equal((await get(exposed, '/api/runs', sessionToken)).status, 200, "a live session's token");
  standIn().settle(TASK, 'succeeded', { exitCode: 0, closeout: { outcome: 'done', summary: 'Done.', needs: null, artifacts: [] } });
  const ended = await get(exposed, '/api/runs', sessionToken);
  assert.equal(ended.status, 401, 'once the session ended');
  assert.equal(await reasonOf(ended), 'session-ended');
});

test("REFUSED 401 on the MCP port, exposed or not: no token, and a session's, each saying WWW-Authenticate: Bearer", async () => {
  sessionRunning();
  for (const [bearer, reason] of [
    [undefined, 'token-required'],
    [sessionToken, 'person-token-required'],
    ['never-minted', 'unknown-token'],
  ] as const) {
    const res = await get(app, '/mcp', bearer);
    assert.equal(res.status, 401, reason);
    assert.equal(await reasonOf(res), reason);
    assert.equal(res.headers.get('www-authenticate'), 'Bearer', reason);
  }
  const passed = await get(app, '/mcp', personToken);
  assert.notEqual(passed.status, 401, "the person's token passes the gate");
  assert.equal(passed.headers.get('www-authenticate'), null);
});
