/**
 * Every refusal of a remote A2A agent that quotes what another party sent quotes a bounded piece of it (`quote` in `core/quote.ts`):
 * the card's addresses, bindings, schemes and requirements, a redirect's target, a status text, and the agent's own error words. Each
 * fixture hands the runtime a huge value where one is quoted, and reads the words an attempt or a verb ends in: the value's first
 * characters, the cut marked `…`, the runtime's own advice whole after it, and the whole sentence bounded.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import type { EngineShape, EngineOptions, TaskSpec, TaskView } from '../src/index.ts';
import { Engine as EngineService } from '../src/index.ts';
import { remoteOps } from '../src/a2a/remote.ts';
import { apiKey, bearer, remoteServer, type RemoteServer, type ServerOptions } from './remote-server.ts';
import { scratch } from './scratch.ts';
import { builtEngine } from './engine.ts';

/** A test agent for the row `t`, closed once the row ends. */
const serve = async (t: TestContext, o: ServerOptions = {}) => {
  const s = await remoteServer(o);
  t.after(() => s.close());
  return s;
};

const HELD = () => [{ state: 'working' as const }];
const BOUND = 1_000;
const HUGE = 100_000;

const task: TaskSpec = { brief: 'paint the fence', cwd: '/nowhere/in/particular', harness: 'remote', closeoutSchema: { type: 'object' } };

/** The first attempt of a task filed on an engine whose harness is `s`, once the task has settled. */
const attemptOn = async (s: RemoteServer, o: Partial<EngineOptions> = {}) => {
  const e: EngineShape = builtEngine(EngineService.layer({ root: scratch('ae-quote-'), harnesses: { remote: { url: s.url } }, ...o }));
  const id = await Effect.runPromise(e.file(task));
  let v: TaskView | undefined;
  for (let i = 0; i < 60 && v?.state.settled == null; i++) {
    await Effect.runPromise(e.tick());
    v = await Effect.runPromise(e.view(id));
    if (v.state.settled == null) await new Promise((r) => setTimeout(r, 15));
  }
  assert.ok(v?.state.settled, `${id} never settled`);
  return v.state.attempts[0];
};

/** The words an attempt ended in, asserted bounded. */
const boundedError = (a: { error?: string }): string => {
  const words = a.error ?? '';
  assert.ok(words.length < BOUND, `${words.length} characters`);
  return words;
};

/** Where `text` quotes `value` cut at `max`: its first `max` characters then `…`, and never the rest. */
const quotesCut = (text: string, value: string, max: number) => {
  assert.ok(text.includes(`${value.slice(0, max)}…`), text.slice(0, 400));
  assert.ok(!text.includes(value.slice(0, max + 1)), `more than ${max} characters of it are quoted`);
};

const realFetch = globalThis.fetch;
const urlOf = (input: string | URL | Request): string => (input instanceof Request ? input.url : String(input));

/**
 * `fetch` stubbed for the test: a request `answer` answers gets its response (or its throw), and every other one goes to the real
 * `fetch`. The test context restores it.
 */
const stubFetch = (t: TestContext, answer: (url: string, init: RequestInit | undefined) => Response | undefined) =>
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const r = answer(urlOf(input), init);
    return r ?? realFetch(input, init);
  });

/** A JSON-RPC error for the call `init` carries, with `code` and `message`. */
const rpcError = (init: RequestInit | undefined, code: number, message: string): Response =>
  Response.json({ jsonrpc: '2.0', id: (JSON.parse(String(init?.body)) as { id: unknown }).id, error: { code, message } });

/** What a verb of `ops` failed with. */
const failed = <A>(effect: Effect.Effect<A, { message: string; refused?: boolean }>) => Effect.runPromise(Effect.flip(effect));

