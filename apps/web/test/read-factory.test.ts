/**
 * The Factory's and the inbox's reads decode the api's answers where they enter (`get`): the inbox and a card's page, what the repository
 * offers, the quota, the cap and the last pass, and the daemon: a key the board does not read is dropped, and one the api leaves out stays
 * out; a refusal of the api's stays in its words. Which keys each answer has is `objects`' own. A factory and its parts are read as
 * objects, and made the board's view of a factory in one place (`factoryViewOf`); a hire is written to its `Hire`, by its joined name.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReadRefusal, UnreadAnswer } from '../src/lib/api/read.ts';
import { cardQuery, inboxAllQuery, type InboxCardPage, type InboxEntry } from '../src/lib/api/inbox.ts';
import { capabilitiesQuery, type Capabilities } from '../src/lib/api/capabilities.ts';
import { ceilingsQuery, type Ceilings } from '../src/lib/api/ceilings.ts';
import { HEADER_MASK } from 'objects';
import {
  clearCostLine,
  clearRules,
  factoriesQuery,
  factoryRulesQuery,
  factoryServersQuery,
  factoryViewOf,
  fireAgent,
  hireAgent,
  recordServer,
  setCostLine,
  writeRules,
  type Factory,
  type FactoryRules,
  type FactoryServers,
} from '../src/lib/api/factories.ts';
import {
  capabilities,
  cardList,
  cardObject,
  ceilings,
  factoryCommands,
  factoryList,
  factoryObject,
  hireObject,
  inboxEntry,
  mcpServerList,
  mcpServerObject,
  passCost,
  scheduleList,
  scheduleObject,
  stepReach,
} from './factory-fixtures.ts';

/** Every read answering `body` as JSON, with `status`, for the length of the test. */
function answering(t: { after: (fn: () => void) => void }, body: unknown, status = 200) {
  const before = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  t.after(() => {
    globalThis.fetch = before;
  });
}

const readInbox = inboxAllQuery(undefined).queryFn as unknown as () => Promise<InboxEntry[]>;
const readCard = cardQuery('x').queryFn as unknown as () => Promise<InboxCardPage>;
const readCapabilities = capabilitiesQuery({}).queryFn as unknown as () => Promise<Capabilities>;
const readCeilings = ceilingsQuery.queryFn as unknown as () => Promise<Ceilings>;

/** A factory's rules as the api answers them: kept in its file, with words. */
const rules: FactoryRules = {
  name: 'mill',
  file: '/home/me/.agent-workflows/factories/mill/RULES.md',
  words: 'Never push on a Friday.',
  error: null,
};

