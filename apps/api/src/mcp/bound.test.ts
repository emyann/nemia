/**
 * What a host reads off the MCP port, on a store of a planted size: every list tool's answer, called with no more than its path,
 * stays under the port's bound (`ANSWER_BOUND`); `ls` answers a run a line, as `nemia ls -o wide` prints them, a page at a time;
 * `inbox` the cards still in play unless asked for every one, a card a line and never its body, which `inbox_card` reads; a list of
 * long items is asked a page short enough to fit; `closeout` and `try` read a closeout narrowly, its output's fields asked by name;
 * and a read that is no page, past the bound, is refused with how to narrow it, never cut. The bound's own decision is proved by its
 * contract (`contracts/answer-fit.contract.ts`); refusal words are not asserted, only that they name a way.
 *
 * On the stand-ins: the runtime's test engine, its tasks filed and settled by hand, and the test place, under the records this file
 * seeds; driven by the SDK's own `Client`, as `port.test.ts` drives it.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Layer } from 'effect';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import { CLI_VERBS, Informer, informerMemo, TABLE, TokenDoor, tokenDoorFiles } from 'agent-orchestrator';
import { Api } from 'objects';
import { appOver, eachTest, engineFor } from '../../test/placed.ts';
import { ANSWER_BOUND, PORT_PAGE } from './bound.ts';
import { portTools } from './tools.ts';

const stand = eachTest(testPlace);
const standIn = eachTest(testEngine);
const engine = () => engineFor(standIn());
const informer = eachTest(() => informerMemo());
const app = eachTest(() => appOver(standIn(), stand(), Layer.succeed(Informer)(informer())));

/** A token of the person's, minted for this file through the package's token door. */
const personToken = Effect.runSync(
  Effect.gen(function* () {
    return yield* (yield* TokenDoor).persons.mint('bound-laptop');
  }).pipe(Effect.provide(tokenDoorFiles(root))),
);

/** `n` characters of words, so no text compresses to nothing. */
const words = (n: number, seed: string): string => `${seed} `.repeat(Math.ceil(n / (seed.length + 1))).slice(0, n);

const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

/** A run's record: `steps` steps of `bodySize`-character instructions, each step's task its own where `tasked`, from `card` where given. */
const record = (id: string, steps: number, bodySize: number, tasked: boolean, card?: string) => ({
  id,
  repo: '/code/app',
  workspace: '/code/app',
  baseRef: 'abc123',
  branch: 'main',
  isolate: true,
  brief: words(2_000, `brief of ${id}`),
  workflowDir: path.join(root, 'no-such-workflow'),
  createdAt: '2026-11-11T09:00:00.000Z',
  workflow: Array.from({ length: steps }, (_, i) => ({
    name: `step-${i}`,
    after: i === 0 ? [] : [`step-${i - 1}`],
    body: words(bodySize, `step ${i} of ${id}`),
    harness: 'claude',
  })),
  steps: Object.fromEntries(Array.from({ length: steps }, (_, i) => [`step-${i}`, { taskId: tasked ? `t-${id}-${i}` : null }])),
  ...(card === undefined ? {} : { from: { inbox: card } }),
});

const BIG_RUNS = Array.from({ length: 30 }, (_, i) => `r-big-${String(i).padStart(2, '0')}`);
const PARKED = Array.from({ length: 20 }, (_, i) => `parked-${String(i).padStart(2, '0')}`);
const ENDED = Array.from({ length: 10 }, (_, i) => `ended-${String(i).padStart(2, '0')}`);
const CARD_BODY = (name: string) => words(3_000, `the body of ${name}`);
const LONG_CLOSEOUT = 'r-long-closeout';
const WIDE_CLOSEOUT = 'r-wide-closeout';

