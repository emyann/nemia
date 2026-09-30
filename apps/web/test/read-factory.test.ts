/**
 * The Factory's and the inbox's reads decode the api's answers where they enter (`get`): the inbox and a card's page, what the repository
 * offers, the quota, the cap and the last pass, and the daemon. Each reads back what the api gave; each refuses an answer it does not read,
 * at the key, with the fix; a key the board does not read is dropped, and one the api leaves out stays out.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReadRefusal, UnreadAnswer } from '../src/lib/api/read.ts';
import { cardQuery, inboxQuery, type InboxCardPage, type InboxEntry } from '../src/lib/api/inbox.ts';
import { capabilitiesQuery, type Capabilities } from '../src/lib/api/capabilities.ts';
import { quotaQuery, type Quota } from '../src/lib/api/quota.ts';
import { ceilingsQuery, type Ceilings } from '../src/lib/api/ceilings.ts';
import { daemonQuery, type Daemon } from '../src/lib/api/daemon.ts';
import { factoriesQuery, type Factory } from '../src/lib/api/factories.ts';
import { capabilities, cardPage, ceilings, codexReach, daemon, inboxEntry, passCost, quota, stepReach } from './factory-fixtures.ts';

/** Every read answering `body` as JSON, with `status`, for the length of the test. */
function answering(t: { after: (fn: () => void) => void }, body: unknown, status = 200) {
  const before = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  t.after(() => {
    globalThis.fetch = before;
  });
}

const readInbox = inboxQuery.queryFn as unknown as () => Promise<InboxEntry[]>;
const readCard = cardQuery('x').queryFn as unknown as () => Promise<InboxCardPage>;
const readCapabilities = capabilitiesQuery.queryFn as unknown as () => Promise<Capabilities>;
const readQuota = quotaQuery.queryFn as unknown as () => Promise<Quota>;
const readCeilings = ceilingsQuery.queryFn as unknown as () => Promise<Ceilings>;
const readDaemon = daemonQuery.queryFn as unknown as () => Promise<Daemon>;
const readFactories = factoriesQuery.queryFn as unknown as () => Promise<Factory[]>;

/** Whether `err` is an `UnreadAnswer` of `route` whose message names `at`, what was found there, and the fix. */
const unread = (route: string, at: string, found: string) => (err: unknown) => {
  assert.ok(err instanceof UnreadAnswer, String(err));
  assert.equal(err.route, `GET ${route}`);
  assert.ok(err.message.startsWith(`GET ${route} answered what this board does not read`), err.message);
  assert.ok(err.message.includes(`at ${at}, `), err.message);
  assert.ok(err.message.includes(found), err.message);
  assert.ok(
    err.message.endsWith('restart the api (npm run dev) and rebuild the board (npm run build), then reload the page.'),
    err.message,
  );
  return true;
};

/** `value` without `keys`, as an api that does not send them answers. */
const without = <T extends object>(value: T, ...keys: string[]): T =>
  Object.fromEntries(Object.entries(value).filter(([k]) => !keys.includes(k))) as T;

