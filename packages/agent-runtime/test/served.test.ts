/**
 * What a holder serves (`src/a2a/served.ts`): the card it declares, read as a viewer's client reads it (`cardOfJson`,
 * `authOf`), and the reading surface over a driver a test moves by hand — the three methods served, and every other refused.
 * And the viewer's side as the options take it: the seam that dials the follow alone (`holderSeamOf`), the engine that takes a
 * holder of the harnesses it runs by default, and what `Engine.layer` refuses of a `holder` entry, in the order it refuses it
 * (`optionsRefusalOf`).
 *
 * Each refusal is made to refuse, at shipped defaults, and each fact about the card is made to fail with the fixture that
 * breaks it: a card whose scheme is taken off makes `authOf` send no header, which is why the scheme is on it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect, Stream } from 'effect';
import type { AgentCard } from '@a2a-js/sdk';
import { ServerCallContext } from '@a2a-js/sdk/server';
import { UnsupportedOperationError } from '@a2a-js/sdk/errors';
import { cardOf, HarnessHandler } from '../src/a2a/handler.ts';
import { cardOfJson } from '../src/a2a/card.ts';
import { authOf } from '../src/a2a/remote-client.ts';
import { BEARER, cardJsonOf, REFUSED, servedCardOf, ServedHandler } from '../src/a2a/served.ts';
import { holderAgentRefusal, holderRefusal, holderSeamOf } from '../src/a2a/holder-follow.ts';
import { heldHarnessesOf, optionsRefusalOf } from '../src/service/options.ts';
import { Engine } from '../src/index.ts';
import { builtEngine } from './engine.ts';
import { scratch } from './scratch.ts';
import type { SeamOps } from '../src/a2a/client.ts';
import type { Followed, RunnerOps } from '../src/harness/seam.ts';
import type { Sighting } from '../src/core/domain.ts';

const ctx = new ServerCallContext();
const URL_AT = 'http://127.0.0.1:45671/claude';
const NAME = 'ae/t1/1';

/** The moments the hand driver's `follow` gives: a state, then one piece of text, as a session writing says them. */
const MOMENTS: readonly Followed[] = [
  { kind: 'state', state: 'working' },
  { kind: 'partial', key: 'b0', text: 'Rivers', append: false, last: false },
];

/** A driver a test moves by hand, with the verbs a holder's harness has: a session listed working, a transcript and a follow. */
const handOps = (): RunnerOps => {
  const sessions = new Map<string, Sighting>([[NAME, { sessionId: 's-1', state: 'working', busy: true }]]);
  return {
    spawn: () => Effect.void,
    observe: Effect.sync(() => new Map(sessions)),
    stop: () => Effect.void,
    logs: () => Effect.succeed('printed'),
    transcript: (sessionId: string) => Effect.succeed({ events: [], cursor: `${sessionId}@0` }),
    follow: () => Stream.fromIterable(MOMENTS),
  };
};

const servedOn = (ops: RunnerOps = handOps()) => {
  const card = servedCardOf('claude', ops, URL_AT);
  const inner = new HarnessHandler('claude', ops, async () => []);
  return { card, inner, handler: new ServedHandler(inner, card) };
};

test('the served card declares one JSONRPC interface at the port, at A2A 1.0, where the in-process card declares none', () => {
  const ops = handOps();
  const { card } = servedOn(ops);
  assert.deepEqual(card.supportedInterfaces, [{ url: URL_AT, protocolBinding: 'JSONRPC', tenant: '', protocolVersion: '1.0' }]);
  assert.deepEqual(cardOf('claude', ops).supportedInterfaces, [], 'the in-process road has no URL, so its card offers no interface');
});

test('the served card carries the bearer scheme and the requirement that names it, so a client sends the token', () => {
  const { card } = servedOn();
  const asked: Array<[string, string, string]> = [];
  const auth = authOf(card, URL_AT, 'claude', (scheme, agentUrl, harness) => {
    asked.push([scheme, agentUrl, harness]);
    return 'tok-1';
  });
  assert.deepEqual(auth, { headers: { authorization: 'Bearer tok-1' } });
  assert.deepEqual(asked, [[BEARER, URL_AT, 'claude']], 'the secret is asked for the scheme the card names, for this agent and harness');
});