/** Each row: a value another party sent, made huge where a refusal quotes it, and the words that refusal ends in. */
const ROWS: Array<[string, (t: TestContext) => Promise<void>]> = [
  [
    "a card's interfaces on another origin are named as a bounded list: 10,000 of them quote 200 characters, and the advice follows",
    async (t) => {
      const urls = Array.from({ length: 10_000 }, (_, i) => `http://other.example/a2a/${i}`);
      const s = await serve(t, {
        script: HELD,
        cardJson: (c) => ({ ...c, supportedInterfaces: urls.map((url) => ({ url, protocolBinding: 'JSONRPC', protocolVersion: '1.0' })) }),
      });
      const a = await attemptOn(s);
      assert.equal(a.reason, 'unstartable');
      const words = boundedError(a);
      quotesCut(words, urls.join(', '), 200);
      assert.ok(words.includes(`…, and none is on ${s.url}, the origin the harness was given`), words);
      assert.match(words, /Nothing was sent\.$/);
      assert.equal(s.paths.length, 0);
    },
  ],
  [
    "a redirect's target is quoted to 200 characters, and the redirect's advice is still whole",
    async (t) => {
      const target = `http://127.0.0.1:9/${'r'.repeat(8_000)}`;
      const s = await serve(t, { security: apiKey('k'), redirectTo: target, script: HELD });
      const a = await attemptOn(s, { credentials: () => 'k' });
      assert.equal(a.reason, 'unstartable');
      const words = boundedError(a);
      assert.ok(words.includes('answered 307 to '), words);
      quotesCut(words, `${target}/a2a/jsonrpc`, 200);
      assert.ok(words.includes('…, and a redirect is not followed'), words);
      assert.match(words, /Nothing it was asked was done\.$/);
    },
  ],
  [
    "an API key's place, a scheme's name and an HTTP scheme's kind are each quoted to 60 characters",
    async (t) => {
      const where = 'q'.repeat(HUGE);
      const name = 'n'.repeat(HUGE);
      const kind = 'k'.repeat(HUGE);
      const http = {
        schemes: {
          h: { scheme: { $case: 'httpAuthSecurityScheme' as const, value: { description: '', scheme: kind, bearerFormat: '' } } },
        },
        requirements: [{ schemes: { h: { list: [] } } }],
        accepts: () => false,
      };
      const cases: Array<[ServerOptions, string, string, string]> = [
        [{ security: apiKey('k', where as never) }, where, 'is an API key in a ', ', and this runtime sends a key only in a header'],
        [
          { cardJson: (c) => ({ ...c, securityRequirements: [{ schemes: { [name]: {} } }] }) },
          name,
          '`',
          '` is not a scheme the card declares',
        ],
        [{ security: http }, kind, 'is HTTP `', '` authentication, and this runtime sends only `Bearer` and `Basic`'],
      ];
      for (const [o, value, before, after] of cases) {
        const s = await serve(t, { script: HELD, ...o });
        const a = await attemptOn(s, { credentials: () => 'a secret it has' });
        assert.equal(a.reason, 'unstartable');
        const words = boundedError(a);
        quotesCut(words, value, 60);
        assert.ok(words.includes(`${before}${value.slice(0, 60)}…${after}`), words);
        assert.equal(s.paths.length, 0);
      }
    },
  ],
  [
    "a card's bindings are quoted to 200 characters, and what this runtime speaks is still whole",
    async (t) => {
      const binding = 'B'.repeat(HUGE);
      const s = await serve(t, {
        script: HELD,
        cardJson: (c) => ({
          ...c,
          supportedInterfaces: [{ url: `${s.url}/a2a/jsonrpc`, protocolBinding: binding, protocolVersion: '1.0' }],
        }),
      });
      const a = await attemptOn(s);
      assert.equal(a.reason, 'unstartable');
      const words = boundedError(a);
      quotesCut(words, `${binding} 1.0`, 200);
      assert.ok(words.includes('…, and this runtime speaks JSON-RPC (`JSONRPC`) and REST (`HTTP+JSON`), at A2A 1.0'), words);
    },
  ],
  [
    'a card of 2,000 unmet requirements names the first 3 whole and how many more; one of 2,000 unmet schemes, the same',
    async (t) => {
      const names = Array.from({ length: 2_000 }, (_, i) => `absent-${i}`);
      const unmet = (n: string) => `\`${n}\` is not a scheme the card declares`;
      const cards: Array<[string, (c: Record<string, unknown>) => unknown, string]> = [
        ['requirements', (c) => ({ ...c, securityRequirements: names.map((n) => ({ schemes: { [n]: {} } })) }), '; or '],
        ['schemes', (c) => ({ ...c, securityRequirements: [{ schemes: Object.fromEntries(names.map((n) => [n, {}])) }] }), ', and '],
      ];
      for (const [what, cardJson, separator] of cards) {
        const s = await serve(t, { script: HELD, cardJson });
        const a = await attemptOn(s);
        assert.equal(a.reason, 'unstartable', what);
        const words = boundedError(a);
        assert.ok(
          words.includes(
            `asks for authentication this runtime cannot give: ${names.slice(0, 3).map(unmet).join(separator)}, and 1,997 more.`,
          ),
          words,
        );
        assert.ok(!words.includes(unmet(names[3])), what);
        assert.match(words, / Nothing was sent\.$/, what);
        assert.equal(s.paths.length, 0, what);
      }
    },
  ],
  [
    'a card the agent cannot serve: the fetch error and the status text are each quoted to 200 characters',
    async (t) => {
      const s = await serve(t, { script: HELD });
      const card = `${s.url}/.well-known/agent-card.json`;
      const said = 'm'.repeat(HUGE);
      const status = 'z'.repeat(8_000);
      const answers: Array<[() => Response, string, string]> = [
        [
          () => {
            throw new Error(said);
          },
          said,
          '): the agent is not reachable, and nothing was sent.',
        ],
        [() => new Response(null, { status: 404, statusText: status }), status, ', and nothing was sent.'],
      ];
      for (const [answer, value, end] of answers) {
        const stub = stubFetch(t, (url) => (url === card ? answer() : undefined));
        const ops = remoteOps('remote', { url: s.url }, scratch('ae-quote-'));
        const e = await failed(ops.spawn({ name: 'ae/card/1', brief: 'b', cwd: '/w' }));
        stub.mock.restore();
        assert.equal(e.refused, true);
        assert.ok(e.message.length < BOUND, `${e.message.length} characters`);
        quotesCut(e.message, value, 200);
        assert.ok(e.message.endsWith(`${value.slice(0, 200)}…${end}`), e.message);
      }
    },
  ],
  [
    'a status text the agent refuses auth in is quoted to 200 characters, and what to check is still whole',
    async (t) => {
      const s = await serve(t, { security: bearer('right'), script: HELD });
      const status = 'z'.repeat(8_000);
      stubFetch(t, (url) => (url.includes('/a2a/') ? new Response('{}', { status: 401, statusText: status }) : undefined));
      const ops = remoteOps('remote', { url: s.url }, scratch('ae-quote-'), () => 'wrong');
      const e = await failed(ops.spawn({ name: 'ae/auth/1', brief: 'b', cwd: '/w' }));
      assert.equal(e.refused, true);
      assert.ok(e.message.length < BOUND, `${e.message.length} characters`);
      quotesCut(e.message, status, 200);
      assert.ok(e.message.includes(`(401 ${status.slice(0, 200)}…): check what \`credentials\` gives for the schemes its card declares.`));
    },
  ],
  [
    "the agent's own error words are quoted to 200 characters: a send refused, a send in doubt, a stop that failed",
    async (t) => {
      const s = await serve(t, { script: HELD, bindings: ['JSONRPC'] });
      const said = 'w'.repeat(HUGE);
      const cases: Array<[number, (ops: ReturnType<typeof remoteOps>) => Promise<{ message: string; refused?: boolean }>, string]> = [
        [-32004, (ops) => failed(ops.spawn({ name: 'ae/refused/1', brief: 'b', cwd: '/w' })), '… Nothing was started.'],
        [
          -32603,
          (ops) => failed(ops.spawn({ name: 'ae/doubt/1', brief: 'b', cwd: '/w' })),
          '…): whether the agent made a Task of it is not known, and it is not sent twice.',
        ],
        [-32603, (ops) => failed(ops.stop('a-task-it-has')), '…'],
      ];
      for (const [code, verb, end] of cases) {
        const stub = stubFetch(t, (url, init) => (url.includes('/a2a/') ? rpcError(init, code, said) : undefined));
        const e = await verb(remoteOps('remote', { url: s.url }, scratch('ae-quote-')));
        stub.mock.restore();
        assert.ok(e.message.length < BOUND, `${code}: ${e.message.length} characters`);
        quotesCut(e.message, said, 200);
        assert.ok(e.message.endsWith(`${said.slice(0, 200)}${end}`), e.message.slice(-300));
        assert.equal(e.refused === true, code === -32004);
      }
    },
  ],
];

test("a remote agent's refusals: whatever another party sent is quoted cut at its bound and marked, and the advice after it is whole", async (t) => {
  for (const [name, run] of ROWS) await t.test(name, run);
});
