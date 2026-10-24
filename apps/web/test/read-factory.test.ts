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
import {
  clearRules,
  factoriesQuery,
  factoryInstructionQuery,
  factoryRulesQuery,
  fireAgent,
  hireAgent,
  writeInstruction,
  writeRules,
  type Factory,
  type FactoryInstruction,
  type FactoryRules,
} from '../src/lib/api/factories.ts';
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
const readInstruction = factoryInstructionQuery('mill').queryFn as unknown as () => Promise<FactoryInstruction>;
const readRules = factoryRulesQuery('mill').queryFn as unknown as () => Promise<FactoryRules>;

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

/** The factories as `GET /api/factories` answers them: the default one, one attached with a hire, and one whose file does not read. */
const factories = (): Factory[] => [
  {
    name: 'default',
    default: true,
    repos: ['/work/repo'],
    workflows: null,
    hires: {},
    error: null,
    schedules: [],
    commands: {
      attach: 'nemia factory attach default <workflow>',
      rm: 'nemia factory rm default',
      add: 'nemia factory add default --repo <path>',
      schedule: 'nemia factory schedule default <workflow> --cron <expr> --brief <text>',
      trust: 'nemia factory trust default',
    },
    untrusted: [],
    template: null,
  },
  {
    name: 'nemia',
    default: false,
    repos: ['/work/repo'],
    workflows: ['build'],
    hires: { 'build/implement': 'ada' },
    error: null,
    schedules: [
      {
        workflow: 'janitor',
        cron: '0 9 * * 1',
        tz: 'America/Montreal',
        brief: 'Read the stats',
        repo: null,
        next: '2026-10-12T13:00:00.000Z',
        last: { run: 'read-the-stats-k2xq', at: '2026-10-05T13:00:02.000Z' },
        refused: null,
        commands: { unschedule: 'nemia factory unschedule nemia janitor' },
      },
      {
        workflow: 'build',
        cron: '*/5 * * * *',
        tz: null,
        brief: 'Build it',
        repo: '/work/repo',
        next: null,
        last: null,
        refused: 'build is not attached to nemia',
        commands: { unschedule: 'nemia factory unschedule nemia build' },
      },
    ],
    commands: {
      attach: 'nemia factory attach nemia <workflow>',
      rm: 'nemia factory rm nemia',
      add: 'nemia factory add nemia --repo <path>',
      schedule: 'nemia factory schedule nemia <workflow> --cron <expr> --brief <text>',
      trust: 'nemia factory trust nemia',
    },
    untrusted: [
      { place: '/work/repo', harness: 'A harness', withheld: 'the allow rules of its own settings', never: null },
      { place: '/home/me', harness: 'A harness', withheld: 'the allow rules of its own settings', never: 'no trust is kept for a home' },
    ],
    template: null,
  },
  {
    name: 'broken',
    default: false,
    repos: [],
    workflows: [],
    hires: {},
    error: '/wf/factories/broken.json is not JSON',
    schedules: [],
    commands: {
      attach: 'nemia factory attach broken <workflow>',
      rm: 'nemia factory rm broken',
      add: 'nemia factory add broken --repo <path>',
      schedule: 'nemia factory schedule broken <workflow> --cron <expr> --brief <text>',
      trust: 'nemia factory trust broken',
    },
    untrusted: [],
    template: null,
  },
];

/** A factory made from a template, its tree applied at an older version than the one wanted. */
const shaped = (): Factory => ({
  ...factories()[1],
  name: 'shaped',
  template: {
    source: '/drafts/team',
    version: 'v2',
    params: { repo: '/work/repo', retries: 2, gated: true },
    applied: 'v1',
    conditions: [
      { type: 'Applied', status: 'False', reason: 'VersionDrift', message: 'the template is at v2, and its tree was applied at v1' },
      { type: 'ConflictsPending', status: 'False', reason: 'None', message: 'nothing to merge' },
    ],
  },
});

/** A factory's instruction as the api answers it: kept in the store, with words. */
const instruction: FactoryInstruction = {
  name: 'mill',
  path: null,
  store: true,
  file: '/home/me/.agent-workflows/factories/mill/NEMIA.md',
  words: 'Keep it short.\n',
  error: null,
  stored: true,
};

/** A factory's rules as the api answers them: kept in its file, with words. */
const rules: FactoryRules = {
  name: 'mill',
  file: '/home/me/.agent-workflows/factories/mill/RULES.md',
  words: 'Never push on a Friday.',
  error: null,
};