test('REFUSED: the same card with its schemes taken off asks for nothing, and a client sends no header', () => {
  const { card } = servedOn();
  const bare: AgentCard = { ...card, securitySchemes: {}, securityRequirements: [] };
  assert.deepEqual(
    authOf(bare, URL_AT, 'claude', () => 'tok-1'),
    { headers: {} },
    'no requirement, no header: the port would refuse it',
  );
});

test('REFUSED: a viewer whose `credentials` answers nothing is refused in words naming the scheme and what to give', () => {
  const { card } = servedOn();
  const auth = authOf(card, URL_AT, 'claude', () => undefined);
  assert.ok('refusal' in auth, `a secret that is not there is a refusal: ${JSON.stringify(auth)}`);
  assert.match(auth.refusal, /`bearer`/);
  assert.match(auth.refusal, /`credentials`/);
  assert.match(auth.refusal, /Nothing was sent\.$/);
});

test('the served card lists no method of the runtime extension and no `say`, where the in-process card lists what the driver has', () => {
  const ops = handOps();
  const { card } = servedOn(ops);
  const paramsOf = (c: AgentCard) => c.capabilities?.extensions?.[0]?.params as { methods: string[]; say: boolean };
  assert.ok(
    paramsOf(cardOf('claude', ops)).methods.includes('sessionTranscript'),
    'the driver has a transcript, so the in-process card offers it',
  );
  assert.deepEqual(paramsOf(card), { methods: [], say: false }, 'the port answers no method of ours, and takes no words');
});

test('the served card is read back by a viewer as the card of an agent given inline', () => {
  const { card } = servedOn();
  const json = cardJsonOf(card);
  const read = cardOfJson(json);
  assert.ok('card' in read, `the card a holder serves decodes: ${JSON.stringify(read)}`);
  assert.deepEqual(read.card.supportedInterfaces, card.supportedInterfaces);
  assert.deepEqual(
    authOf(read.card, URL_AT, 'claude', () => 'tok-1'),
    { headers: { authorization: 'Bearer tok-1' } },
  );
  assert.equal(holderRefusal('claude', { harnesses: ['claude'], claude: true }), undefined);
  assert.equal(holderAgentRefusal('claude', { card: json }), undefined);
});

test('REFUSED, at shipped defaults: every method the port does not serve, each naming itself and what the port is for', async () => {
  const { handler } = servedOn();
  const calls: Record<keyof typeof REFUSED, () => Promise<unknown>> = {
    sendMessage: () => handler.sendMessage({} as never, ctx),
    sendMessageStream: async () => handler.sendMessageStream({} as never, ctx).next(),
    cancelTask: () => handler.cancelTask({} as never, ctx),
    listTasks: () => handler.listTasks({} as never, ctx),
    createTaskPushNotificationConfig: () => handler.createTaskPushNotificationConfig({} as never, ctx),
    getTaskPushNotificationConfig: () => handler.getTaskPushNotificationConfig({} as never, ctx),
    listTaskPushNotificationConfigs: () => handler.listTaskPushNotificationConfigs({} as never, ctx),
    deleteTaskPushNotificationConfig: () => handler.deleteTaskPushNotificationConfig({} as never, ctx),
    getAuthenticatedExtendedAgentCard: () => handler.getAuthenticatedExtendedAgentCard({} as never, ctx),
  };
  for (const [method, call] of Object.entries(calls)) {
    const err = await call().then(
      () => undefined,
      (e: unknown) => e,
    );
    assert.ok(err instanceof UnsupportedOperationError, `${method} is refused in the SDK's own error: ${String(err)}`);
    assert.match(err.message, new RegExp(`\`${method}\` is not served here`), method);
    assert.match(err.message, /This port reads a session/, method);
  }
});

test('the three served methods are the handler the runtime already had: its card, its Task and its stream', async () => {
  const { card, inner, handler } = servedOn();
  assert.deepEqual(await handler.getAgentCard(), card, 'the card is the served one, never the in-process one');
  assert.deepEqual(
    await handler.getTask({ tenant: '', id: NAME, historyLength: undefined }, ctx),
    await inner.getTask({ tenant: '', id: NAME, historyLength: undefined }, ctx),
  );
  const read = async (gen: AsyncGenerator<unknown, void, undefined>) => {
    const got: unknown[] = [];
    for await (const answer of gen) got.push(answer);
    return got;
  };
  assert.deepEqual(
    await read(handler.resubscribe({ tenant: '', id: NAME }, ctx)),
    await read(inner.resubscribe({ tenant: '', id: NAME }, ctx)),
    'the stream is the driver’s own moments, one answer each',
  );
});

