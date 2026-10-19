/**
 * The port a holder listens on (`src/a2a/listener.ts`), over a real socket and real HTTP: the token checked before anything,
 * the refusals of the methods the surface does not serve, the two reads it does, the event stream framed by hand, and the
 * token's file and its going with the scope.
 *
 * It binds a socket of its own and speaks HTTP to it, and reaches nothing outside this process: no git, no process started, no
 * real place and no real engine, so it is no boundary test.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Effect, Exit, Scope, Stream } from 'effect';
import { servedOf, type Served } from '../src/a2a/listener.ts';
import { tokenFileOf, tokenFolderOf } from '../src/a2a/holder-token.ts';
import type { Followed, RunnerOps } from '../src/harness/seam.ts';
import type { Sighting } from '../src/core/domain.ts';
import { scratch } from './scratch.ts';
import { WAITED } from '../src/waits/index.ts';

const NAME = 'ae/t1/1';

/** A gate a test opens: what the driver's follow waits at between its first piece and its last. */
const gate = () => {
  let open = () => {};
  const opened = new Promise<void>((resolve) => void (open = resolve));
  return { open: () => open(), opened };
};

/**
 * A driver a test moves by hand: one session listed working, and a follow that says its state, writes a piece, waits at
 * `held` and then ends the turn. The wait is what makes a buffered stream fail: the first frame must arrive before the last.
 */
const handOps = (held: Promise<void>): RunnerOps => {
  const sessions = new Map<string, Sighting>([[NAME, { sessionId: 's-1', state: 'working', busy: true }]]);
  const moments = async function* (): AsyncGenerator<Followed> {
    yield { kind: 'state', state: 'working' };
    yield { kind: 'partial', key: 'b0', text: 'Rivers', append: false, last: false };
    await held;
    yield { kind: 'partial', key: 'b0', text: ' run.', append: true, last: true };
    yield { kind: 'state', state: 'completed' };
  };
  return {
    spawn: () => Effect.void,
    observe: Effect.sync(() => new Map(sessions)),
    stop: () => Effect.void,
    logs: () => Effect.succeed('printed'),
    transcript: (sessionId: string) => Effect.succeed({ events: [], cursor: `${sessionId}@0` }),
    follow: () => Stream.fromAsyncIterable(moments(), (cause) => cause as never),
  };
};

/**
 * The same driver with nothing left to follow: its `follow` says a terminal state first, which is what `subscription` refuses
 * before it has yielded anything (`a2a/follow.ts`). What makes the first answer of a stream fail.
 */
const endedOps = (): RunnerOps => ({
  ...handOps(Promise.resolve()),
  follow: () => Stream.succeed<Followed>({ kind: 'state', state: 'completed' }),
});

/** A holder listening for the length of the test, its scope closed by hand. */
const holding = async (ops: RunnerOps) => {
  const root = scratch('ae-listener-');
  const scope = Scope.makeUnsafe();
  const served = await Effect.runPromise(Scope.provide(servedOf({ root, ops: { claude: ops }, events: async () => [] }), scope));
  return { root, served, close: () => Effect.runPromise(Scope.close(scope, Exit.void)) };
};

/** A JSON-RPC call over the wire, with whatever `authorization` is given. */
const call = (served: Served, body: unknown, authorization?: string) =>
  fetch(`${served.url}/claude`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(authorization === undefined ? {} : { authorization }) },
    body: JSON.stringify(body),
  });

const rpc = (method: string, params: unknown) => ({ jsonrpc: '2.0', id: 7, method, params });