test("get, the Factory's and the inbox's reads: each decodes what the api gives, keeps out what it leaves out, drops what the board does not read, and keeps a refusal of the api's", async (t) => {
  await t.test('what the api leaves out stays out: an inbox entry never queued nor tried', async (t) => {
    const { lastStart: _, ...untried } = cardObject().status;
    const { queued: __, ...unqueued } = cardObject().spec;
    answering(t, cardList({ ...cardObject(), spec: unqueued, status: untried }));
    const [entry] = await readInbox();
    assert.equal(Object.hasOwn(entry, 'queued'), false);
    assert.equal(Object.hasOwn(entry, 'tried'), false);

    answering(t, { ...cardObject({ status: { source: '---\nworkflow: build\n---\nDecode the reads\n' } }), spec: unqueued });
    const page = await readCard();
    assert.equal(Object.hasOwn(page, 'queued'), false);
    assert.equal(Object.hasOwn(page, 'tried'), true);
    assert.equal(page.source, '---\nworkflow: build\n---\nDecode the reads\n', 'its file as written, off status.source');
    assert.equal(page.keys?.find((row) => row.key === 'queued')?.value, null, 'its keys made of the Card');
  });
  await t.test(
    'a key the board does not read is dropped, not refused: on a card, on a harness of the last pass, on a step it offers',
    async (t) => {
      answering(t, cardList({ ...cardObject(), colour: 'blue' } as never));
      const [entry] = await readInbox();
      assert.equal(Object.hasOwn(entry, 'colour'), false);
      assert.deepEqual(entry, inboxEntry({ queued: { at: '2026-09-30T05:01:00.000Z', place: null } }), 'a started card has no place');

      const pass = passCost();
      answering(t, ceilings({ pass: { ...pass, harnesses: { claude: { ...pass.harnesses.claude, colour: 'blue' } as never } } }));
      const read = await readCeilings();
      assert.equal(Object.hasOwn(read.pass?.harnesses.claude ?? {}, 'colour'), false);
      assert.deepEqual(read, ceilings());

      answering(t, capabilities({ steps: [{ ...stepReach(), colour: 'blue' } as never] }));
      const offered = await readCapabilities();
      assert.equal(Object.hasOwn(offered.steps[0], 'colour'), false);
      assert.deepEqual(offered, capabilities({ steps: [stepReach()] }));
    },
  );
  await t.test("a card the api refused still rejects in the api's words and status, not as an answer unread", async (t) => {
    answering(t, { error: 'no card x in the inbox' }, 404);
    const err: unknown = await readCard().then(
      () => assert.fail('a 404 was read'),
      (e: unknown) => e,
    );
    assert.ok(err instanceof ReadRefusal && !(err instanceof UnreadAnswer), String(err));
    assert.equal(err.status, 404);
    assert.equal(err.message, 'no card x in the inbox');
  });
  await t.test('the last pass reads with what it saw, and one an older tick wrote without it stays without', async (t) => {
    const seen = ceilings({ pass: passCost({ runs: 43, tasks: 3, queued: 1, admitted: 2 }) });
    answering(t, seen);
    assert.deepEqual(await readCeilings(), seen);
    answering(t, ceilings());
    assert.equal(Object.hasOwn((await readCeilings()).pass ?? {}, 'runs'), false);
  });
  await t.test("a clear's answer reads with whether a file was removed, the FactoryRules' own key", async (t) => {
    answering(t, { ...rules, words: null, removed: true });
    assert.deepEqual(await clearRules('mill'), { ...rules, words: null, removed: true });
  });
});

/** Each request a test's reads and writes send: its method, its path and query, and its body where it has one. */
type Sent = { method: string; url: string; body: unknown };