test('each read of the Factory and the inbox decodes an answer the api gives, as it gave it, each union in its every shape', async (t) => {
  const bare = without(inboxEntry({ name: 'bare', startedAs: [] }), 'queued', 'tried');
  const odd = inboxEntry({ name: 'notes.txt', title: null, workflow: null, repo: null, error: 'not a card', body: null, filedAt: null });
  answering(t, [inboxEntry(), bare, { ...odd, queued: { at: odd.filedAt ?? 'x', place: null } }]);
  assert.deepEqual(await readInbox(), [inboxEntry(), bare, { ...odd, queued: { at: 'x', place: null } }]);
  for (const page of [cardPage(), cardPage({ keys: null })]) {
    answering(t, page);
    assert.deepEqual(await readCard(), page);
  }

  answering(t, capabilities());
  assert.deepEqual(await readCapabilities(), capabilities());
  const declared = stepReach({ tools: { ...(stepReach().tools ?? assert.fail('measured')), from: 'declared' } });
  answering(
    t,
    capabilities({ steps: [declared, codexReach(), stepReach({ from: 'yours', allowed: { ...stepReach().allowed, askDenier: null } })] }),
  );
  assert.deepEqual(
    (await readCapabilities()).steps.map((s) => [s.tools?.from, s.allowed.askDenier, s.from]),
    [
      ['declared', 'dontAsk', 'repo'],
      [undefined, 'a job', 'repo'],
      ['measured', null, 'yours'],
    ],
  );

  const asking = quota({
    state: 'asking',
    said: 'asking',
    windows: [],
    last: { askedAt: '2026-09-30T04:00:00.000Z', windows: quota().windows },
  });
  for (const q of [quota(), asking]) {
    answering(t, q);
    assert.deepEqual(await readQuota(), q);
  }

  for (const c of [ceilings(), ceilings({ last: null, inFlight: null, pass: null, held: [] })]) {
    answering(t, c);
    assert.deepEqual(await readCeilings(), c);
  }

  const none = daemon({ kind: 'none', ticking: false, pid: null, cwd: null, every: null, startedAt: null, passedAt: null });
  const silent = { ...none, lastHeardAt: null, stoppedAt: null, staleAfterMs: null, identity: null, line: 'no wf up' };
  for (const d of [daemon(), silent]) {
    answering(t, d);
    assert.deepEqual(await readDaemon(), d);
  }
});

test('what the api leaves out stays out: an inbox entry never queued nor tried', async (t) => {
  answering(t, [without(inboxEntry(), 'queued', 'tried')]);
  const [entry] = await readInbox();
  assert.equal(Object.hasOwn(entry, 'queued'), false);
  assert.equal(Object.hasOwn(entry, 'tried'), false);

  answering(t, without(cardPage(), 'queued'));
  const page = await readCard();
  assert.equal(Object.hasOwn(page, 'queued'), false);
  assert.equal(Object.hasOwn(page, 'tried'), true);
});

test('a key the api sends that the board does not read is dropped, not refused: a card gate, a harness unread, a colour', async (t) => {
  answering(t, [{ ...inboxEntry(), gate: 'plan' }]);
  const [entry] = await readInbox();
  assert.equal(Object.hasOwn(entry, 'gate'), false);
  assert.deepEqual(entry, inboxEntry());

  const pass = passCost();
  answering(t, ceilings({ pass: { ...pass, harnesses: { claude: { ...pass.harnesses.claude, unread: 2 } as never } } }));
  const read = await readCeilings();
  assert.equal(Object.hasOwn(read.pass?.harnesses.claude ?? {}, 'unread'), false);
  assert.deepEqual(read, ceilings());

  answering(t, capabilities({ steps: [{ ...stepReach(), colour: 'blue' } as never] }));
  const offered = await readCapabilities();
  assert.equal(Object.hasOwn(offered.steps[0], 'colour'), false);
  assert.deepEqual(offered, capabilities({ steps: [stepReach()] }));
});

test("REFUSED, the inbox: a try that does not say whether it was refused, and a card's key row whose value is no word", async (t) => {
  const tried = without(inboxEntry().tried ?? assert.fail('the fixture has a try'), 'refused');
  answering(t, [inboxEntry({ tried })]);
  await assert.rejects(readInbox(), unread('/api/inbox', '[0].tried.refused', 'is missing'));

  answering(t, cardPage({ keys: [{ key: 'repo', value: 7 as never, meaning: 'The repository.' }] }));
  await assert.rejects(readCard(), unread('/api/inbox/x', 'keys[0].value', '7, where'));
});