for (const id of BIG_RUNS) write(path.join(root, 'runs', `${id}.json`), JSON.stringify(record(id, 8, 20_000, false)));
for (const name of [...PARKED, ...ENDED]) write(path.join(root, 'inbox', `${name}.md`), `# ${name}\n\n${CARD_BODY(name)}\n`);
for (const name of ENDED) write(path.join(root, 'runs', `r-${name}.json`), JSON.stringify(record(`r-${name}`, 1, 100, true, name)));
write(path.join(root, 'runs', `${LONG_CLOSEOUT}.json`), JSON.stringify(record(LONG_CLOSEOUT, 1, 100, true)));
/** A step whose output declares two fields, `plan` long and `budget` short, as a design's closeout carries them. */
const wide = record(WIDE_CLOSEOUT, 1, 100, true);
write(
  path.join(root, 'runs', `${WIDE_CLOSEOUT}.json`),
  JSON.stringify({
    ...wide,
    workflow: wide.workflow.map((step) => ({
      ...step,
      output: {
        file: 'design.json',
        schema: {
          type: 'object',
          properties: { plan: { type: 'string' }, budget: { type: 'number' } },
          required: ['plan', 'budget'],
          additionalProperties: false,
        },
      },
    })),
  }),
);
/** How long each planted agent's one-line description is: a page of `PORT_PAGE` of their lines is past the bound. */
const AGENT_DESCRIPTION = Math.ceil((ANSWER_BOUND * 1.5) / PORT_PAGE);
for (let i = 0; i < 20; i++)
  write(
    path.join(root, 'workflows', 'agents', `agent-${String(i).padStart(2, '0')}.md`),
    `---\nharness: claude\ndescription: ${words(AGENT_DESCRIPTION, `described ${i}`)}\n---\n${words(8_000, `agent ${i}`)}\n`,
  );

/**
 * Each ended card's run, its one task settled failed; the long closeout's task settled with 60,000 characters it carries as it came (its
 * `raw`, which `tries` answers whole); the wide closeout's with a long field of its output.
 */
const settled = () => {
  for (const name of ENDED) {
    Effect.runSync(engine().file({ id: `t-r-${name}-0`, brief: 'Do it.', cwd: '/code/app', harness: 'claude' }));
    standIn().settle(`t-r-${name}-0`, 'failed', { exitCode: 1 });
  }
  Effect.runSync(engine().file({ id: `t-${LONG_CLOSEOUT}-0`, brief: 'Do it.', cwd: '/code/app', harness: 'claude' }));
  standIn().settle(`t-${LONG_CLOSEOUT}-0`, 'succeeded', {
    exitCode: 0,
    closeout: { outcome: 'done', summary: 'Wrote a lot.', needs: null, artifacts: [], body: words(60_000, 'a long account') },
  });
  Effect.runSync(engine().file({ id: `t-${WIDE_CLOSEOUT}-0`, brief: 'Do it.', cwd: '/code/app', harness: 'claude' }));
  standIn().settle(`t-${WIDE_CLOSEOUT}-0`, 'succeeded', {
    exitCode: 0,
    closeout: { outcome: 'done', summary: 'Planned.', needs: null, artifacts: [], plan: words(30_000, 'a wide plan'), budget: 30 },
  });
};

/**
 * The SDK's client connected to `/mcp` of this file's app, presenting the person's token: by `initialize` (the legacy era, the client's
 * default), or pinned to the modern revision where `modern`.
 */
async function connected(modern = false): Promise<Client> {
  const on = app();
  const client = new Client(
    { name: 'bound-test', version: '0.0.0' },
    modern ? { versionNegotiation: { mode: { pin: '2026-07-28' } } } : {},
  );
  await client.connect(
    new StreamableHTTPClientTransport(new URL('http://127.0.0.1:8787/mcp'), {
      fetch: async (url: string | URL, init?: RequestInit) => on.request(url, init),
      requestInit: { headers: { authorization: `Bearer ${personToken}` } },
    }),
  );
  return client;
}