/** Every request answered by `answer` of its path, its JSON with a 200, for the length of the test; what each sent, in `sent`. */
function serving(t: { after: (fn: () => void) => void }, answer: (url: string, method: string) => unknown): Sent[] {
  const sent: Sent[] = [];
  const before = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    sent.push({
      method,
      url,
      body: init?.body
        ? JSON.parse(typeof init.body === 'string' ? init.body : new TextDecoder().decode(init.body as Uint8Array))
        : undefined,
    });
    return new Response(JSON.stringify(answer(url, method)), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  t.after(() => {
    globalThis.fetch = before;
  });
  return sent;
}

const readFactories = factoriesQuery.queryFn as unknown as () => Promise<Factory[]>;
const readServers = factoryServersQuery('mill').queryFn as unknown as () => Promise<FactoryServers>;

/** The view of `mill` the fixtures make: what the pages drew from the old answer, key by key. */
const millView: Factory = {
  name: 'mill',
  default: false,
  repos: ['/work/mill'],
  workflows: ['build'],
  hires: { 'build/implement': 'implementer' },
  error: null,
  schedules: [
    {
      workflow: 'build',
      cron: '0 9 * * 1',
      tz: null,
      brief: 'The weekly build',
      repo: null,
      next: '2026-10-05T09:00:00.000Z',
      last: { run: 'r-1', at: '2026-09-28T09:00:00.000Z' },
      refused: null,
      commands: { unschedule: 'nemia unschedule mill build' },
    },
  ],
  commands: {
    attach: 'nemia factory attach mill <workflow>',
    rm: 'nemia factory rm mill',
    add: 'nemia factory add mill <repo>',
    schedule: 'nemia schedule mill <workflow> <cron>',
    trust: 'nemia factory trust mill',
    volume: 'nemia factory volume mill <path>',
  },
  template: null,
  untrusted: [],
  volumes: [{ path: '/home/me/notes', readOnly: true, commands: { rm: 'nemia factory volume rm mill notes' } }],
  costLines: {},
};

test("the factories are read as objects and made the pages' view: the Factory, its lines and its schedules", async (t) => {
  await t.test('factoryViewOf: a key the object leaves out is null, a volume its line by name, a schedule its own', () => {
    assert.deepEqual(factoryViewOf(factoryObject(), factoryCommands(), [scheduleObject()]), millView);
    assert.deepEqual(
      factoryViewOf(factoryObject({ spec: { costLines: { build: 80 } } }), factoryCommands()).costLines,
      { build: 80 },
      'the cost line it sets per workflow is carried on the view',
    );
    const templated = factoryObject({
      spec: { template: { source: 'sdlc', version: '1.0.0', params: {} }, workflows: undefined },
      status: {
        applied: '1.0.0',
        conditions: [{ type: 'Applied', status: 'True', reason: 'Rendered', message: 'rendered at 1.0.0' }],
        untrusted: [{ place: '/work/mill', harness: 'Claude Code', withheld: 'its hooks' }],
        error: 'mill.json does not read',
      },
    });
    const view = factoryViewOf(templated, factoryCommands());
    assert.deepEqual(view.template, {
      source: 'sdlc',
      version: '1.0.0',
      params: {},
      applied: '1.0.0',
      conditions: [{ type: 'Applied', status: 'True', reason: 'Rendered', message: 'rendered at 1.0.0' }],
    });
    assert.deepEqual(view.untrusted, [{ place: '/work/mill', harness: 'Claude Code', withheld: 'its hooks', never: null }]);
    assert.equal(view.error, 'mill.json does not read');
    assert.deepEqual(view.schedules, [], 'no schedules read, none drawn');
    assert.equal(factoryViewOf(factoryObject({ metadata: { name: 'default' } }), factoryCommands('default')).default, true);
  });
  await t.test("the query reads the list, then each factory's lines and, but for the default factory, its schedules", async (t) => {
    const sent = serving(t, (url) => {
      if (url.startsWith('/api/factories?') || url === '/api/factories')
        return factoryList(factoryObject({ metadata: { name: 'default' }, spec: { workflows: undefined } }), factoryObject());
      if (url === '/api/factories/default/commands') return factoryCommands('default');
      if (url === '/api/factories/mill/commands') return factoryCommands();
      if (url.startsWith('/api/namespaces/mill/schedules')) return scheduleList(scheduleObject());
      throw new Error(`no answer for ${url}`);
    });
    const [first, mill] = await readFactories();
    assert.equal(first?.default, true);
    assert.equal(first?.workflows, null, 'the default factory offers every workflow');
    assert.deepEqual(mill, millView);
    assert.deepEqual(
      sent.map((one) => `${one.method} ${one.url.split('?')[0]}`).sort(),
      [
        'GET /api/factories',
        'GET /api/factories/default/commands',
        'GET /api/factories/mill/commands',
        'GET /api/namespaces/mill/schedules',
      ],
      'no schedules asked of the default factory',
    );
  });
  await t.test('an answer that is no FactoryList is unread, naming where', async (t) => {
    serving(t, () => ({ apiVersion: 'nemia/v1', kind: 'FactoryList', metadata: {}, items: [{ ...factoryObject(), kind: 'Card' }] }));
    await assert.rejects(readFactories(), (err: unknown) => err instanceof UnreadAnswer);
  });
});

test("a factory's servers are McpServer objects beside Nemia's builtin ones, each header masked, and the mask is sent back as it came", async (t) => {
  const sent = serving(t, (url, method) => {
    if (url.startsWith('/api/namespaces/mill/mcpservers') && method === 'GET')
      return mcpServerList(mcpServerObject({ state: 'connected', tools: 3 }), {
        ...mcpServerObject(),
        metadata: { ...mcpServerObject().metadata, name: 'linear' },
      });
    if (url.startsWith('/api/builtin/mcpservers'))
      return mcpServerList({ ...mcpServerObject(), metadata: { name: 'github', creationTimestamp: 'x', resourceVersion: 'y' } });
    return mcpServerObject();
  });
  const read = await readServers();
  assert.deepEqual(
    read.servers.map((one) => [one.name, one.state, one.tools, one.headers]),
    [
      ['github', 'connected', 3, { 'X-MCP-Toolsets': HEADER_MASK }],
      ['linear', null, undefined, { 'X-MCP-Toolsets': HEADER_MASK }],
    ],
  );
  assert.deepEqual(
    read.builtin.map((one) => one.name),
    ['github'],
  );
  const [github] = read.servers;
  assert.ok(github);
  await recordServer('mill', 'github', { type: github.type, url: github.url, headers: { ...github.headers } });
  assert.deepEqual(sent.at(-1), {
    method: 'PUT',
    url: '/api/namespaces/mill/mcpservers/github',
    body: { type: 'http', url: 'https://api.githubcopilot.com/mcp/', headers: { 'X-MCP-Toolsets': HEADER_MASK } },
  });
});

test("a factory's writes: its rules, a hire and a fire, each at its own route, each name one segment", async (t) => {
  await t.test("a factory's rules are written and cleared at the factory's own route, its name one segment", async (t) => {
    const sent = serving(t, () => rules);
    await factoryRulesQuery('the mill').queryFn?.({} as never);
    await writeRules('the mill', 'Never push.');
    await clearRules('the mill');
    assert.deepEqual(sent, [
      { method: 'GET', url: '/api/factories/the%20mill/rules', body: undefined },
      { method: 'PUT', url: '/api/factories/the%20mill/rules', body: { words: 'Never push.' } },
      { method: 'DELETE', url: '/api/factories/the%20mill/rules', body: {} },
    ]);
  });
  await t.test("a cost line is set and cleared at its workflow's route under the factory, and read back as the Factory", async (t) => {
    const sent = serving(t, () => factoryObject({ spec: { costLines: { build: 80 } } }));
    assert.deepEqual((await setCostLine('the mill', 'build', 80)).spec.costLines, { build: 80 });
    await clearCostLine('the mill', 'build');
    assert.deepEqual(sent, [
      { method: 'PUT', url: '/api/factories/the%20mill/costlines/build', body: { usd: 80 } },
      { method: 'DELETE', url: '/api/factories/the%20mill/costlines/build', body: {} },
    ]);
  });
  await t.test("a hire and a fire are sent to the step's Hire, named <workflow>.<step>, and read back as the Hire", async (t) => {
    let answer: unknown = hireObject();
    const sent = serving(t, () => answer);
    assert.deepEqual(await hireAgent('mill', 'build/implement', 'implementer'), hireObject());
    answer = hireObject(undefined);
    assert.deepEqual(await fireAgent('mill', 'build/implement'), hireObject(undefined));
    assert.deepEqual(sent, [
      { url: '/api/namespaces/mill/hires/build.implement', method: 'PUT', body: { agent: 'implementer' } },
      { url: '/api/namespaces/mill/hires/build.implement', method: 'DELETE', body: {} },
    ]);
    answer = { file: '/f/mill.json', replaced: null };
    await assert.rejects(hireAgent('mill', 'build/implement', 'implementer'), (err: unknown) => {
      assert.ok(err instanceof UnreadAnswer, String(err));
      assert.ok(err.message.includes("read the step's page again before hiring or firing again"), err.message);
      return true;
    });
  });
});