test('the port binds a port of its own on loopback, and answers the card it declares', async () => {
  const { served, close } = await holding(handOps(Promise.resolve()));
  try {
    const url = new URL(served.url);
    assert.equal(url.hostname, '127.0.0.1', 'the port is on loopback alone');
    assert.ok(Number(url.port) > 0, `the port is one the machine chose: ${url.port}`);
    const iface = (served.cards.claude.supportedInterfaces as Array<{ url: string }>)[0];
    assert.equal(iface.url, `${served.url}/claude`, 'the card names the address it is served at');
    const answered = await fetch(`${served.url}/claude/.well-known/agent-card.json`, {
      headers: { authorization: `Bearer ${served.token}` },
    });
    assert.equal(answered.status, 200);
    assert.deepEqual(await answered.json(), served.cards.claude, 'the card served is the card answered up');
  } finally {
    await close();
  }
});

test('REFUSED, at shipped defaults: a request with no token, one with a wrong token, and a card read with neither', async () => {
  const { served, close } = await holding(handOps(Promise.resolve()));
  try {
    for (const [what, authorization] of [
      ['no authorization at all', undefined],
      ['a wrong token', 'Bearer not-the-token'],
      ['a token in the wrong scheme', `Basic ${served.token}`],
    ] as const) {
      const answered = await call(served, rpc('GetTask', { tenant: '', id: NAME }), authorization);
      assert.equal(answered.status, 401, what);
      assert.equal(answered.headers.get('www-authenticate'), 'Bearer', what);
      assert.equal(await answered.text(), '', `${what}: no JSON-RPC body, since a client reads the kind off the status`);
    }
    const card = await fetch(`${served.url}/claude/.well-known/agent-card.json`);
    assert.equal(card.status, 401, 'the card is behind the token too');
  } finally {
    await close();
  }
});

test('REFUSED with the right token: a send, a stop, a listing and a method of ours — and no body names the token', async () => {
  const { served, close } = await holding(handOps(Promise.resolve()));
  try {
    const bearer = `Bearer ${served.token}`;
    for (const method of ['SendMessage', 'CancelTask', 'ListTasks', 'GetExtendedAgentCard']) {
      const answered = await call(served, rpc(method, {}), bearer);
      assert.equal(answered.status, 200, method);
      const body = (await answered.json()) as { error?: { code: number; message: string } };
      assert.ok(body.error, `${method} is refused: ${JSON.stringify(body)}`);
      assert.match(body.error.message, /is not served here/, method);
      assert.ok(!JSON.stringify(body).includes(served.token), `${method}: the refusal says nothing of the token`);
    }
    const ours = await call(served, rpc('sessionTranscript', { name: NAME }), bearer);
    const body = (await ours.json()) as { error?: { code: number } };
    assert.equal(body.error?.code, -32601, `a method of ours is not on the wire: ${JSON.stringify(body)}`);
  } finally {
    await close();
  }
});

test('a path, a method and a body the port does not take are refused by themselves', async () => {
  const { served, close } = await holding(handOps(Promise.resolve()));
  try {
    const bearer = `Bearer ${served.token}`;
    const elsewhere = await fetch(`${served.url}/codex`, { method: 'POST', headers: { authorization: bearer }, body: '{}' });
    assert.equal(elsewhere.status, 404);
    assert.match(await elsewhere.text(), /this port serves \/claude and nothing else\./);
    const read = await fetch(`${served.url}/claude`, { headers: { authorization: bearer } });
    assert.equal(read.status, 405);
    const big = await call(served, { jsonrpc: '2.0', id: 1, method: 'GetTask', params: { id: 'x'.repeat(100_000) } }, bearer);
    assert.equal(big.status, 413);
  } finally {
    await close();
  }
});

test('getTask over the wire answers the session the driver lists', async () => {
  const { served, close } = await holding(handOps(Promise.resolve()));
  try {
    const answered = await call(served, rpc('GetTask', { tenant: '', id: NAME }), `Bearer ${served.token}`);
    const body = (await answered.json()) as { result?: { id?: string; status?: { state?: string } } };
    assert.equal(body.result?.id, NAME, JSON.stringify(body));
    assert.equal(body.result?.status?.state, 'TASK_STATE_WORKING');
  } finally {
    await close();
  }
});