test("get, the Factory's and the inbox's reads: each decodes what the api gives, keeps out what it leaves out, drops what the board does not read, and keeps a refusal of the api's", async (t) => {
  await t.test(
    'each read of the Factory and the inbox decodes an answer the api gives, as it gave it, each union in its every shape',
    async (t) => {
      const bare = without(inboxEntry({ name: 'bare', startedAs: [], state: 'filed' }), 'queued', 'tried');
      const odd = inboxEntry({
        name: 'notes.txt',
        title: null,
        workflow: null,
        repo: null,
        error: 'not a card',
        body: null,
        filedAt: null,
      });
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
        capabilities({
          steps: [declared, codexReach(), stepReach({ from: 'yours', allowed: { ...stepReach().allowed, askDenier: null } })],
        }),
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
    },
  );
  await t.test('what the api leaves out stays out: an inbox entry never queued nor tried', async (t) => {
    answering(t, [without(inboxEntry(), 'queued', 'tried')]);
    const [entry] = await readInbox();
    assert.equal(Object.hasOwn(entry, 'queued'), false);
    assert.equal(Object.hasOwn(entry, 'tried'), false);

    answering(t, without(cardPage(), 'queued'));
    const page = await readCard();
    assert.equal(Object.hasOwn(page, 'queued'), false);
    assert.equal(Object.hasOwn(page, 'tried'), true);
  });
  await t.test(
    'a key the api sends that the board does not read is dropped, not refused: a card gate, a harness unread, a colour',
    async (t) => {
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
  await t.test(
    'the factories decode as the api gives them, every key kept: the default offering every workflow, a hire, a file that does not read',
    async (t) => {
      answering(t, factories());
      assert.deepEqual(await readFactories(), factories());
    },
  );
  await t.test(
    "a templated factory's template decodes as the api gives it, its parameters of every kind and each condition; one not rendered yet, with none",
    async (t) => {
      answering(t, [shaped()]);
      assert.deepEqual(await readFactories(), [shaped()]);
      const unrendered = { ...shaped(), template: { ...shaped().template!, applied: null, conditions: [] } };
      answering(t, [unrendered]);
      assert.deepEqual(await readFactories(), [unrendered]);
    },
  );
  await t.test("the inbox keeps each card's factory, null for the default factory's; REFUSED: an entry without it", async (t) => {
    answering(t, [inboxEntry(), inboxEntry({ factory: null })]);
    assert.deepEqual(
      (await readInbox()).map((e) => e.factory),
      ['nemia', null],
    );

    answering(t, [without(inboxEntry(), 'factory')]);
    await assert.rejects(readInbox(), unread('/api/inbox', '[0].factory', 'is missing'));
  });
  await t.test('the last pass reads with what it saw, and one an older tick wrote without it stays without', async (t) => {
    const seen = ceilings({ pass: passCost({ runs: 43, tasks: 3, queued: 1, admitted: 2 }) });
    answering(t, seen);
    assert.deepEqual(await readCeilings(), seen);
    answering(t, ceilings());
    assert.equal(Object.hasOwn((await readCeilings()).pass ?? {}, 'runs'), false);
  });
  await t.test(
    "a factory's instruction reads as the api gives it, kept in the store or in a folder with no file there yet; a write's answer the same",
    async (t) => {
      answering(t, instruction);
      assert.deepEqual(await readInstruction(), instruction);
      const folder = { ...instruction, path: 'docs/NEMIA.md', store: false, file: '/src/mill/docs/NEMIA.md', words: null, stored: false };
      answering(t, folder);
      assert.deepEqual(await readInstruction(), folder);
      answering(t, instruction);
      assert.deepEqual(await writeInstruction('mill', 'Keep it short.'), instruction);
    },
  );
  await t.test(
    "a factory's rules read as the api gives them: with words, with none, and with why a file cannot be told; a write's answer and a clear's the same",
    async (t) => {
      answering(t, rules);
      assert.deepEqual(await readRules(), rules);
      const none = { ...rules, words: null };
      answering(t, none);
      assert.deepEqual(await readRules(), none);
      const untold = { ...rules, words: '---\nmodel: x\n---', error: 'RULES.md opens with a frontmatter block: start it with a word.' };
      answering(t, untold);
      assert.deepEqual(await readRules(), untold);
      answering(t, rules);
      assert.deepEqual(await writeRules('mill', 'Never push on a Friday.'), rules);
      answering(t, { ...none, removed: true });
      assert.deepEqual(await clearRules('mill'), none, "whether a file was removed is not the board's to read");
    },
  );
});

test("REFUSED, get, the Factory's and the inbox's reads: an answer the board does not read, refused at its key with the fix", async (t) => {
  await t.test(
    "REFUSED, the inbox: a try that does not say whether it was refused, and a card's key row whose value is no word",
    async (t) => {
      const tried = without(inboxEntry().tried ?? assert.fail('the fixture has a try'), 'refused');
      answering(t, [inboxEntry({ tried })]);
      await assert.rejects(readInbox(), unread('/api/inbox', '[0].tried.refused', 'is missing'));

      answering(t, cardPage({ keys: [{ key: 'repo', value: 7 as never, meaning: 'The repository.' }] }));
      await assert.rejects(readCard(), unread('/api/inbox/x', 'keys[0].value', '7, where'));
    },
  );
  await t.test('REFUSED, the capabilities: what asks denied by a person, and a step whose fence names no list of servers', async (t) => {
    answering(t, capabilities({ steps: [stepReach({ allowed: { ...stepReach().allowed, askDenier: 'a person' as never } })] }));
    await assert.rejects(readCapabilities(), unread('/api/capabilities', 'steps[0].allowed.askDenier', '"a person", where'));

    answering(t, capabilities({ steps: [stepReach({ fence: { ...stepReach().fence, mcp: null as never } })] }));
    await assert.rejects(readCapabilities(), unread('/api/capabilities', 'steps[0].fence.mcp', 'null, where'));

    const named = capabilities({ steps: [stepReach({ fence: { ...stepReach().fence, mcp: ['playwright', 'docs'] } })] });
    answering(t, named);
    assert.deepEqual((await readCapabilities()).steps[0].fence.mcp, ['playwright', 'docs'], 'the servers its agent names, read as names');
  });
  await t.test('REFUSED, the quota: a state the board has no word for, and a window used as a sentence', async (t) => {
    answering(t, quota({ state: 'resting' as never }));
    await assert.rejects(readQuota(), unread('/api/quota', 'state', '"resting", where'));

    answering(t, quota({ windows: [{ ...quota().windows[0], usedPercentage: '50%' as never }] }));
    await assert.rejects(readQuota(), unread('/api/quota', 'windows[0].usedPercentage', '"50%", where the board reads number'));
  });
  await t.test(
    "REFUSED, the ceilings: an older daemon's pass, its place phase still called git, and runs in flight counted as a number",
    async (t) => {
      const pass = passCost();
      const { place, ...rest } = pass.phases;
      answering(t, ceilings({ pass: { ...pass, phases: { ...rest, git: place } as never } }));
      await assert.rejects(readCeilings(), unread('/api/ceilings', 'pass.phases.place', 'is missing'));

      answering(t, ceilings({ inFlight: 3 as never }));
      await assert.rejects(readCeilings(), unread('/api/ceilings', 'inFlight', '3, where'));
    },
  );
  await t.test('REFUSED, the daemon: a kind the package has no word for, and an identity it cannot have', async (t) => {
    answering(t, daemon({ kind: 'sleeping' as never }));
    await assert.rejects(readDaemon(), unread('/api/daemon', 'kind', '"sleeping", where'));

    answering(t, daemon({ identity: 'maybe' as never }));
    await assert.rejects(readDaemon(), unread('/api/daemon', 'identity', '"maybe", where'));
  });
  await t.test("REFUSED, a factory's template: one without it, and a condition whose state is neither True nor False", async (t) => {
    answering(t, [without(factories()[1], 'template')]);
    await assert.rejects(readFactories(), unread('/api/factories', '[0].template', 'is missing'));

    const maybe = shaped();
    maybe.template!.conditions[0] = { ...maybe.template!.conditions[0], status: 'Unknown' as never };
    answering(t, [maybe]);
    await assert.rejects(readFactories(), unread('/api/factories', '[0].template.conditions[0].status', '"Unknown", where'));
  });
  await t.test(
    "REFUSED, a factory's trust: one without its untrusted places, a place without what is withheld, and no line that trusts",
    async (t) => {
      answering(t, [without(factories()[1], 'untrusted')]);
      await assert.rejects(readFactories(), unread('/api/factories', '[0].untrusted', 'is missing'));

      answering(t, [{ ...factories()[1], untrusted: [without(factories()[1].untrusted[0], 'withheld')] }]);
      await assert.rejects(readFactories(), unread('/api/factories', '[0].untrusted[0].withheld', 'is missing'));

      answering(t, [{ ...factories()[1], commands: without(factories()[1].commands, 'trust') }]);
      await assert.rejects(readFactories(), unread('/api/factories', '[0].commands.trust', 'is missing'));
    },
  );
  await t.test(
    'REFUSED, the factories: one without its error, the default offering its workflows as a word, and a schedule without its refusal',
    async (t) => {
      answering(t, [without(factories()[1], 'error')]);
      await assert.rejects(readFactories(), unread('/api/factories', '[0].error', 'is missing'));

      answering(t, [{ ...factories()[0], workflows: 'all' }]);
      await assert.rejects(readFactories(), unread('/api/factories', '[0].workflows', '"all", where'));

      answering(t, [{ ...factories()[1], schedules: [without(factories()[1].schedules[0], 'refused')] }]);
      await assert.rejects(readFactories(), unread('/api/factories', '[0].schedules[0].refused', 'is missing'));
    },
  );
  await t.test(
    "REFUSED, a factory's instruction: one that does not say whether the store keeps it, and one whose words are left out",
    async (t) => {
      answering(t, without(instruction, 'store'));
      await assert.rejects(readInstruction(), unread('/api/factories/mill/instruction', 'store', 'is missing'));
      answering(t, without(instruction, 'words'));
      await assert.rejects(readInstruction(), unread('/api/factories/mill/instruction', 'words', 'is missing'));
    },
  );
  await t.test(
    "REFUSED, a factory's rules: an answer whose words are left out, and one that does not say whether its file can be told",
    async (t) => {
      answering(t, without(rules, 'words'));
      await assert.rejects(readRules(), unread('/api/factories/mill/rules', 'words', 'is missing'));
      answering(t, without(rules, 'error'));
      await assert.rejects(readRules(), unread('/api/factories/mill/rules', 'error', 'is missing'));
    },
  );
});

test("a factory's writes: its rules, a hire and a fire, each at its own route, each name one segment", async (t) => {
  await t.test("a factory's rules are written and cleared at the factory's own route, its name one segment", async (t) => {
    const before = globalThis.fetch;
    const sent: Array<{ method: string; url: string; body: unknown }> = [];
    globalThis.fetch = async (input, init) => {
      sent.push({ method: init?.method ?? 'GET', url: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return new Response(JSON.stringify(rules), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    t.after(() => {
      globalThis.fetch = before;
    });
    await factoryRulesQuery('the mill').queryFn?.({} as never);
    await writeRules('the mill', 'Never push.');
    await clearRules('the mill');
    assert.deepEqual(sent, [
      { method: 'GET', url: '/api/factories/the%20mill/rules', body: undefined },
      { method: 'PUT', url: '/api/factories/the%20mill/rules', body: { words: 'Never push.' } },
      { method: 'DELETE', url: '/api/factories/the%20mill/rules', body: {} },
    ]);
  });
  await t.test("a hire and a fire are sent to the step's hire, the step one segment, and read back as the api answers them", async (t) => {
    const sent: Array<{ url: string; method: string | undefined; body: unknown }> = [];
    const before = globalThis.fetch;
    let answer: unknown = { file: '/f/mill.json', replaced: null };
    globalThis.fetch = async (input, init) => {
      sent.push({ url: String(input), method: init?.method, body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify(answer), { headers: { 'content-type': 'application/json' } });
    };
    t.after(() => {
      globalThis.fetch = before;
    });
    assert.deepEqual(await hireAgent('mill', 'build/implement', 'ada'), { file: '/f/mill.json', replaced: null });
    answer = { file: '/f/mill.json', fired: 'ada' };
    assert.deepEqual(await fireAgent('mill', 'build/implement'), { file: '/f/mill.json', fired: 'ada' });
    assert.deepEqual(sent, [
      { url: '/api/factories/mill/hires/build%2Fimplement', method: 'PUT', body: { agent: 'ada' } },
      { url: '/api/factories/mill/hires/build%2Fimplement', method: 'DELETE', body: {} },
    ]);
    answer = { file: '/f/mill.json' };
    await assert.rejects(hireAgent('mill', 'build/implement', 'ada'), (err: unknown) => {
      assert.ok(err instanceof UnreadAnswer, String(err));
      assert.ok(err.message.includes('at replaced, '), err.message);
      assert.ok(err.message.includes("read the step's page again before hiring or firing again"), err.message);
      return true;
    });
  });
});
