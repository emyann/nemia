/**
 * The board's writes decode the api's answers where they enter (the objects' client, src/lib/api/objects.ts): an answer that does not
 * decode is refused as one this board does not read — never as a refusal of the api's, since the write may be done — with the route, the
 * first wrong key, what was there, what to look at before writing again and the fix; a key the board does not know is dropped; a refusal
 * of the api's stays in its words and status, as the family's own class where it has one. A refusal fixture per family of writes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Resumed } from 'objects';
import { ReadRefusal, UnreadAnswer, WriteRefusal } from '../src/lib/api/read.ts';
import { call, write, type Refuse } from '../src/lib/api/objects.ts';
import { liftHold, pruneRun, putHold, removeRun } from '../src/lib/api/runs.ts';
import { approveStep, askRound, askTry, sayToStep } from '../src/lib/api/asks.ts';
import { dropCard, fileCard, queueCard, startCard } from '../src/lib/api/inbox.ts';
import { AgentRefusal, createAgent, removeAgent, tryAgent, type AgentDraft } from '../src/lib/api/agents.ts';
import { copySkill, saveSkill, SkillRefusal, type SkillDraft } from '../src/lib/api/skills.ts';
import { BuildRefusal, saveWorkflow, startRun } from '../src/lib/api/workflows.ts';
import { stepSpec, workflow, workflowObject } from './library-fixtures.ts';

/** Every request answered with `body` — as JSON, or as it is when a string — with `status`, for the length of the test: what was sent. */
function answering(t: { after: (fn: () => void) => void }, body: unknown, status = 200, statusText = '') {
  const before = globalThis.fetch;
  const sent: Array<{ url: string; init: RequestInit | undefined }> = [];
  globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(url), init });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, statusText });
  };
  t.after(() => {
    globalThis.fetch = before;
  });
  return sent;
}

/** A request's body as text: the objects' client sends its JSON as bytes. */
const text = (body: BodyInit | null | undefined): string | undefined =>
  body === undefined || body === null || typeof body === 'string' ? (body ?? undefined) : new TextDecoder().decode(body as Uint8Array);

const FIX =
  'The board and the api were built apart: restart the api (npm run dev) and rebuild the board (npm run build), then reload the page.';

/**
 * Whether `err` is an `UnreadAnswer` of `route` and no refusal of the api's: its message names the route, `at`, what was found there, `may`
 * and the fix, in that order.
 */
const unread = (route: string, at: string, found: string, may: string) => (err: unknown) => {
  assert.ok(err instanceof UnreadAnswer, String(err));
  assert.ok(!(err instanceof WriteRefusal) && !(err instanceof ReadRefusal), String(err));
  assert.equal(err.route, route);
  assert.ok(err.message.startsWith(`${route} answered what this board does not read: at ${at}, the value ${found}`), err.message);
  assert.ok(err.message.endsWith(`${may} ${FIX}`), err.message);
  return true;
};

/** The error `promise` rejects with; fails where it resolves. */
const rejection = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    (value) => assert.fail(`resolved with ${JSON.stringify(value)}`),
    (err: unknown) => err,
  );

const MAY = 'The thing may be written: look at it before writing it again.';

/** A pause as the api answers one. */
const PAUSE = { at: '2026-11-09T10:00:00.000Z', by: 'ann' };

/** A pause put through the objects' client (`POST /api/pause`), built as `refuse` says where the api refuses it. */
const pause = (refuse?: Refuse) => call((c) => c.server.pause({ payload: { why: 'merging' } }), write(Resumed, MAY, undefined, refuse));

/** A pause lifted through the objects' client (`DELETE /api/pause`): a write whose endpoint takes no body, sent `{}`. */
const resume = () => call((c) => c.server.resume(), write(Resumed, MAY));