test('a subscription is an event stream, framed and flushed, whose first answer comes before the turn is over', WAITED, async () => {
  const held = gate();
  const { served, close } = await holding(handOps(held.opened));
  try {
    const answered = await call(served, rpc('SubscribeToTask', { tenant: '', id: NAME }), `Bearer ${served.token}`);
    assert.equal(answered.status, 200);
    assert.match(answered.headers.get('content-type')!, /^text\/event-stream/);
    assert.equal(answered.headers.get('x-accel-buffering'), 'no');
    const reader = answered.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';
    const frames = () => text.split('\n\n').filter(Boolean);
    while (frames().length < 2) {
      const step = await reader.read();
      assert.ok(!step.done, `the stream ended before its first two answers: ${JSON.stringify(text)}`);
      text += decoder.decode(step.value, { stream: true });
    }
    assert.ok(
      frames().every((f) => f.startsWith('data: ')),
      `each answer is one \`data:\` frame: ${JSON.stringify(frames())}`,
    );
    const said = frames().map((f) => JSON.parse(f.slice('data: '.length)) as { id: number; result: unknown });
    assert.deepEqual(
      said.map((s) => s.id),
      [7, 7],
      'each answer carries the request’s own id',
    );
    assert.match(JSON.stringify(said[1]), /Rivers/, 'the piece written so far is the second answer, before the turn ends');
    held.open();
    for (let step = await reader.read(); !step.done; step = await reader.read()) text += decoder.decode(step.value, { stream: true });
    assert.equal(frames().length, 4, `every moment is one frame: ${JSON.stringify(frames())}`);
  } finally {
    await close();
  }
});

test('the token is kept 0600 in a 0700 folder, is what the hold answered, and goes with the scope', async (t) => {
  const held = gate();
  const { root, served, close } = await holding(handOps(held.opened));
  t.after(async () => {
    held.open();
    await close();
  });
  const file = tokenFileOf(root);
  assert.equal(fs.readFileSync(file, 'utf8'), served.token, 'the file holds what the hold answered');
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(fs.statSync(tokenFolderOf(root)).mode & 0o777, 0o700);
  const streaming = await call(served, rpc('SubscribeToTask', { tenant: '', id: NAME }), `Bearer ${served.token}`);
  const reader = streaming.body!.getReader();
  await reader.read();
  await close();
  held.open();
  assert.equal(fs.existsSync(file), false, 'the token is forgotten as the hold ends');
  await assert.rejects(
    call(served, rpc('GetTask', { tenant: '', id: NAME }), `Bearer ${served.token}`),
    'and the port takes no connection',
  );
  await assert.rejects(
    (async () => {
      for (let step = await reader.read(); !step.done; step = await reader.read());
    })(),
    'and the socket an open stream held is destroyed, so it cannot hold the hold open',
  );
});

test('a second hold answers a token of its own', async () => {
  const first = await holding(handOps(Promise.resolve()));
  await first.close();
  const second = await holding(handOps(Promise.resolve()));
  try {
    assert.notEqual(second.served.token, first.served.token);
    assert.notEqual(second.served.url, first.served.url, 'and a port of its own');
  } finally {
    await second.close();
  }
});

test('a subscription that fails before its first answer is a JSON-RPC error in a 200, never an event stream that says nothing', async () => {
  const { served, close } = await holding(endedOps());
  try {
    const answered = await call(served, rpc('SubscribeToTask', { tenant: '', id: NAME }), `Bearer ${served.token}`);
    assert.equal(answered.status, 200);
    assert.match(
      answered.headers.get('content-type')!,
      /^application\/json/,
      'an event stream here would leave a viewer waiting for ever on a session that has nothing to say',
    );
    const body = (await answered.json()) as { id?: number; error?: { message: string } };
    assert.equal(body.id, 7, JSON.stringify(body));
    assert.match(body.error!.message, /has ended \(done\)/, `the refusal says why, and what to read instead: ${JSON.stringify(body)}`);
    assert.match(body.error!.message, /sessionTranscript/);
  } finally {
    await close();
  }
});
