/**
 * A remote A2A agent as a harness, end to end, at shipped defaults: `createEngine` with a harness that is a URL, against
 * the SDK's own server over HTTP (`remote-server.ts`), on each binding the runtime speaks, in each order a card can list
 * them. What is proven is what crosses the wire, counted by the server itself: a spawn is one SendMessage and never two,
 * a pass one GetTask per open task and none once they settle, a stop one CancelTask. And what a refusal refuses: a card
 * whose auth cannot be met, or whose bindings are not spoken, ends the attempt `unstartable` with nothing sent; an address
 * that cannot be reached, or carries a secret, is refused when the engine is made. The secret itself is on no file the
 * runtime writes, which is read byte for byte.
 */
import { afterEach, test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { ClientFactory, JsonRpcTransportFactory, RestTransportFactory } from '@a2a-js/sdk/client';
import { AgentCard, Role } from '@a2a-js/sdk';
import { createEngine, type Engine, type EngineOptions, type TaskSpec, type TaskView } from '../src/facade.ts';
import { REQUEST_MS, remoteOps } from '../src/a2a-remote.ts';
import { RUNTIME_EXTENSION } from '../src/a2a-map.ts';
import { apiKey, bearer, mtls, remoteServer, type Binding, type RemoteServer, type ServerOptions } from './remote-server.ts';
import { scratch } from './scratch.ts';

const servers: RemoteServer[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((s) => s.close())); });

const serve = async (o: ServerOptions = {}) => {
  const s = await remoteServer(o);
  servers.push(s);
  return s;
};

const SCHEMA = { type: 'object' };
const HELD = () => [{ state: 'working' as const }];

const engineOn = (s: RemoteServer, o: Partial<EngineOptions> = {}, root = scratch('ae-remote-')) =>
  ({ root, e: createEngine({ root, harnesses: { remote: { url: s.url } }, ...o }) });

const task = (o: Partial<TaskSpec> = {}): TaskSpec => ({ brief: 'paint the fence', cwd: '/nowhere/in/particular', harness: 'remote', closeoutSchema: SCHEMA, ...o });

/** Tick until the task's view meets `ok`, under a bound of passes. */
const until = async (e: Engine, id: string, ok: (v: TaskView) => boolean, what: string, passes = 60): Promise<TaskView> => {
  let v: TaskView | undefined;
  for (let i = 0; i < passes; i++) {
    await e.tick();
    v = await e.view(id);
    if (ok(v)) return v;
    await new Promise((r) => setTimeout(r, 15));
  }
  throw new Error(`${id} never ${what}: last seen ${v?.phase}`);
};
const settled = (e: Engine, id: string) => until(e, id, (v) => v.state.settled !== null, 'settled');
const running = (e: Engine, id: string) => until(e, id, (v) => v.phase.startsWith('running'), 'ran');

const refusal = async (f: () => unknown): Promise<Error & { exitCode?: number }> => {
  try { await f(); } catch (e) { return e as Error & { exitCode?: number }; }
  throw new Error('it did not refuse');
};

const journalOf = (root: string, id: string) =>
  fs.readFileSync(path.join(root, 'tasks', `${id}.jsonl`), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { kind: string; at: string });
const writeJournal = (root: string, id: string, events: object[]) =>
  fs.writeFileSync(path.join(root, 'tasks', `${id}.jsonl`), events.map((e) => `${JSON.stringify(e)}\n`).join(''));
const entryFile = (root: string, name: string) => path.join(root, 'remote', `${encodeURIComponent(name)}.json`);

// ─── the server itself ──────────────────────────────────────────────────────

test('the test agent serves its card and answers a message on each binding it lists', async () => {
  const s = await serve({ script: () => [{ data: { ok: true }, state: 'completed' }] });
  const json = await (await fetch(`${s.url}/.well-known/agent-card.json`)).json();
  const card = AgentCard.fromJSON(json);
  assert.deepEqual(card.supportedInterfaces.map((i) => i.protocolBinding), ['JSONRPC', 'HTTP+JSON']);
  for (const binding of ['JSONRPC', 'HTTP+JSON']) {
    const client = await new ClientFactory({
      transports: [new JsonRpcTransportFactory(), new RestTransportFactory()], preferredTransports: [binding],
      cardResolver: { resolve: async () => card, normalizeAgentCard: (c: AgentCard) => c },
    }).createFromAgentCard(card);
    const answer = await client.sendMessage({
      tenant: '', metadata: undefined, configuration: undefined,
      message: { messageId: `m-${binding}`, contextId: '', taskId: '', role: Role.ROLE_USER, parts: [{ content: { $case: 'text', value: 'hi' }, metadata: undefined, filename: '', mediaType: '' }], metadata: undefined, extensions: [], referenceTaskIds: [] },
    });
    assert.ok('status' in answer && answer.artifacts.length === 1, binding);
  }
  assert.equal(s.counts.sendMessage, 2);
  assert.deepEqual(s.paths.map((p) => p.split('/')[2]), ['jsonrpc', 'rest']);
});