test("a write through the objects' client: sent as JSON, its answer decoded, and a refusal of the api's kept in its words and status", async (t) => {
  await t.test("a write is sent as JSON by its method, and resolves with the schema's keys alone", async (t) => {
    const sent = answering(t, { pause: PAUSE, colour: 'blue' }, 201);
    assert.deepEqual(await pause(), { pause: PAUSE });
    const [{ url, init }] = sent as [(typeof sent)[number]];
    assert.deepEqual(
      [url, init?.method, new Headers(init?.headers).get('content-type'), text(init?.body)],
      ['/api/pause', 'POST', 'application/json', '{"why":"merging"}'],
    );
    await resume();
    assert.deepEqual(
      [new Headers(sent[1]?.init?.headers).get('content-type'), text(sent[1]?.init?.body)],
      ['application/json', '{}'],
      'a write with no body sends `{}` as JSON',
    );
  });
  await t.test(
    'REFUSED: a 2xx answer without a key the board reads is an UnreadAnswer naming the route, the key, the may words and the fix',
    async (t) => {
      answering(t, { lifted: true }, 201);
      await assert.rejects(pause(), unread('POST /api/pause', 'pause', 'is missing.', MAY));
      answering(t, { pause: { ...PAUSE, by: 7 } });
      await assert.rejects(resume(), unread('DELETE /api/pause', 'pause.by', 'is 7, where the board reads string.', MAY));
    },
  );
  await t.test(
    "REFUSED: a 2xx answer that is not JSON is refused at the answer itself, and never built as the caller's refusal",
    async (t) => {
      answering(t, '<html>ok</html>');
      await assert.rejects(
        pause((words, status) => new SkillRefusal(words, status)),
        unread('POST /api/pause', 'the answer', 'is undefined, where the board reads object', MAY),
      );
    },
  );
  await t.test("REFUSED: a write the api refused rejects in its words and status, a WriteRefusal, or the caller's class", async (t) => {
    answering(t, { error: 'changed since' }, 409);
    const err = await rejection(pause());
    assert.ok(err instanceof WriteRefusal && !(err instanceof ReadRefusal), String(err));
    assert.equal(err.message, 'changed since');
    assert.equal(err.status, 409);

    answering(t, '<html>Bad Gateway</html>', 502, 'Bad Gateway');
    const gateway = await rejection(resume());
    assert.ok(gateway instanceof WriteRefusal, String(gateway));
    assert.match(gateway.message, /^DELETE \/api\/pause answered 502/);

    answering(t, { error: 'taken', users: ['a'] }, 409);
    const built = await rejection(pause((words, status, body) => new AgentRefusal(words, [JSON.stringify(body)], status)));
    assert.ok(built instanceof AgentRefusal, String(built));
    assert.deepEqual([built.message, built.users, built.status], ['taken', ['{"error":"taken","users":["a"]}'], 409]);
  });
});

const agentDraft: AgentDraft = {
  name: 'implementer',
  role: null,
  description: null,
  skills: null,
  harnessPrompt: null,
  mcp: null,
  keys: {},
  body: '',
};

const skillDraft: SkillDraft = { name: 's', title: null, description: 'd', tags: [], examples: [], preload: false, body: '' };