/** A tool's result as the host reads it: its text, whether it is an error, its structured content, and the characters it holds. */
async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const content = Array.isArray(result.content) ? (result.content as { type: string; text?: string }[]) : [];
  const text = content.map((c) => c.text ?? '').join('');
  const structured = result.structuredContent;
  return {
    text,
    isError: result.isError === true,
    structured,
    size: text.length + (structured === undefined ? 0 : JSON.stringify(structured).length),
  };
}

test('every list tool, called with its path alone on a store of a planted size, answers within the bound', async () => {
  settled();
  const client = await connected();
  const lists = portTools(TABLE, CLI_VERBS, Api).filter((t) => t.queryKeys.includes('limit'));
  assert.ok(lists.length >= 5, `${lists.length} list tools read off the tables`);
  for (const tool of lists) {
    const args = Object.fromEntries(tool.pathKeys.map((key) => [key, 'default']));
    const answer = await call(client, tool.name, args);
    assert.equal(answer.isError, false, `${tool.name} answers: ${answer.text.slice(0, 300)}`);
    assert.ok(answer.size <= ANSWER_BOUND, `${tool.name} answered ${answer.size} characters`);
  }
});

for (const modern of [false, true])
  test(`${modern ? '2026-07-28' : '2025-11-25'}: ls answers a run a line, its status, cost, waits and steps among the columns, a page at a time with the token of the next`, async () => {
    settled();
    const client = await connected(modern);
    assert.equal(client.getProtocolEra(), modern ? 'modern' : 'legacy');
    const first = await call(client, 'ls');
    const lines = first.text.split('\n');
    const header = lines[0] ?? '';
    for (const column of ['NAME', 'STATUS', 'COST', 'WAITS', 'STEPS']) assert.ok(header.includes(column), `the header names ${column}`);
    assert.equal(first.structured, undefined, 'the lines alone, never the runs as objects');
    const more = lines.at(-1) ?? '';
    const token = /continue (\S+)$/.exec(more)?.[1];
    assert.ok(token, `a last line names the next page's token: ${more}`);
    const runLines = (text: string) => text.split('\n').filter((l) => l.startsWith('r-'));
    assert.equal(runLines(first.text).length, PORT_PAGE, 'a page of the port, where the call gives no limit');
    const names = new Set(runLines(first.text).map((l) => l.split(' ')[0]));
    for (let next: string | undefined = token; next !== undefined;) {
      const page = await call(client, 'ls', { continue: next });
      for (const l of runLines(page.text)) names.add(l.split(' ')[0]);
      next = /continue (\S+)$/.exec(page.text.split('\n').at(-1) ?? '')?.[1];
    }
    for (const id of BIG_RUNS) assert.ok(names.has(id), `${id} is listed on some page`);
  });

test('inbox answers the cards in play alone unless asked for every one, a card a line and never its body; inbox_card reads one whole', async () => {
  settled();
  const client = await connected();
  const listed = (text: string) => new Set(text.split('\n').flatMap((l) => (/^(parked|ended)-/.test(l) ? [l.split(' ')[0]] : [])));
  const inPlay = new Set<string>();
  const every = new Set<string>();
  for (const [into, args] of [
    [inPlay, {}],
    [every, { fieldSelector: '' }],
  ] as const) {
    let next: string | undefined;
    do {
      const page = await call(client, 'inbox', { ...args, limit: 50, ...(next === undefined ? {} : { continue: next }) });
      assert.equal(page.isError, false, page.text.slice(0, 300));
      assert.ok(!page.text.includes('the body of'), 'no card body is answered in a list');
      for (const name of listed(page.text)) into.add(name);
      next = /continue (\S+)$/.exec(page.text.split('\n').at(-1) ?? '')?.[1];
    } while (next !== undefined);
  }
  assert.deepEqual([...inPlay].sort(), PARKED, 'the cards in play, and none whose run ended');
  assert.deepEqual([...every].sort(), [...ENDED, ...PARKED].sort(), 'every card, asked with an empty field selector');
  const one = await call(client, 'inbox_card', { name: 'parked-03' });
  assert.equal(one.isError, false, one.text.slice(0, 300));
  assert.ok(one.text.includes(CARD_BODY('parked-03').slice(0, 200)), "a card's read answers its file as written");
});