// ─── what is refused ────────────────────────────────────────────────────────

test('a card that asks for a bearer token, with no credentials to give one: unstartable, naming the scheme, nothing sent', async () => {
  const s = await serve({ security: bearer('t0k'), script: HELD });
  const { e } = engineOn(s);
  const id = await e.file(task());
  const v = await settled(e, id);
  assert.equal(v.state.settled, 'failed');
  const a = v.state.attempts[0]!;
  assert.equal(a.reason, 'unstartable');
  assert.match(a.error ?? '', /`token` needs a secret, and `credentials` gave none/);
  assert.match(a.error ?? '', /Nothing was sent/);
  assert.equal(s.counts.sendMessage ?? 0, 0);
  assert.equal(s.paths.length, 0, 'no request reached the agent');
});

test('what the runtime cannot send refuses too: an API key in a query, mutual TLS, an HTTP scheme it does not speak', async () => {
  const digest = { ...bearer('x'), schemes: { d: { scheme: { $case: 'httpAuthSecurityScheme' as const, value: { description: '', scheme: 'Digest', bearerFormat: '' } } } }, requirements: [{ schemes: { d: { list: [] } } }] };
  for (const [security, said] of [
    [apiKey('k', 'query'), /API key in a query, and this runtime sends a key only in a header/],
    [mtls(), /mutual TLS, and this runtime holds no client certificate/],
    [digest, /HTTP `Digest` authentication, and this runtime sends only `Bearer` and `Basic`/],
  ] as const) {
    const s = await serve({ security, script: HELD });
    const { e } = engineOn(s, { credentials: () => 'a secret it has' });
    const id = await e.file(task());
    const a = (await settled(e, id)).state.attempts[0]!;
    assert.equal(a.reason, 'unstartable');
    assert.match(a.error ?? '', said);
    assert.equal(s.paths.length, 0);
  }
});

test('a card with two requirements is met by the first the secrets meet whole', async () => {
  const key = apiKey('k-1');
  const s = await serve({
    script: () => [{ data: { ok: 1 }, state: 'completed' }],
    security: { schemes: { ...bearer('b').schemes, ...key.schemes }, requirements: [...bearer('b').requirements, ...key.requirements], accepts: key.accepts },
  });
  const { e } = engineOn(s, { credentials: (scheme) => (scheme === 'key' ? 'k-1' : undefined) });
  const id = await e.file(task());
  assert.equal((await settled(e, id)).state.settled, 'succeeded');
  assert.equal(s.headers[0]!['x-api-key'], 'k-1');
  assert.equal(s.headers[0]!.authorization, undefined);
});