test('the viewer dials its `follow` and nothing else: every other verb is the value it was', () => {
  const ops = handOps() as SeamOps;
  const card = cardJsonOf(servedCardOf('claude', ops, URL_AT));
  const dialled = holderSeamOf(() => ({ card }), 'claude', () => 'tok-1', ops);
  assert.notEqual(dialled.follow, ops.follow, 'the follow is the holder’s');
  const kept = Object.keys(ops).filter((k) => k !== 'follow');
  assert.deepEqual(
    kept.filter((k) => dialled[k as keyof SeamOps] !== ops[k as keyof SeamOps]),
    [],
    'and every other verb is the same function value, so nothing else can reach the holder',
  );
  assert.equal(
    holderSeamOf(undefined, 'claude', () => 'tok-1', ops),
    ops,
    'a harness with no holder function is left as it is',
  );
});

test('a holder function answering nothing reads the session here: the follow is the ops’ own, and nothing is dialled', async () => {
  const ops = handOps() as SeamOps;
  const seam = holderSeamOf(() => undefined, 'claude', () => 'tok-1', ops);
  assert.deepEqual(await Effect.runPromise(Stream.runCollect(seam.follow!(NAME))), MOMENTS, 'the moments are the ones the ops give');
});

test('the holder is asked at each follow, not at the build: nothing first, a card second, on one seam', async () => {
  const ops = handOps() as SeamOps;
  const card = cardJsonOf(servedCardOf('claude', ops, URL_AT));
  let holding = false;
  const asked: string[] = [];
  const seam = holderSeamOf(
    () => (holding ? { card } : undefined),
    'claude',
    (scheme) => {
      asked.push(scheme);
      return 'tok-1';
    },
    ops,
  );
  assert.deepEqual(
    await Effect.runPromise(Stream.runCollect(seam.follow!(NAME))),
    MOMENTS,
    'with no holder up, the follow reads here',
  );
  assert.deepEqual(asked, [], 'and nothing was dialled for it');
  holding = true;
  const dialled = await Effect.runPromise(Effect.exit(Stream.runCollect(seam.follow!(NAME))));
  assert.equal(dialled._tag, 'Failure', `the port no one serves in this test is dialled, and the dial fails: ${String(dialled)}`);
  assert.deepEqual(asked, [BEARER], 'the holder that came up is dialled, with no engine rebuilt and nothing restarted');
});

test('REFUSED at the follow: an entry with a key other than `card`, and a card that does not decode — and nothing is dialled', async () => {
  const ops = handOps() as SeamOps;
  const card = cardJsonOf(servedCardOf('claude', ops, URL_AT));
  const asked: string[] = [];
  const credentials = (scheme: string) => {
    asked.push(scheme);
    return 'tok-1';
  };
  const failed = async (agent: unknown) => {
    const seam = holderSeamOf(() => agent as never, 'claude', credentials, ops);
    const exit = await Effect.runPromise(Effect.exit(Stream.runCollect(seam.follow!(NAME))));
    assert.equal(exit._tag, 'Failure', `the follow fails: ${JSON.stringify(exit)}`);
    return String(exit);
  };
  assert.match(await failed({ url: 'http://a.example' }), /takes `card` and nothing else, and was given `url`/);
  assert.match(await failed({ card: { ...card, supportedInterfaces: [] } }), /has no card this runtime reads: its `supportedInterfaces` /);
  assert.deepEqual(asked, [], 'and nothing was dialled: no credential was ever asked for');
});

test('REFUSED before the engine builds: a holder named for a harness it does not run, and one it does not run attached', () => {
  const card = cardJsonOf(servedCardOf('claude', handOps(), URL_AT));
  const place = { harnesses: ['claude', 'reviewer', 'stand'], claude: true };
  assert.match(
    holderRefusal('codex', place)!,
    /`holder` names the `codex` harness, which this engine does not run: it runs `claude`, `reviewer`, `stand`\./,
  );
  for (const other of ['reviewer', 'stand']) {
    assert.match(
      holderRefusal(other, { ...place, claude: false })!,
      /which this engine does not run as Claude Code attached/,
      `${other}: a harness whose sessions no process of ours holds — a remote agent's, a detached one's — is no holder`,
    );
  }
  assert.equal(holderRefusal('claude', place), undefined, 'and the name of a harness it runs attached is taken');
  assert.equal(holderAgentRefusal('claude', { card }), undefined, 'as is the card a holder served');
});

