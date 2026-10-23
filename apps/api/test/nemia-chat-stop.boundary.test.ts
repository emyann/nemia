/**
 * The stop of Nemia's chat taken at the api: `POST /api/nemia/chat/stop` for the turn she is answering is a 200 with the stop
 * `{ at, attempt }` the package answered, word for word, and her history read after it holds the keeper's one `Stopped` line.
 *
 * Over the engine the api builds, with `interrupt` alone answered as the attached runner answers it, and given to the app: every
 * session the harness lists is a `--bg` one, whose turn cannot be ended without ending its session, so over the harness the route can
 * only be refused (`nemia-chat.test.ts`, the 409). Her record, her transcript and her level file are planted as there (`her.ts`), and
 * the history is read back through the api's own projection of them. An engine given to the app by hand is what the stand-ins rule
 * names a boundary test for; the stop verb's own path — the interrupt through the one client, then the line — is proven on the
 * engine's stand-in (`packages/agent-orchestrator/test/nemia-chat.test.ts`).
 */
import './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect, Layer } from 'effect';
import { engine, type ChatEvent, type ChatHistory } from 'agent-orchestrator';
import { withHer } from './her.ts';
import { appOf, liveOf } from '../src/app.ts';
import { Engine } from '../src/store.ts';

const BOARD = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' };

/** What the runtime answers a turn it ended: the moment it was asked to end, and the attempt it was in. */
const ENDED = { at: '2026-10-15T12:34:56.000Z', attempt: 1 };

/** Each task the engine was asked to end the turn of, in the order asked. */
const asked: string[] = [];

/** The api's engine, with the one verb the harness's sessions refuse answered as an attached session answers it. */
const ends = {
  ...engine(),
  interrupt: (taskId: string) =>
    Effect.sync(() => {
      asked.push(taskId);
      return ENDED;
    }),
} as Engine['Service'];

const { app } = appOf(Layer.merge(liveOf(), Layer.succeed(Engine)(ends)));

/** The api's answer to `method` on `url`, as the board sends it. */
async function answered(method: string, url: string, body?: string) {
  const res = await app.request(url, { method, headers: BOARD, ...(body === undefined ? {} : { body }) });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

test('a stop of the turn she is answering is a 200 with the stop as the package gave it, and her history holds the one Stopped line', async () => {
  const { task } = withHer(['One.']);
  const stopped = await answered('POST', '/api/nemia/chat/stop', '{}');
  assert.equal(stopped.status, 200);
  assert.deepEqual(stopped.body, ENDED, 'the stop as the package gave it, and nothing else');
  assert.deepEqual(asked, [task], 'the turn was ended through the engine, and once');
  const history = (await answered('GET', '/api/nemia/chat')).body as unknown as ChatHistory;
  assert.deepEqual(
    history.events.filter((e: ChatEvent) => e.kind === 'message' && e.from === 'keeper').map((e) => (e as { text: string }).text),
    ['Stopped'],
  );
});
