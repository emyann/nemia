/**
 * The board's writes decode the api's answers where they enter (`send`, src/lib/api/read.ts): an answer that does not decode is refused as
 * one this board does not read — never as a refusal of the api's, since the write may be done — with the route, the first wrong key, what
 * was there, what to look at before writing again and the fix; a key the board does not know is dropped; a refusal of the api's stays in
 * its words and status, as the family's own class where it has one. A refusal fixture per family of writes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { ReadRefusal, send, UnreadAnswer, WriteRefusal } from '../src/lib/api/read.ts';
import { liftHold, pruneRun, putHold, removeRun } from '../src/lib/api/runs.ts';
import { acceptLoop, approveStep, askRound, askTry, sayToStep } from '../src/lib/api/asks.ts';
import { dropCard, fileCard, queueCard } from '../src/lib/api/inbox.ts';
import { AgentRefusal, createAgent, removeAgent, tryAgent, type AgentDraft } from '../src/lib/api/agents.ts';
import { copySkill, saveSkill, SkillRefusal, type SkillDraft } from '../src/lib/api/skills.ts';
import { BuildRefusal, saveWorkflow, startRun } from '../src/lib/api/workflows.ts';

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

const Thing = Schema.Struct({ id: Schema.String });
const MAY = 'The thing may be written: look at it before writing it again.';

test("send: a write sent as JSON, its answer decoded, and a refusal of the api's kept in its words and status", async (t) => {
  await t.test("a write is sent as JSON by its method, and resolves with the schema's keys alone", async (t) => {
    const sent = answering(t, { id: 'x-1', colour: 'blue' }, 201);
    assert.deepEqual(await send('POST', '/api/x', Thing, { body: { a: 1 }, may: MAY }), { id: 'x-1' });
    const [{ url, init }] = sent as [(typeof sent)[number]];
    assert.deepEqual(
      [url, init?.method, new Headers(init?.headers).get('content-type'), init?.body],
      ['/api/x', 'POST', 'application/json', '{"a":1}'],
    );
    await send('DELETE', '/api/x', Thing, { may: MAY });
    assert.equal(sent[1]?.init?.body, undefined, 'a write with no body sends none');
  });
  await t.test(
    'REFUSED: a 2xx answer without a key the board reads is an UnreadAnswer naming the route, the key, the may words and the fix',
    async (t) => {
      answering(t, { name: 'x' }, 201);
      await assert.rejects(send('POST', '/api/x', Thing, { may: MAY }), unread('POST /api/x', 'id', 'is missing.', MAY));
      answering(t, { id: 7 });
      await assert.rejects(
        send('PUT', '/api/x', Thing, { may: MAY }),
        unread('PUT /api/x', 'id', 'is 7, where the board reads string.', MAY),
      );
    },
  );
  await t.test(
    "REFUSED: a 2xx answer that is not JSON is refused at the answer itself, and never built as the caller's refusal",
    async (t) => {
      answering(t, '<html>ok</html>');
      const refused = (words: string, status: number) => new SkillRefusal(words, status);
      await assert.rejects(
        send('DELETE', '/api/x', Thing, { may: MAY, refused }),
        unread('DELETE /api/x', 'the answer', 'is undefined, where the board reads object', MAY),
      );
    },
  );
  await t.test("REFUSED: a write the api refused rejects in its words and status, a WriteRefusal, or the caller's class", async (t) => {
    answering(t, { error: 'changed since' }, 409);
    const err = await rejection(send('PUT', '/api/x', Thing, { may: MAY }));
    assert.ok(err instanceof WriteRefusal && !(err instanceof ReadRefusal), String(err));
    assert.equal(err.message, 'changed since');
    assert.equal(err.status, 409);

    answering(t, '<html>Bad Gateway</html>', 502, 'Bad Gateway');
    const gateway = await rejection(send('DELETE', '/api/x', Thing, { may: MAY }));
    assert.ok(gateway instanceof WriteRefusal, String(gateway));
    assert.equal(gateway.message, 'DELETE /api/x answered 502 Bad Gateway');

    answering(t, { error: 'taken', users: ['a'] }, 409);
    const built = await rejection(
      send('POST', '/api/x', Thing, {
        may: MAY,
        refused: (words, status, body) => new AgentRefusal(words, [JSON.stringify(body)], status),
      }),
    );
    assert.ok(built instanceof AgentRefusal, String(built));
    assert.deepEqual([built.message, built.users, built.status], ['taken', ['{"error":"taken","users":["a"]}'], 409]);
  });
});

const agentDraft: AgentDraft = {
  name: 'ada',
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
  await t.test('runs: a prune resolves with its lines and how many places were left; a removal and a lift with their ids', async (t) => {
    const sent = answering(t, {
      id: 'r-1',
      pruned: true,
      lines: ['removed /w/a'],
      worktrees: ['/w/a'],
      artifacts: null,
      left: [{ path: '/w/b', git: 'locked' }],
    });
    assert.deepEqual(await pruneRun('r 1', { artifacts: false, unmerged: true }), {
      id: 'r 1',
      pruned: true,
      lines: ['removed /w/a'],
      left: 1,
    });
    assert.deepEqual([sent[0]?.url, sent[0]?.init?.body], ['/api/runs/r%201/prune', '{"artifacts":false,"unmerged":true}']);
    answering(t, { id: 'r-1', removed: true });
    assert.deepEqual(await removeRun('r-1'), { id: 'r-1', removed: true });
    answering(t, { id: 'r-1', lifted: true, hold: { at: 'now' } });
    assert.deepEqual(await liftHold('r-1'), { id: 'r-1', lifted: true });
  });
  await t.test(
    "REFUSED: runs — a prune whose left is a count, a removal whose removed is a word; a refusal in the package's words",
    async (t) => {
      answering(t, { id: 'r-1', pruned: true, lines: [], left: 2 });
      await assert.rejects(
        pruneRun('r-1', { artifacts: false, unmerged: false }),
        unread('POST /api/runs/r-1/prune', 'left', 'is 2, where the board reads array', 'before pruning it again.'),
      );
      answering(t, { id: 'r-1', removed: 'yes' });
      const err = await rejection(removeRun('r-1'));
      assert.ok(err instanceof UnreadAnswer && err.message.includes('at removed, the value is "yes"'), String(err));
      answering(t, { error: 'r-1 is still running: cancel it first.' }, 409);
      const refused = await rejection(removeRun('r-1'));
      assert.ok(refused instanceof WriteRefusal && refused.status === 409, String(refused));
      assert.equal(refused.message, 'r-1 is still running: cancel it first.');
    },
  );
  await t.test(
    'runs: a hold is put with the runs it waits on and its why, a blank why not sent, and resolves with the hold the api wrote',
    async (t) => {
      const hold = { at: '2026-10-06T12:00:00.000Z', until: ['a-1', 'b-2'], why: 'conflicts', by: 'ann' };
      const sent = answering(t, { id: 'r-1', lifted: false, hold, file: '/runs/r-1.hold' });
      assert.deepEqual(await putHold('r 1', ['a-1', 'b-2'], 'conflicts'), { id: 'r-1', lifted: false, hold });
      assert.deepEqual(
        [sent[0]?.url, sent[0]?.init?.method, sent[0]?.init?.body],
        ['/api/runs/r%201/hold', 'POST', '{"until":["a-1","b-2"],"why":"conflicts"}'],
      );
      const blank = answering(t, { id: 'r-1', lifted: false, hold: { at: 'now', until: ['a-1'] } });
      assert.deepEqual(await putHold('r-1', ['a-1'], '  '), { id: 'r-1', lifted: false, hold: { at: 'now', until: ['a-1'] } });
      assert.equal(blank[0]?.init?.body, '{"until":["a-1"]}');
    },
  );
  await t.test(
    "REFUSED: runs — a hold answered as lifted, or without the runs it waits on, is unread; a refusal in the package's words",
    async (t) => {
      answering(t, { id: 'r-1', lifted: true, hold: { at: 'now', until: ['a-1'] } });
      const lifted = await rejection(putHold('r-1', ['a-1'], ''));
      assert.ok(lifted instanceof UnreadAnswer && lifted.message.includes('at lifted, the value is true'), String(lifted));
      answering(t, { id: 'r-1', lifted: false, hold: { at: 'now' } });
      const bare = await rejection(putHold('r-1', ['a-1'], ''));
      assert.ok(bare instanceof UnreadAnswer && bare.message.includes('before holding it again.'), String(bare));
      answering(t, { error: 'r-1 waits on a-1, and a-1 already waits on r-1.' }, 409);
      const refused = await rejection(putHold('r-1', ['a-1'], ''));
      assert.ok(refused instanceof WriteRefusal && refused.status === 409, String(refused));
      assert.equal(refused.message, 'r-1 waits on a-1, and a-1 already waits on r-1.');
    },
  );
  await t.test("REFUSED: asks — an approval whose time is a number; the api's 422 kept word for word", async (t) => {
    answering(t, { try: 1, at: 7, message: null, file: '/f' }, 202);
    await assert.rejects(
      approveStep('r-1', 'plan', {}),
      unread('POST /api/runs/r-1/steps/plan/approve', 'at', 'is 7, where the board reads string', 'before approving again.'),
    );
    answering(t, { try: 1, at: 'now', message: null, file: '/f', extra: 1 }, 202);
    assert.deepEqual(await approveStep('r-1', 'plan', {}), { try: 1, at: 'now', message: null, file: '/f' });
    const words = 'plan is not waiting at its gate: it is running.';
    answering(t, { error: words }, 422);
    for (const ask of [
      askTry('r-1', 'plan', { mode: 'nudge' }),
      askRound('r-1', {}),
      approveStep('r-1', 'plan', {}),
      acceptLoop('r-1', 'review', { message: 'good enough' }),
      sayToStep('r-1', 'plan', 'hi'),
    ]) {
      const err = await rejection(ask);
      assert.ok(err instanceof WriteRefusal && err.status === 422 && err.message === words, String(err));
    }
  });
  await t.test('REFUSED: inbox — a queue with a word the board does not know, and a drop answered without removed', async (t) => {
    answering(t, { name: 'a', file: '/i/a.md', was: 'parked', queued: null, place: null, of: null });
    await assert.rejects(
      queueCard('a'),
      unread(
        'POST /api/inbox/a/queue',
        'was',
        'is "parked", where the board reads "queued" | "taken back" | "not queued"',
        'before asking again.',
      ),
    );
    answering(t, { file: '/i/a.md' });
    await assert.rejects(dropCard('a'), unread('DELETE /api/inbox/a', 'removed', 'is missing.', 'before dropping it again.'));
    answering(t, { removed: true, file: '/i/a.md' });
    assert.equal(await dropCard('a'), undefined);
    answering(t, { name: 7 }, 201);
    await assert.rejects(
      fileCard({ body: 'x' }),
      unread('POST /api/inbox', 'name', 'is 7, where the board reads string', 'before filing it again.'),
    );
  });
  await t.test(
    "REFUSED: workflows — a start whose id is a number; a card's start resolves to its run alone, without the keys the board does not read",
    async (t) => {
      const asked = { workflow: 'dev', from: 'repo' as const, brief: 'b' };
      answering(t, { id: 7 }, 201);
      await assert.rejects(
        startRun(asked),
        unread('POST /api/runs', 'id', 'is 7, where the board reads string', 'look on the Runs page before starting it again.'),
      );
      answering(t, { id: 'r', card: 'c', ignoredRepo: '/x' }, 201);
      assert.deepEqual(await startRun({ ...asked, card: 'c' }), { id: 'r' });
    },
  );
  await t.test(
    'REFUSED: agents — a save answered with an empty agent is unread, not saved; a refusal keeps its users and status',
    async (t) => {
      answering(t, { agent: {}, written: [], removed: [] }, 201);
      const err = await rejection(createAgent(agentDraft));
      assert.ok(err instanceof UnreadAnswer && !(err instanceof AgentRefusal), String(err));
      assert.ok(
        /^POST \/api\/agents\/yours answered what this board does not read: at agent\.\w+, the value is missing\./.test(err.message),
        err.message,
      );
      assert.ok(err.message.includes('The agent may be written'), err.message);

      answering(t, { error: 'build/implement still names ada.', users: ['build/implement'] }, 409);
      const named = await rejection(removeAgent('ada', 'v1'));
      assert.ok(named instanceof AgentRefusal, String(named));
      assert.deepEqual([named.message, named.users, named.status], ['build/implement still names ada.', ['build/implement'], 409]);
      answering(t, { error: 'another site' }, 403);
      const cross = await rejection(tryAgent('ada', 'brief'));
      assert.ok(cross instanceof AgentRefusal, String(cross));
      assert.deepEqual([cross.users, cross.status], [[], 403]);
      answering(t, { removed: 'all' });
      await assert.rejects(
        removeAgent('ada', 'v1'),
        (e: unknown) => e instanceof UnreadAnswer && e.message.includes('at removed, the value is "all"'),
      );
    },
  );
  await t.test('REFUSED: skills — a save answered without its skill is unread, never a SkillRefusal; a 409 is one', async (t) => {
    answering(t, { written: [] });
    const err = await rejection(saveSkill('s', 'v1', skillDraft));
    assert.ok(err instanceof UnreadAnswer && !(err instanceof SkillRefusal), String(err));
    assert.ok(
      err.message.startsWith('PUT /api/skills/yours/s answered what this board does not read: at skill, the value is missing.'),
      err.message,
    );
    answering(t, { error: 's changed since it was read.' }, 409);
    const changed = await rejection(saveSkill('s', 'v1', skillDraft));
    assert.ok(changed instanceof SkillRefusal && changed.status === 409, String(changed));
    answering(t, { skill: null, written: [] }, 201);
    await assert.rejects(copySkill('s'), (e: unknown) => e instanceof UnreadAnswer && e.message.includes('at skill, the value is null'));
  });
  await t.test('REFUSED: builder — a save answered with no workflow is unread; a refusal keeps its steps and status', async (t) => {
    const save = { version: 'v1', steps: [], schemas: [] };
    answering(t, { workflow: null, written: [], kept: [], removed: [] });
    await assert.rejects(
      saveWorkflow('w', save),
      unread('PUT /api/workflows/yours/w', 'workflow', 'is null, where the board reads', 'before writing it again.'),
    );
    answering(t, { error: 'a and b wait on each other.', steps: ['a', 'b'] }, 422);
    const cycle = await rejection(saveWorkflow('w', save));
    assert.ok(cycle instanceof BuildRefusal, String(cycle));
    assert.deepEqual([cycle.message, cycle.steps, cycle.status], ['a and b wait on each other.', ['a', 'b'], 422]);
  });
});