test('REFUSED, the capabilities: what asks denied by a person, and a step whose fence names a server', async (t) => {
  answering(t, capabilities({ steps: [stepReach({ allowed: { ...stepReach().allowed, askDenier: 'a person' as never } })] }));
  await assert.rejects(readCapabilities(), unread('/api/capabilities', 'steps[0].allowed.askDenier', '"a person", where'));

  answering(t, capabilities({ steps: [stepReach({ fence: { ...stepReach().fence, mcp: [] as never } })] }));
  await assert.rejects(readCapabilities(), unread('/api/capabilities', 'steps[0].fence.mcp', '[], where the board reads null'));
});

test('REFUSED, the quota: a state the board has no word for, and a window used as a sentence', async (t) => {
  answering(t, quota({ state: 'resting' as never }));
  await assert.rejects(readQuota(), unread('/api/quota', 'state', '"resting", where'));

  answering(t, quota({ windows: [{ ...quota().windows[0], usedPercentage: '50%' as never }] }));
  await assert.rejects(readQuota(), unread('/api/quota', 'windows[0].usedPercentage', '"50%", where the board reads number'));
});

test('REFUSED, the ceilings: a pass that leaves a phase out, and runs in flight counted as a number', async (t) => {
  const pass = passCost();
  answering(t, ceilings({ pass: { ...pass, phases: without(pass.phases, 'git') } }));
  await assert.rejects(readCeilings(), unread('/api/ceilings', 'pass.phases.git', 'is missing'));

  answering(t, ceilings({ inFlight: 3 as never }));
  await assert.rejects(readCeilings(), unread('/api/ceilings', 'inFlight', '3, where'));
});

test('REFUSED, the daemon: a kind the package has no word for, and an identity it cannot have', async (t) => {
  answering(t, daemon({ kind: 'sleeping' as never }));
  await assert.rejects(readDaemon(), unread('/api/daemon', 'kind', '"sleeping", where'));

  answering(t, daemon({ identity: 'maybe' as never }));
  await assert.rejects(readDaemon(), unread('/api/daemon', 'identity', '"maybe", where'));
});

test("a card the api refused still rejects in the api's words and status, not as an answer unread", async (t) => {
  answering(t, { error: 'no card x in the inbox' }, 404);
  const err: unknown = await readCard().then(
    () => assert.fail('a 404 was read'),
    (e: unknown) => e,
  );
  assert.ok(err instanceof ReadRefusal && !(err instanceof UnreadAnswer), String(err));
  assert.equal(err.status, 404);
  assert.equal(err.message, 'no card x in the inbox');
});

/** The factories as `GET /api/factories` answers them: the default one, one attached with a hire, and one whose file does not read. */
const factories = (): Factory[] => [
  { name: 'default', default: true, repos: ['/work/repo'], workflows: null, hires: {}, error: null },
  { name: 'nemia', default: false, repos: ['/work/repo'], workflows: ['build'], hires: { 'build/implement': 'ada' }, error: null },
  { name: 'broken', default: false, repos: [], workflows: [], hires: {}, error: '/wf/factories/broken.json is not JSON' },
];

test('the factories decode as the api gives them, every key kept: the default offering every workflow, a hire, a file that does not read', async (t) => {
  answering(t, factories());
  assert.deepEqual(await readFactories(), factories());
});

test('REFUSED, the factories: one without its error, and the default offering its workflows as a word', async (t) => {
  answering(t, [without(factories()[1], 'error')]);
  await assert.rejects(readFactories(), unread('/api/factories', '[0].error', 'is missing'));

  answering(t, [{ ...factories()[0], workflows: 'all' }]);
  await assert.rejects(readFactories(), unread('/api/factories', '[0].workflows', '"all", where'));
});

test("the inbox keeps each card's factory, null for the default factory's; REFUSED: an entry without it", async (t) => {
  answering(t, [inboxEntry(), inboxEntry({ factory: null })]);
  assert.deepEqual(
    (await readInbox()).map((e) => e.factory),
    ['nemia', null],
  );

  answering(t, [without(inboxEntry(), 'factory')]);
  await assert.rejects(readInbox(), unread('/api/inbox', '[0].factory', 'is missing'));
});