test('a secret the agent refuses: unstartable, in words that say to check it, and the agent did nothing', async () => {
  const s = await serve({ security: bearer('right'), script: HELD });
  const { e, root } = engineOn(s, { credentials: () => 'wrong' });
  const id = await e.file(task());
  const a = (await settled(e, id)).state.attempts[0]!;
  assert.equal(a.reason, 'unstartable');
  assert.match(a.error ?? '', /refused the request's authentication \(401/);
  assert.equal(s.counts.sendMessage ?? 0, 0);
  assert.ok(!fs.existsSync(entryFile(root, `ae/${id}/1`)), 'refused, the intent is taken back: nothing started under the name');
});

test('a card that offers only gRPC: unstartable, naming what the runtime speaks', async () => {
  const s = await serve({ bindings: ['GRPC'], script: HELD });
  const { e } = engineOn(s);
  const id = await e.file(task());
  const a = (await settled(e, id)).state.attempts[0]!;
  assert.equal(a.reason, 'unstartable');
  assert.match(a.error ?? '', /offers GRPC 1\.0, and this runtime speaks JSON-RPC \(`JSONRPC`\) and REST \(`HTTP\+JSON`\)/);
  assert.equal(s.paths.length, 0);
});

test('an agent that is not there: unstartable, since its card could not be read and nothing was sent', async () => {
  const s = await serve();
  const url = s.url;
  await s.close();
  servers.splice(servers.indexOf(s), 1);
  const e = createEngine({ root: scratch('ae-remote-'), harnesses: { remote: { url } } });
  const id = await e.file(task());
  const a = (await settled(e, id)).state.attempts[0]!;
  assert.equal(a.reason, 'unstartable');
  assert.match(a.error ?? '', /could not be read at .*agent-card\.json .*not reachable/);
});

test('createEngine refuses a remote agent it could never reach, or whose address carries a secret', async () => {
  const cases: Array<[unknown, RegExp]> = [
    [{ url: 'https://user:pw@agent.example' }, /carries a user name or password/],
    [{ url: 'https://:pw@agent.example' }, /carries a user name or password/],
    [{ url: 'ftp://agent.example' }, /`ftp:…`, and a remote A2A agent is reached over HTTP/],
    [{ url: 'not a url' }, /`not a url`, and a remote A2A agent is reached over HTTP/],
    [{ url: 7 }, /a number, and a remote A2A agent is reached over HTTP/],
    [{}, /takes one of `url` .* or `card` .*and was given neither/],
    [{ url: 'https://a.example', card: {} }, /and was given both/],
    [{ url: 'https://a.example', token: 's' }, /takes `url` or `card` and nothing else, and was given `token`/],
    [{ card: 'a card' }, /`card` is not an agent card/],
    [{ card: {} }, /`card` lists no interface/],
    [{ card: { supportedInterfaces: [{ url: 'https://a.example' }] } }, /`card` lists no interface/],
  ];
  for (const [agent, said] of cases) {
    const err = await refusal(() => createEngine({ root: scratch('ae-remote-'), harnesses: { remote: agent as never } }));
    assert.equal(err.exitCode, 2, String(said));
    assert.match(err.message, said);
    assert.ok(err.message.startsWith('createEngine: the `remote` harness'), err.message);
  }
  const err = await refusal(() => createEngine({ root: scratch('ae-remote-'), harnesses: { remote: { url: 'https://a.example' } }, credentials: 'secret' as never }));
  assert.equal(err.exitCode, 2);
  assert.match(err.message, /`credentials` is a function/);
});

test('a task that carries harness arguments is refused on a remote agent, before anything is journalled', async () => {
  const s = await serve();
  const { e, root } = engineOn(s);
  const err = await refusal(() => e.file(task({ config: { model: 'x' } })));
  assert.equal(err.exitCode, 2);
  assert.match(err.message, /the `remote` harness is a remote A2A agent, which runs as its operator configured it, and takes no harness arguments: take `model` out of `config`/);
  assert.ok(!fs.existsSync(path.join(root, 'tasks')) || fs.readdirSync(path.join(root, 'tasks')).length === 0);
});

test('say to a remote task at work is refused: its Task takes words only once it asks for input', async () => {
  const s = await serve({ script: HELD });
  const { e, root } = engineOn(s);
  const id = await e.file(task());
  await running(e, id);
  const err = await refusal(() => e.say(id, 'hurry up'));
  assert.equal(err.exitCode, 2);
  assert.match(err.message, /runs on the `remote` remote A2A agent, whose Task takes words only once it asks for input, and it is at work/);
  assert.equal(s.counts.sendMessage, 1, 'nothing sent');
  assert.ok(!journalOf(root, id).some((ev) => ev.kind === 'said'));
});

// ─── end to end, on each binding ────────────────────────────────────────────

const BINDINGS: Binding[][] = [['JSONRPC'], ['HTTP+JSON'], ['JSONRPC', 'HTTP+JSON'], ['HTTP+JSON', 'JSONRPC']];
const pathOf = (b: Binding) => (b === 'JSONRPC' ? 'jsonrpc' : 'rest');

for (const bindings of BINDINGS) {
  const on = bindings.join(' then ');

  test(`${on}: a task works, completes with a data artifact, and settles succeeded with that statement`, async () => {
    const s = await serve({ bindings, script: HELD });
    const { e } = engineOn(s);
    const id = await e.file(task());
    const v = await running(e, id);
    assert.equal(v.phase, 'running (working)');
    assert.equal(v.sessionId, s.tasks()[0]);
    assert.deepEqual(s.sent[0]!.metadata, { [RUNTIME_EXTENSION]: { closeoutSchema: SCHEMA } });
    s.move(s.tasks()[0]!, { data: { painted: 'white' }, state: 'completed' });
    const done = await settled(e, id);
    assert.equal(done.state.settled, 'succeeded');
    assert.deepEqual(done.state.attempts[0]!.closeout, { painted: 'white' });
    assert.equal(done.state.attempts[0]!.stated, true);
    assert.equal(done.state.attempts[0]!.nativeId, s.sent[0]!.contextId || done.state.attempts[0]!.nativeId);
    assert.equal(s.counts.sendMessage, 1);
    assert.ok(s.paths.every((p) => p.split('/')[2] === pathOf(bindings[0]!)), `every call on the card's first binding: ${s.paths.join(', ')}`);
  });

  test(`${on}: a task that asks for input is blocked, waiting for it; say answers it on its Task, and it completes`, async () => {
    const s = await serve({ bindings, script: (t) => (t.turn === 1 ? [{ state: 'input-required', words: 'which colour?' }] : [{ data: { colour: t.text }, state: 'completed' }]) });
    const { e, root } = engineOn(s);
    const id = await e.file(task());
    const v = await until(e, id, (x) => x.phase === 'needs-human', 'asked for input');
    assert.equal(v.waitingFor, 'input');
    const said = await e.say(id, 'blue');
    assert.equal(said.text, 'blue');
    assert.equal(s.sent[1]!.taskId, s.tasks()[0], 'on the same Task');
    assert.equal(s.sent[1]!.contextId, v.state.attempts[0]!.nativeId ?? s.sent[1]!.contextId);
    const done = await settled(e, id);
    assert.equal(done.state.settled, 'succeeded');
    assert.deepEqual(done.state.attempts[0]!.closeout, { colour: 'blue' });
    assert.equal(s.tasks().length, 1, 'one Task, two turns');
    assert.ok(journalOf(root, id).some((ev) => ev.kind === 'said'));
  });

  test(`${on}: stop cancels the Task once, and it settles stopped`, async () => {
    const s = await serve({ bindings, script: HELD });
    const { e } = engineOn(s);
    const id = await e.file(task());
    await running(e, id);
    await e.stop(id);
    const done = await settled(e, id);
    assert.equal(done.state.settled, 'stopped');
    assert.equal(s.counts.cancelTask, 1);
  });

  test(`${on}: a Task that fails settles failed`, async () => {
    const s = await serve({ bindings, script: () => [{ state: 'failed', words: 'the paint ran out' }] });
    const { e } = engineOn(s);
    const id = await e.file(task());
    const done = await settled(e, id);
    assert.equal(done.state.settled, 'failed');
    assert.equal(done.state.attempts[0]!.reason, 'harness');
    assert.match(await e.logs(id), /FAILED — the paint ran out/);
  });

  test(`${on}: a completion with no data part ends with no statement: stated false`, async () => {
    const s = await serve({ bindings, script: () => [{ text: 'done, in words', state: 'completed' }] });
    const { e } = engineOn(s);
    const id = await e.file(task());
    const done = await settled(e, id);
    assert.equal(done.state.attempts[0]!.stated, false);
    assert.equal(done.state.attempts[0]!.closeout, undefined);
  });
}

test('a task held open: its answer is a new Task in the same context, as A2A continues a conversation', async () => {
  const s = await serve({ script: (t) => [{ data: { turn: t.turn, heard: t.text }, state: 'completed' }] });
  const { e } = engineOn(s);
  const id = await e.file(task({ holdOpen: true }));
  const first = await until(e, id, (v) => v.phase === 'input-required', 'waited for an answer');
  await e.answer(id, 'once more');
  const second = await until(e, id, (v) => v.phase === 'input-required' && v.state.attempts.length === 2, 'took its answer');
  assert.equal(s.sent[1]!.contextId, first.state.attempts[0]!.nativeId, 'sent into the context of the first');
  assert.equal(s.sent[1]!.taskId, '');
  assert.equal(s.tasks().length, 2);
  assert.deepEqual(second.state.attempts[1]!.closeout, { turn: 1, heard: 'once more' });
  // Settled on the context, the view's session is the conversation, and its logs are the latest Task in it.
  assert.equal(second.sessionId, first.state.attempts[0]!.nativeId);
  assert.match(await e.logs(id), /^user: once more\n/);
  await e.close(id);
  assert.equal((await settled(e, id)).state.settled, 'succeeded');
});

test('an agent that answers with a Message, not a Task: the session is its reply, ended', async () => {
  const s = await serve({ script: () => [{ reply: 'here you are', data: { answer: 42 } }] });
  const { e } = engineOn(s);
  const id = await e.file(task());
  const done = await settled(e, id);
  assert.equal(done.state.settled, 'succeeded');
  assert.deepEqual(done.state.attempts[0]!.closeout, { answer: 42 });
  assert.match(await e.logs(id), /agent: here you are/);
  assert.equal(s.counts.getTask ?? 0, 0, 'no Task to ask about');
});

test("a card served as the SDK's own objects is read with its security schemes whole", async () => {
  const s = await serve({ cardForm: 'sdk', security: bearer('sdk-token'), script: () => [{ data: { ok: true }, state: 'completed' }] });
  const bare = engineOn(s);
  const refused = (await settled(bare.e, await bare.e.file(task()))).state.attempts[0]!;
  assert.equal(refused.reason, 'unstartable');
  assert.match(refused.error ?? '', /`token` needs a secret/);
  assert.equal(s.paths.length, 0, 'refused off the card, before any request: the scheme was read');
  const { e } = engineOn(s, { credentials: (scheme) => (scheme === 'token' ? 'sdk-token' : undefined) });
  assert.equal((await settled(e, await e.file(task()))).state.settled, 'succeeded');
});

test('a harness given by its card, not its URL, is reached on the card\'s interface', async () => {
  const s = await serve({ script: () => [{ data: { ok: true }, state: 'completed' }] });
  const card = await (await fetch(`${s.url}/.well-known/agent-card.json`)).json() as Record<string, unknown>;
  const asked: string[] = [];
  const e = createEngine({ root: scratch('ae-remote-'), harnesses: { remote: { card } }, credentials: (_, url) => { asked.push(url); return undefined; } });
  assert.equal((await settled(e, await e.file(task()))).state.settled, 'succeeded');
  assert.deepEqual(asked, [], 'a card that asks for no auth asks for no secret');
});

test('an agent that lives under a path has its card read beneath that path, and a URL that names a `.json` file is the card', async () => {
  const done = () => [{ data: { ok: true }, state: 'completed' as const }];
  const under = await serve({ prefix: '/agents/reviewer', script: done });
  for (const url of [under.url, `${under.url}/`]) {
    const e = createEngine({ root: scratch('ae-remote-'), harnesses: { remote: { url } } });
    assert.equal((await settled(e, await e.file(task()))).state.settled, 'succeeded', url);
  }
  assert.deepEqual(under.cards, ['/agents/reviewer/.well-known/agent-card.json', '/agents/reviewer/.well-known/agent-card.json']);
  assert.ok(under.paths.length && under.paths.every((p) => p.startsWith('/agents/reviewer/a2a/')), under.paths.join(' '));
  const named = await serve({ prefix: '/agents/reviewer', cardAt: '/card.json', script: done });
  const e = createEngine({ root: scratch('ae-remote-'), harnesses: { remote: { url: `${named.url}/card.json` } } });
  assert.equal((await settled(e, await e.file(task()))).state.settled, 'succeeded');
  assert.deepEqual(named.cards, ['/agents/reviewer/card.json']);
});

// ─── restarts ───────────────────────────────────────────────────────────────

test('restart after `spawned`: a new engine over the same root reads the Task by GetTask and settles it, sending nothing', async () => {
  const s = await serve({ script: HELD });
  const { e, root } = engineOn(s);
  const id = await e.file(task());
  await running(e, id);
  const again = createEngine({ root, harnesses: { remote: { url: s.url } } });
  const gets = s.counts.getTask ?? 0;
  s.move(s.tasks()[0]!, { data: { ok: true }, state: 'completed' });
  assert.equal((await settled(again, id)).state.settled, 'succeeded');
  assert.ok((s.counts.getTask ?? 0) > gets);
  assert.equal(s.counts.sendMessage, 1);
});

test('restart with the Task recorded and only `starting` journalled: the Task is adopted, and nothing is sent again', async () => {
  const s = await serve({ script: HELD });
  const { e, root } = engineOn(s);
  const id = await e.file(task());
  await running(e, id);
  // The crash: the registry holds the Task, and the engine died before `spawned` was written.
  writeJournal(root, id, journalOf(root, id).filter((ev) => ev.kind !== 'spawned'));
  // A spawn asked again for the name adopts what the registry holds.
  await Effect.runPromise(remoteOps('remote', { url: s.url }, root).spawn({ name: `ae/${id}/1`, brief: 'b', cwd: '/w' }));
  const again = createEngine({ root, harnesses: { remote: { url: s.url } } });
  const v = await running(again, id);
  assert.equal(v.sessionId, s.tasks()[0]);
  s.move(s.tasks()[0]!, { data: { ok: true }, state: 'completed' });
  assert.equal((await settled(again, id)).state.settled, 'succeeded');
  assert.equal(s.counts.sendMessage, 1);
});

test('restart with the intent on disk and no Task: never sent twice — a spawn in doubt, then `lost` past the grace window', async () => {
  const s = await serve({ script: HELD });
  const root = scratch('ae-remote-');
  const e = createEngine({ root, harnesses: { remote: { url: s.url } } });
  const id = await e.file(task({ id: 'in-doubt' }));
  const name = `ae/${id}/1`;
  // The crash: the intent was written, and the send's answer never was.
  fs.mkdirSync(path.join(root, 'remote'), { recursive: true });
  fs.writeFileSync(entryFile(root, name), JSON.stringify({ name, agent: 'remote', messageId: 'm-lost', sentAt: new Date().toISOString() }));
  await e.tick();
  const events = journalOf(root, id) as Array<{ kind: string; at: string; error?: string }>;
  const spawned = events.find((ev) => ev.kind === 'spawned');
  assert.match(spawned?.error ?? '', /its answer was never recorded: whether the agent made a Task of it is not known, and it is not sent twice/);
  assert.equal((await e.view(id)).state.settled, null, 'no refusal: a session may exist');
  assert.equal(s.counts.sendMessage ?? 0, 0);
  // The grace window passes with nothing listed under the name.
  const back = new Date(Date.now() - 31_000).toISOString();
  writeJournal(root, id, events.map((ev) => (ev.kind === 'starting' || ev.kind === 'spawned' ? { ...ev, at: back } : ev)));
  const again = createEngine({ root, harnesses: { remote: { url: s.url } } });
  const done = await settled(again, id);
  assert.equal(done.state.attempts[0]!.reason, 'lost');
  assert.equal(s.counts.sendMessage ?? 0, 0);
});

test('an agent unreachable for a pass is not a session lost: the task reads as last seen, and settles once it answers', async () => {
  const s = await serve({ script: HELD });
  const { e, root } = engineOn(s);
  const id = await e.file(task());
  await running(e, id);
  // Point the harness at an address nothing answers: every GetTask fails.
  const entry = JSON.parse(fs.readFileSync(entryFile(root, `ae/${id}/1`), 'utf8'));
  const dead = createEngine({ root, harnesses: { remote: { card: { supportedInterfaces: [{ url: 'http://127.0.0.1:9/a2a/jsonrpc', protocolBinding: 'JSONRPC', protocolVersion: '1.0' }] } } } });
  const back = new Date(Date.now() - 31_000).toISOString();
  writeJournal(root, id, journalOf(root, id).map((ev) => (ev.kind === 'starting' || ev.kind === 'spawned' ? { ...ev, at: back } : ev)));
  for (let i = 0; i < 3; i++) await dead.tick();
  const v = await dead.view(id);
  assert.equal(v.phase, 'running (working)', 'past the grace window, and not lost');
  assert.equal(v.sessionId, entry.taskId);
  s.move(s.tasks()[0]!, { data: { ok: true }, state: 'completed' });
  assert.equal((await settled(e, id)).state.settled, 'succeeded');
});

// ─── the secret ─────────────────────────────────────────────────────────────

/** Every file under `dir`, as text. */
const everyFile = (dir: string): Array<[string, string]> => fs.readdirSync(dir, { recursive: true, encoding: 'utf8' })
  .map((f) => path.join(dir, f)).filter((f) => fs.statSync(f).isFile()).map((f) => [f, fs.readFileSync(f, 'utf8')]);

test('the secret is sent, and written nowhere: not the journal, the registry, the feed, nor the view', async () => {
  const token = 'tok-3f9a-SECRET-7c21';
  const s = await serve({ security: bearer(token), script: HELD });
  const { e, root } = engineOn(s, { credentials: (scheme) => (scheme === 'token' ? token : undefined) });
  const id = await e.file(task());
  await running(e, id);
  s.move(s.tasks()[0]!, { data: { ok: true }, state: 'completed' });
  const v = await settled(e, id);
  assert.equal(v.state.settled, 'succeeded');
  assert.ok(s.headers.every((h) => h.authorization === `Bearer ${token}`), 'sent on every request');
  const files = everyFile(root);
  assert.ok(files.some(([f]) => f.includes(`${path.sep}remote${path.sep}`)) && files.some(([f]) => f.endsWith('feed.jsonl')), 'the registry and the feed were read');
  for (const [file, text] of files) assert.ok(!text.includes(token), `${file} holds the secret`);
  assert.ok(!JSON.stringify(v).includes(token));
  assert.ok(!JSON.stringify(await e.feed()).includes(token));
});

test('a card served at one origin that names its interfaces on another: unstartable, and neither origin is sent the secret', async () => {
  const key = 'key-5e1d-SECRET';
  const elsewhere = await serve({ security: apiKey(key), script: () => [{ data: { ok: true }, state: 'completed' }] });
  const s = await serve({ security: apiKey(key), interfacesAt: elsewhere.url, script: HELD });
  const { e, root } = engineOn(s, { credentials: () => key });
  const a = (await settled(e, await e.file(task()))).state.attempts[0]!;
  assert.equal(a.reason, 'unstartable');
  assert.match(a.error ?? '', new RegExp(`card names ${elsewhere.url}/a2a/jsonrpc, ${elsewhere.url}/a2a/rest, and none is on ${s.url}, the origin the harness was given`));
  assert.match(a.error ?? '', /Nothing was sent/);
  assert.equal(elsewhere.paths.length, 0, 'the other origin was sent nothing');
  assert.equal(s.paths.length, 0);
  assert.ok(!fs.existsSync(path.join(root, 'remote')) || fs.readdirSync(path.join(root, 'remote')).length === 0, 'no intent was written');
});

test('a redirect from the agent is not followed: the send is refused, and the address it names is sent nothing', async () => {
  const key = 'key-8b2c-SECRET';
  const elsewhere = await serve({ security: apiKey(key), script: () => [{ data: { ok: true }, state: 'completed' }] });
  const s = await serve({ security: apiKey(key), redirectTo: elsewhere.url, script: HELD });
  const { e, root } = engineOn(s, { credentials: () => key });
  const a = (await settled(e, await e.file(task()))).state.attempts[0]!;
  assert.equal(a.reason, 'unstartable');
  assert.match(a.error ?? '', new RegExp(`answered 307 to ${elsewhere.url}/a2a/jsonrpc, and a redirect is not followed`));
  assert.equal(elsewhere.paths.length, 0, 'the address it named was sent nothing');
  assert.equal(s.paths.length, 1, 'one send, answered with the redirect');
  assert.equal(s.counts.sendMessage ?? 0, 0);
  assert.deepEqual(fs.readdirSync(path.join(root, 'remote')), [], 'the intent went with the refusal');
});

// ─── an agent that does not answer ──────────────────────────────────────────

/** How long `f` took, in ms, and what it gave. */
const timed = async <A>(f: () => Promise<A>): Promise<[number, A]> => {
  const from = performance.now();
  const a = await f();
  return [performance.now() - from, a];
};

test('a request the agent holds is given up after its bound: a card not read refuses, a send is in doubt, a GetTask reads as last seen', async () => {
  const s = await serve({ script: HELD });
  const root = scratch('ae-remote-');
  const ops = remoteOps('remote', { url: s.url }, root, undefined, 300);
  const spawnOf = (name: string) => Effect.runPromise(Effect.flip(ops.spawn({ name, brief: 'b', cwd: '/w' })));

  s.hanging.card = true;
  const [cardMs, card] = await timed(() => spawnOf('ae/card/1'));
  assert.ok(cardMs < 3_000, `${cardMs} ms`);
  assert.equal(card.refused, true);
  assert.match(card.message, /could not be read at .*agent-card\.json \(.*did not answer within 0\.3 s\): the agent is not reachable/);
  s.hanging.card = false;

  s.hanging.a2a = true;
  const [sendMs, send] = await timed(() => spawnOf('ae/send/1'));
  assert.ok(sendMs < 3_000, `${sendMs} ms`);
  assert.notEqual(send.refused, true, 'held, the send may have been taken: in doubt, not refused');
  assert.match(send.message, /did not answer within 0\.3 s/);
  assert.equal(JSON.parse(fs.readFileSync(entryFile(root, 'ae/send/1'), 'utf8')).taskId, undefined, 'the intent stays, with no Task');
  s.hanging.a2a = false;

  await Effect.runPromise(ops.spawn({ name: 'ae/seen/1', brief: 'b', cwd: '/w' }));
  const taskId = s.tasks()[0]!;
  s.hanging.a2a = true;
  const [observeMs, seen] = await timed(() => Effect.runPromise(ops.observe));
  assert.ok(observeMs < 3_000, `${observeMs} ms`);
  assert.equal(seen.get('ae/seen/1')?.sessionId, taskId);
  assert.equal(seen.get('ae/seen/1')?.state, 'working', 'as last seen');
});

test(`at shipped defaults an agent that holds every request holds a pass ${REQUEST_MS / 1000} s at most, and the task reads as last seen`, async () => {
  const s = await serve({ script: HELD });
  const { e } = engineOn(s);
  const id = await e.file(task());
  await running(e, id);
  s.hanging.a2a = true;
  const [ms] = await timed(() => e.tick());
  assert.ok(ms >= REQUEST_MS - 100 && ms < REQUEST_MS + 5_000, `${ms} ms`);
  assert.equal((await e.view(id)).phase, 'running (working)');
});

// ─── every verb reaches the agent ───────────────────────────────────────────

test('every verb reaches the agent as an A2A method: SendMessage, GetTask, CancelTask', async () => {
  const s = await serve({ script: HELD });
  const { e } = engineOn(s);
  const id = await e.file(task());
  await running(e, id);
  await e.view(id);
  assert.match(await e.logs(id), /user: paint the fence\nWORKING/);
  await e.stop(id);
  await settled(e, id);
  assert.equal(s.counts.sendMessage, 1);
  assert.ok((s.counts.getTask ?? 0) >= 2);
  assert.equal(s.counts.cancelTask, 1);
  assert.equal(s.counts.listTasks ?? 0, 0, 'never a listing: on an agent others use it lists theirs too');
});

// ─── what a pass costs ──────────────────────────────────────────────────────

test('a pass makes one GetTask per open remote task, and none once they settle', async (t: TestContext) => {
  for (const n of [3, 6]) {
    const s = await serve({ script: HELD });
    const { e } = engineOn(s);
    const ids = await Promise.all(Array.from({ length: n }, () => e.file(task())));
    for (const id of ids) await running(e, id);
    for (let pass = 1; pass <= 4; pass++) {
      const gets = s.counts.getTask ?? 0;
      const report = await e.tick();
      const o = report.observed.remote!;
      assert.equal(o.calls, 1, `${n} tasks, pass ${pass}: one observe`);
      assert.equal(o.listed, n);
      assert.equal((s.counts.getTask ?? 0) - gets, n, 'one GetTask each');
      t.diagnostic(`${n} open: pass ${pass} ${report.ms.toFixed(1)} ms, observe ${o.ms.toFixed(1)} ms, ${(o.ms / n).toFixed(2)} ms per task`);
    }
    for (const taskId of s.tasks()) s.move(taskId, { data: { ok: true }, state: 'completed' });
    for (const id of ids) await settled(e, id);
    await e.tick();
    const gets = s.counts.getTask ?? 0;
    const report = await e.tick();
    assert.equal((s.counts.getTask ?? 0) - gets, 0, 'settled: nothing asked');
    assert.equal(report.observed.remote?.listed ?? 0, 0, 'and nothing listed: each was let go of');
    t.diagnostic(`${n} settled: pass ${report.ms.toFixed(1)} ms`);
  }
});