test('a list of long lines with no limit is asked a page short enough to fit, the rest left to its token', async () => {
  const client = await connected();
  const answer = await call(client, 'agents', { namespace: 'default' });
  assert.equal(answer.isError, false, answer.text.slice(0, 300));
  const agentLines = answer.text.split('\n').filter((l) => l.startsWith('agent-'));
  assert.ok(agentLines.length > 0 && agentLines.length < PORT_PAGE, `${agentLines.length} agents on the page`);
  assert.ok(/continue (\S+)$/.test(answer.text.split('\n').at(-1) ?? ''), 'the token of the next page');
  assert.ok(answer.size <= ANSWER_BOUND, `${answer.size} characters`);
});

test('agents answers an agent a line, its name, origin and description among the columns, and never its instructions', async () => {
  const client = await connected();
  const answer = await call(client, 'agents', { namespace: 'default', limit: 2 });
  assert.equal(answer.isError, false, answer.text.slice(0, 300));
  assert.equal(answer.structured, undefined, 'the lines alone, never the agents as objects');
  const [header = '', ...rest] = answer.text.split('\n');
  for (const column of ['NAME', 'ORIGIN', 'DESCRIPTION']) assert.ok(header.includes(column), `the header names ${column}`);
  const agentLines = rest.filter((l) => l.startsWith('agent-'));
  assert.equal(agentLines.length, 2, 'an agent a line');
  assert.ok(agentLines[0]?.includes('described 0'), 'its description');
  assert.ok(!answer.text.includes('agent 0 agent 0'), 'nothing of its instructions');
});

test('REFUSED: a read that is no page, past the bound, is an error naming how to narrow it, short, with nothing of the body', async () => {
  settled();
  const client = await connected();
  const answer = await call(client, 'tries', { runId: LONG_CLOSEOUT, step: 'step-0' });
  assert.equal(answer.isError, true, `refused: ${answer.size} ${answer.text.slice(0, 400)}`);
  assert.ok(answer.text.length < 2_000, `${answer.text.length} characters of refusal`);
  assert.equal(answer.structured, undefined, 'no body carried');
  assert.ok(!answer.text.includes('a long account'), 'nothing of the answer');
  assert.ok(/narrow/.test(answer.text), 'it says how to narrow the read');
});

test("closeout and try answer a closeout narrowly, its output's fields named and left out, each asked for by name", async () => {
  settled();
  const client = await connected();
  const whole = await app().request(`/api/runs/${WIDE_CLOSEOUT}/steps/step-0/tries/1/closeout`);
  assert.ok((await whole.text()).length > ANSWER_BOUND, 'the closeout read whole is past the bound');
  for (const tool of ['closeout', 'try']) {
    const narrow = await call(client, tool, { runId: WIDE_CLOSEOUT, step: 'step-0', try: '1' });
    assert.equal(narrow.isError, false, narrow.text.slice(0, 300));
    assert.ok(narrow.size <= ANSWER_BOUND, `${tool} answered ${narrow.size} characters`);
    const read = narrow.structured as { closeout: { summary: string; output: object; outputLeftOut: string[] } };
    assert.equal(read.closeout.summary, 'Planned.', `${tool}: what a person decides on is answered`);
    assert.deepEqual(read.closeout.output, {}, `${tool}: no output field unless named`);
    assert.deepEqual(read.closeout.outputLeftOut.sort(), ['budget', 'plan'], `${tool}: the fields left out are named`);
    const asked = await call(client, tool, { runId: WIDE_CLOSEOUT, step: 'step-0', try: '1', fields: 'budget' });
    const named = asked.structured as { closeout: { output: object; outputLeftOut: string[] } };
    assert.deepEqual([named.closeout.output, named.closeout.outputLeftOut], [{ budget: 30 }, ['plan']], `${tool}: a field asked by name`);
  }
});