test('REFUSED at the follow: what a holder function answers that this runtime cannot dial', () => {
  const card = cardJsonOf(servedCardOf('claude', handOps(), URL_AT));
  assert.match(holderAgentRefusal('claude', { url: 'http://a.example' })!, /takes `card` and nothing else, and was given `url`/);
  assert.match(holderAgentRefusal('claude', 'a-card')!, /takes `card` and nothing else, and was given a string/);
  assert.match(
    holderAgentRefusal('claude', { card: { ...card, supportedInterfaces: [] } })!,
    /has no card this runtime reads: its `supportedInterfaces` /,
  );
});

test('REFUSED by the options, in their fixed order: a ceiling and a harness speak before a holder, and a holder before the rest', () => {
  const card = cardJsonOf(servedCardOf('claude', handOps(), URL_AT));
  const harnesses = { claude: 'claude' } as const;
  assert.equal(
    optionsRefusalOf({ harnesses, holder: { claude: () => ({ card }) } }),
    undefined,
    'a holder of a harness it runs, with the card it served',
  );
  assert.match(
    optionsRefusalOf({ harnesses, holder: { codex: () => ({ card }) } })!,
    /`holder` names the `codex` harness, which this engine does not run/,
  );
  assert.match(
    optionsRefusalOf({ harnesses: { claude: 'claude', reviewer: { url: 'https://a.example' } }, holder: { reviewer: () => ({ card }) } })!,
    /`holder` names the `reviewer` harness, which this engine does not run as Claude Code attached/,
  );
  assert.match(
    optionsRefusalOf({ harnesses: { claude: 'claude', stand: handOps() }, holder: { stand: () => ({ card }) } })!,
    /`holder` names the `stand` harness, which this engine does not run as Claude Code attached/,
    'a local harness that is not Claude Code attached is no holder either: its sessions are read off the store',
  );
  assert.equal(
    optionsRefusalOf({ holder: { claude: () => ({ card }) } }),
    undefined,
    'and an engine given no `harnesses` at all is read against the ones it will run, which have `claude` among them',
  );
  assert.match(
    optionsRefusalOf({ maxConcurrent: 0, harnesses, holder: { codex: () => ({ card }) } })!,
    /is not a ceiling/,
    'the ceiling speaks first, before any harness or holder',
  );
  assert.match(
    optionsRefusalOf({ harnesses: { claude: 'claude', other: { ...handOps(), pool: '' } }, holder: { codex: () => ({ card }) } })!,
    /names the `pool`/,
    'then the harnesses, before any holder',
  );
  assert.match(
    optionsRefusalOf({ harnesses, holder: { codex: () => ({ card }) }, unschedulable: 'yes' as never })!,
    /`holder` names the `codex` harness/,
    'then the holders, before `unschedulable`, `credentials`, `missingCredential` and the telemetry',
  );
});

test('an engine given no `harnesses` builds with a holder of the `claude` harness it runs by default', () => {
  const card = cardJsonOf(servedCardOf('claude', handOps(), URL_AT));
  const engine = builtEngine(
    Engine.layer({ root: scratch('ae-holder-default-'), holder: { claude: () => ({ card }) }, credentials: () => 'tok-1' }),
  );
  assert.equal(typeof engine.follow, 'function', 'the engine built: a holder is read against the harnesses it will run, not against none');
});

test('heldHarnessesOf: the harnesses configured as the literal `claude` and no other', () => {
  assert.deepEqual(
    heldHarnessesOf({
      claude: 'claude',
      second: 'claude',
      bg: 'claude-bg',
      reviewer: { url: 'https://a.example' },
      made: { name: 'made', command: () => ({ cmd: 'echo', args: [] }) },
      stand: handOps(),
    }),
    ['claude', 'second'],
    'a `claude-bg`, a remote agent’s, a detached one’s and a runner brought as its own are none of them held',
  );
  assert.deepEqual(heldHarnessesOf({}), [], 'and a configuration with none holds none');
});

test('an engine with no `claude` harness serves nothing: its `hold()` answers null', async () => {
  const engine = builtEngine(Engine.layer({ root: scratch('ae-holds-none-'), harnesses: { bg: 'claude-bg', stand: handOps() } }));
  const held = await Effect.runPromise(Effect.scoped(engine.hold()));
  assert.equal(held, null, 'there is nothing one process holds attached, so there is no port to serve');
});