test("each family of writes: its answer decoded, an answer unread refused with what to look at, and a refusal kept in the api's words and class", async (t) => {
  await t.test(
    'runs: a prune resolves with its lines and how many places were left; a removal and a lift with their answers',
    async (t) => {
      const sent = answering(t, {
        id: 'r-1',
        pruned: true,
        lines: ['removed /w/a'],
        worktrees: [{ path: '/w/a', bytes: 10 }],
        artifacts: null,
        left: [{ path: '/w/b', git: 'locked' }],
      });
      assert.deepEqual(await pruneRun('acme', 'r 1', { artifacts: false, unmerged: true }), {
        id: 'r 1',
        pruned: true,
        lines: ['removed /w/a'],
        left: 1,
      });
      assert.deepEqual(
        [sent[0]?.url, JSON.parse(text(sent[0]?.init?.body) ?? '')],
        ['/api/namespaces/acme/runs/r%201/prune', { artifacts: false, unmerged: true }],
      );
      const removed = answering(t, { id: 'r-1', removed: true, engine: null });
      assert.deepEqual(await removeRun('default', 'r-1'), { id: 'r-1', removed: true, engine: null });
      assert.deepEqual([removed[0]?.url, removed[0]?.init?.method], ['/api/namespaces/default/runs/r-1', 'DELETE']);
      const hold = { at: 'now', until: ['a-1'] };
      const lifted = answering(t, { id: 'r-1', lifted: true, hold });
      assert.deepEqual(await liftHold('default', 'r-1'), { id: 'r-1', lifted: true, hold });
      assert.deepEqual([lifted[0]?.url, lifted[0]?.init?.method], ['/api/namespaces/default/runs/r-1/hold', 'DELETE']);
    },
  );
  await t.test(
    "REFUSED: runs — a prune whose left is a count, a removal whose removed is a word; a refusal in the package's words",
    async (t) => {
      answering(t, { id: 'r-1', pruned: true, lines: [], worktrees: [], artifacts: null, left: 2 });
      await assert.rejects(
        pruneRun('default', 'r-1', { artifacts: false, unmerged: false }),
        unread('POST /api/namespaces/default/runs/r-1/prune', 'left', 'is 2, where the board reads array', 'before pruning it again.'),
      );
      answering(t, { id: 'r-1', removed: 'yes', engine: null });
      const err = await rejection(removeRun('default', 'r-1'));
      assert.ok(err instanceof UnreadAnswer && err.message.includes('at removed, the value is "yes"'), String(err));
      answering(t, { error: 'r-1 is still running: cancel it first.' }, 409);
      const refused = await rejection(removeRun('default', 'r-1'));
      assert.ok(refused instanceof WriteRefusal && refused.status === 409, String(refused));
    },
  );
  await t.test(
    'runs: a hold is put with the runs it waits on and its why, a blank why not sent, and resolves with the hold the api wrote',
    async (t) => {
      const hold = { at: '2026-10-06T12:00:00.000Z', until: ['a-1', 'b-2'], why: 'conflicts', by: 'ann' };
      const sent = answering(t, { id: 'r-1', lifted: false, hold, file: '/runs/r-1.hold' });
      assert.deepEqual(await putHold('acme', 'r 1', ['a-1', 'b-2'], 'conflicts'), { id: 'r-1', lifted: false, hold });
      assert.deepEqual(
        [sent[0]?.url, sent[0]?.init?.method, text(sent[0]?.init?.body)],
        ['/api/namespaces/acme/runs/r%201/hold', 'POST', '{"until":["a-1","b-2"],"why":"conflicts"}'],
      );
      const blank = answering(t, { id: 'r-1', lifted: false, hold: { at: 'now', until: ['a-1'] } });
      assert.deepEqual(await putHold('default', 'r-1', ['a-1'], '  '), { id: 'r-1', lifted: false, hold: { at: 'now', until: ['a-1'] } });
      assert.equal(text(blank[0]?.init?.body), '{"until":["a-1"]}');
    },
  );
  await t.test("REFUSED: runs — a hold without the runs it waits on is unread; a refusal in the package's words", async (t) => {
    answering(t, { id: 'r-1', lifted: false, hold: { at: 'now' } });
    const bare = await rejection(putHold('default', 'r-1', ['a-1'], ''));
    assert.ok(bare instanceof UnreadAnswer && bare.message.includes('before holding it again.'), String(bare));
    answering(t, { error: 'r-1 waits on a-1, and a-1 already waits on r-1.' }, 409);
    const refused = await rejection(putHold('default', 'r-1', ['a-1'], ''));
    assert.ok(refused instanceof WriteRefusal && refused.status === 409, String(refused));
  });
  await t.test("REFUSED: asks — an approval whose time is a number; the api's 422 kept word for word", async (t) => {
    answering(t, { step: 'plan', try: 1, at: 7, message: null, file: '/f' }, 202);
    await assert.rejects(
      approveStep('default', 'r-1', 'plan', {}),
      unread(
        'POST /api/namespaces/default/runs/r-1/steps/plan/approve',
        'at',
        'is 7, where the board reads string',
        'before approving again.',
      ),
    );
    answering(t, { step: 'plan', try: 1, at: 'now', message: null, file: '/f', extra: 1 }, 202);
    assert.deepEqual(await approveStep('default', 'r-1', 'plan', {}), { try: 1, at: 'now', message: null, file: '/f' });
    const words = 'plan is not waiting at its gate: it is running.';
    answering(t, { error: words }, 422);
    for (const ask of [
      askTry('default', 'r-1', 'plan', { mode: 'continue' }),
      askRound('default', 'r-1', 'review', {}),
      approveStep('default', 'r-1', 'plan', {}),
      sayToStep('default', 'r-1', 'plan', 'hi'),
    ]) {
      const err = await rejection(ask);
      assert.ok(err instanceof WriteRefusal && err.status === 422, String(err));
    }
  });
  await t.test('REFUSED: inbox — a queued card answered with a state the board does not know, a drop answered with no card', async (t) => {
    const card = {
      apiVersion: 'nemia/v1',
      kind: 'Card',
      metadata: { name: 'a', namespace: 'default', creationTimestamp: 'now', resourceVersion: 'v' },
      spec: {},
      status: { state: 'filed', runs: [], inPlay: true },
    };
    answering(t, { ...card, status: { state: 'parked', runs: [], inPlay: true } });
    await assert.rejects(
      queueCard({ name: 'a', factory: null }),
      unread('POST /api/namespaces/default/cards/a/queue', 'status.state', 'is "parked", where the board reads', 'before asking again.'),
    );
    answering(t, { removed: true, file: '/i/a.md' });
    await assert.rejects(
      dropCard({ name: 'a', factory: null }),
      unread('DELETE /api/namespaces/default/cards/a', 'apiVersion', 'is missing.', 'before dropping it again.'),
    );
    answering(t, card);
    assert.equal(await dropCard({ name: 'a', factory: null }), undefined);
    answering(t, { ...card, metadata: { ...card.metadata, name: 7 } }, 201);
    await assert.rejects(
      fileCard({ body: 'x' }),
      unread('POST /api/namespaces/default/cards', 'metadata.name', 'is 7, where the board reads string', 'before filing it again.'),
    );
  });
  await t.test(
    "REFUSED: workflows — a start whose id is a number; a card's start resolves to its run and its card, without the keys the board does not read",
    async (t) => {
      const asked = { workflow: 'dev', from: 'repo' as const, brief: 'b' };
      answering(t, { id: 7 }, 201);
      await assert.rejects(
        startRun(asked),
        unread(
          'POST /api/namespaces/default/runs',
          'id',
          'is 7, where the board reads string',
          'look on the Runs page before starting it again.',
        ),
      );
      answering(t, { id: 'r', card: 'c', ignoredRepo: '/x' }, 201);
      assert.deepEqual(await startCard({ name: 'c', factory: null }, asked), { id: 'r', card: 'c' });
      const tree = answering(t, { id: 'r' }, 201);
      await startRun({ ...asked, from: 'factory' });
      assert.equal(
        (JSON.parse(text(tree[0]?.init?.body) ?? '') as { from: string }).from,
        'repo',
        "a factory's own workflow is started as the start's route reads its tree",
      );
    },
  );
  await t.test(
    'REFUSED: agents — a save answered with an empty agent is unread, not saved; a refusal keeps its users and status',
    async (t) => {
      const sent = answering(t, {}, 201);
      const err = await rejection(createAgent({ ...agentDraft, keys: { model: 'opus', tools: null, effort: undefined } }));
      assert.ok(err instanceof UnreadAnswer && !(err instanceof AgentRefusal), String(err));
      assert.ok(
        /^POST \/api\/namespaces\/default\/agents answered what this board does not read: at [\w.]+, the value is missing\./.test(
          err.message,
        ),
        err.message,
      );
      assert.ok(err.message.includes('The agent may be written'), err.message);
      assert.deepEqual(JSON.parse(String(sent[0]?.init?.body)), {
        metadata: { name: 'implementer' },
        spec: {
          role: null,
          description: null,
          keys: { model: 'opus', tools: null },
          skills: null,
          harnessPrompt: null,
          mcp: null,
          instructions: '',
        },
      });

      const removing = answering(t, { error: 'build/implement still names implementer.', users: ['build/implement'] }, 409);
      const named = await rejection(removeAgent('implementer', 'v1'));
      assert.ok(named instanceof AgentRefusal, String(named));
      assert.deepEqual([named.message, named.users, named.status], ['build/implement still names implementer.', ['build/implement'], 409]);
      assert.deepEqual(
        [removing[0]?.init?.method, removing[0]?.url],
        ['DELETE', '/api/namespaces/default/agents/implementer?resourceVersion=v1'],
        'the version it was read at is its query',
      );
      answering(t, { error: 'another site' }, 403);
      const cross = await rejection(tryAgent('implementer', 'brief'));
      assert.ok(cross instanceof AgentRefusal, String(cross));
      assert.deepEqual([cross.users, cross.status], [[], 403]);
      answering(t, { removed: 'all' });
      await assert.rejects(
        removeAgent('implementer', 'v1'),
        (e: unknown) => e instanceof UnreadAnswer && e.route === 'DELETE /api/namespaces/default/agents/implementer',
      );
    },
  );
  await t.test('REFUSED: skills — a save answered without its skill is unread, never a SkillRefusal; a 409 is one', async (t) => {
    const sent = answering(t, { written: [] });
    const err = await rejection(saveSkill('s', 'v1', skillDraft));
    assert.ok(err instanceof UnreadAnswer && !(err instanceof SkillRefusal), String(err));
    assert.equal(err.route, 'PUT /api/namespaces/default/skills/s');
    assert.ok(err.message.includes('The skill may be written'), err.message);
    assert.deepEqual(JSON.parse(String(sent[0]?.init?.body)), {
      metadata: { resourceVersion: 'v1' },
      spec: { title: null, description: 'd', tags: [], examples: [], preload: false, body: '' },
    });
    answering(t, { error: 's changed since it was read.' }, 409);
    const changed = await rejection(saveSkill('s', 'v1', skillDraft));
    assert.ok(changed instanceof SkillRefusal && changed.status === 409, String(changed));
    answering(t, { skill: null, written: [] }, 201);
    await assert.rejects(
      copySkill('s'),
      (e: unknown) => e instanceof UnreadAnswer && e.route === 'POST /api/namespaces/default/skills/s/copy',
    );
  });
  await t.test(
    'REFUSED: builder — a save answered with no workflow is unread; a refusal keeps its steps and status; a step is sent as its file writes it',
    async (t) => {
      const [own] = workflow().steps;
      const bare = {
        name: 'note',
        spec: stepSpec({ agent: null, harness: 'claude', model: null, after: [], tools: null }),
        body: 'Say it.',
        own: null,
      };
      const save = { version: 'v1', steps: [own, bare], schemas: [] };
      const sent = answering(t, { ...workflowObject(), status: null });
      await assert.rejects(
        saveWorkflow('w', save),
        unread('PUT /api/namespaces/default/workflows/w', 'status', 'is null, where the board reads', 'before writing it again.'),
      );
      const { spec, metadata } = JSON.parse(String(sent[0]?.init?.body)) as { spec: { steps: unknown[] }; metadata: unknown };
      assert.deepEqual(metadata, { resourceVersion: 'v1' }, 'the version it was read at');
      assert.deepEqual(
        spec.steps,
        [
          { name: 'ship', keys: { agent: own?.spec.agent, workspace: 'base', slot: 'none', gate: true }, body: 'Land it.' },
          {
            name: 'note',
            keys: Object.fromEntries(Object.entries(bare.spec).filter(([, v]) => v !== null && !(Array.isArray(v) && v.length === 0))),
            body: 'Say it.',
          },
        ],
        'a step with an agent sends its agent, the keys it sets itself and its own note; one with none, every key it sets and its body',
      );
      assert.equal(Object.hasOwn(spec, 'readme'), false, 'a README unchanged is not sent');
      answering(t, { error: 'a and b wait on each other.', steps: ['a', 'b'] }, 422);
      const cycle = await rejection(saveWorkflow('w', save));
      assert.ok(cycle instanceof BuildRefusal, String(cycle));
      assert.deepEqual([cycle.message, cycle.steps, cycle.status], ['a and b wait on each other.', ['a', 'b'], 422]);
    },
  );
});
