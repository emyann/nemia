/**
 * Nemia's chat followed over HTTP (`GET /api/nemia/chat/stream`) on the app's registry (`Followings`): over the api's own engine with her
 * task's `view`, `transcript` and `follow` the test's, whose live moments the test pushes as they come. What it proves: two readers of
 * her chat share one upstream of her session, a moment pushed reaches both with no beat of reading the record, the person's words reach
 * a reader as her outbox is written, and the upstream is let go once both have gone.
 */
import { root } from '../../test/harness.ts';
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Cause, Effect, Layer, Metric, Queue, Stream } from 'effect';
import { engine } from 'agent-orchestrator';
import { appOf, liveOf } from '../app.ts';
import { Beats } from '../layer.ts';
import { Engine } from '../store.ts';
import { STEP_FOLLOWS, type TranscriptEvent } from '../steps/following.ts';
import { bell, until } from '../../test/waits.ts';

/** One moment of a live attempt, as the engine's `follow` hands it. */
type Followed = Stream.Success<NonNullable<Effect.Success<ReturnType<Engine['Service']['follow']>>>>;

const TASK = 'her-followed';
const AT = '2026-10-15T12:00:00.000Z';

const herWords = (id: string, text: string): TranscriptEvent => ({ id, at: AT, role: 'assistant', kind: 'text', text });

/**
 * Her task on an engine that is the api's own but for `view`, `transcript` and `follow`: one attempt at work, its conversation
 * `history`, its live moments the queue the test offers to, each follow asked and each let go counted.
 */
function herEngine(history: TranscriptEvent[]) {
  const live = Effect.runSync(Queue.unbounded<Followed, Cause.Done>());
  Queue.offerUnsafe(live, { kind: 'state', state: 'working' });
  const follows: string[] = [];
  const closed: string[] = [];
  const e = {
    ...engine(),
    view: (id: string) =>
      Effect.sync(() => ({
        id,
        phase: 'working',
        sessionId: 's',
        state: { brief: 'b', filedAt: AT, settled: null, said: [], attempts: [{ n: 1, startedAt: AT, endedAt: null }] },
      })),
    transcript: (_id: string, after?: string) =>
      Effect.sync(() => ({ events: history.slice(Number(after ?? 0)), cursor: String(history.length) })),
    follow: (id: string) =>
      Effect.sync(() => {
        follows.push(id);
        return Stream.fromQueue(live).pipe(Stream.ensuring(Effect.sync(() => closed.push(id))));
      }),
  } as unknown as ReturnType<typeof engine>;
  return { e, live, follows, closed };
}

/** The look at her chat's files these tests give (`Beats.chatFiles`); the record's beat (`Beats.chat`) so long no test meets it. */
const FILES_MS = 50;
const NEVER_MS = 600_000;

/** An app over the engine `e`, its runtime let go once the test `t` ends. */
function appOver(t: TestContext, e: ReturnType<typeof engine>) {
  const own = appOf(
    Layer.mergeAll(
      liveOf(),
      Layer.succeed(Engine)(e),
      Layer.succeed(Beats)({ ...Beats.defaultValue(), chat: NEVER_MS, chatFiles: FILES_MS }),
    ),
  );
  t.after(() => own.runtime.dispose());
  return own;
}

type Block = { event?: string; data?: string; id?: string };
const blocks = (text: string): Block[] =>
  text
    .split('\n\n')
    .filter((b) => b.trim())
    .map((b) => {
      const block: Block = {};
      for (const line of b.split('\n')) {
        const at = line.indexOf(':');
        if (at > 0) block[line.slice(0, at) as keyof Block] = line.slice(at + 1).trimStart();
      }
      return block;
    });

const textsOf = (said: Block[]) => said.filter((b) => b.event === 'chat').map((b) => (JSON.parse(b.data!) as { text?: string }).text);

/** One reader of her chat: what it was sent so far (`said`), waited on until `holds` does, and let go (`leave`). */
async function reader(t: TestContext, app: ReturnType<typeof appOver>['app']) {
  const res = await app.request('/api/nemia/chat/stream');
  if (res.status !== 200) assert.fail(await res.text());
  const body = res.body!.getReader();
  const decoder = new TextDecoder();
  let text = '';
  const rung = bell();
  const said = () => blocks(text.slice(0, text.lastIndexOf('\n\n') + 2));
  const pump = async (): Promise<void> => {
    const { done, value } = await body.read();
    if (done) return;
    text += decoder.decode(value, { stream: true });
    rung.ring();
    return pump();
  };
  void pump().catch(() => undefined);
  const wait = (holds: (s: Block[]) => boolean, what: string) =>
    until(
      t,
      () => holds(said()),
      () => `${what}: ${JSON.stringify(said())}`,
      { bell: rung },
    );
  return { said, wait, leave: () => body.cancel() };
}

const follows = () => Effect.runSync(Metric.value(STEP_FOLLOWS)).count;

test('Two readers of her chat share one upstream of her session, each handed her moments and the person words as they are written', async (t) => {
  fs.mkdirSync(path.join(root, 'nemia'), { recursive: true });
  fs.writeFileSync(path.join(root, 'nemia', 'level.json'), JSON.stringify({ level: 'semi-auto', since: AT, task: TASK }));
  fs.rmSync(path.join(root, 'nemia', 'chat'), { recursive: true, force: true });
  const history = [herWords('a', 'One.')];
  const { e, live, follows: asked, closed } = herEngine(history);
  const own = appOver(t, e);
  const before = follows();
  const one = await reader(t, own.app);
  const two = await reader(t, own.app);
  for (const r of [one, two]) await r.wait((s) => textsOf(s).includes('One.'), 'her history listed');
  await until(
    t,
    () => asked.length >= 1,
    () => `her session followed: ${asked}`,
    { everyMs: 5 },
  );

  history.push(herWords('b', 'Two.'));
  Queue.offerUnsafe(live, { kind: 'events', events: [herWords('b', 'Two.')], cursor: String(history.length) });
  for (const r of [one, two]) await r.wait((s) => textsOf(s).includes('Two.'), 'her words pushed by the follow');
  assert.equal(follows() - before, 1, 'one upstream opened for the two readers');
  assert.deepEqual(asked, [TASK], "the engine's follow asked once");

  const sent = await own.app.request('/api/nemia/chat/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
    body: JSON.stringify({ text: 'Hello' }),
  });
  assert.equal(sent.status, 201);
  for (const r of [one, two]) await r.wait((s) => textsOf(s).includes('Hello'), 'the person words, read off her outbox');
  for (const r of [one, two]) assert.deepEqual(textsOf(r.said()), ['One.', 'Two.', 'Hello'], 'each sent once');

  await one.leave();
  await two.leave();
  await until(
    t,
    () => closed.includes(TASK),
    () => `the upstream let go once both left: ${closed}`,
    { everyMs: 5 },
  );
});
