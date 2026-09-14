import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { decisionQuery, runQuery, withGraph, type RunDetail } from '../src/lib/api.ts';
import { decisionStamp } from '../src/lib/decide.ts';

/** GET /api/runs/:id answering `body`, for the length of the test. */
function answering(t: { after: (fn: () => void) => void }, body: object) {
  const before = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch;
  t.after(() => {
    globalThis.fetch = before;
  });
}

const graph = { roots: ['implement'], edges: [{ from: 'implement', to: 'review', kind: 'after' }] };
/** A detail cut to what the check reads: the run as an api from before `graph` answers it, give or take the rest. */
const detail = (extra: object = {}) => ({ id: 'r-1', steps: [], ...extra }) as unknown as RunDetail;

const refusesStale = (err: Error) =>
  /^The api answered run 'r-1' without its graph, so it is older than this board/.test(err.message) && /Restart the api/.test(err.message);

test("a run's detail without its graph is refused, naming the fix — an api started before the board drew the graph", async (t) => {
  answering(t, detail());
  const read = runQuery('r-1').queryFn as unknown as () => Promise<RunDetail>;
  await assert.rejects(read(), refusesStale);

  for (const stale of [{ graph: null }, { graph: {} }, { graph: { roots: ['implement'] } }, { graph: { edges: [] } }]) {
    assert.throws(() => withGraph('r-1', detail(stale)), refusesStale, JSON.stringify(stale));
  }
});

test("a run's detail with its graph is read as the api gave it", async (t) => {
  const given = detail({ graph });
  answering(t, given);
  const read = runQuery('r-1').queryFn as unknown as () => Promise<RunDetail>;
  assert.deepEqual(await read(), given);
  assert.equal(withGraph('r-1', given), given);
  assert.doesNotThrow(() => withGraph('r-1', detail({ graph: { roots: [], edges: [] } })));
});

/** Until `done` holds, or two seconds have passed. */
async function until(done: () => boolean): Promise<void> {
  const by = Date.now() + 2_000;
  while (!done() && Date.now() < by) await new Promise((resolve) => setTimeout(resolve, 5));
}

test("a run's decision is asked for once while a live step's engine word moves, once more when it settles — and the last one stays shown meanwhile", async (t) => {
  // GET /decision, answered when the test says: each ask waits on a resolver of its own.
  const answers: Array<(body: object) => void> = [];
  const before = globalThis.fetch;
  globalThis.fetch = (async () => {
    const body = await new Promise<object>((resolve) => answers.push(resolve));
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const client = new QueryClient();
  t.after(() => {
    globalThis.fetch = before;
    client.clear();
  });

  // A fan-out `assess` calls failed: implement signed off blocked, and tokens still working.
  const run = (tokens: string) => ({
    status: 'failed', cancelledAt: null, waitingOnYou: ['implement'],
    steps: [{ name: 'implement', taskId: 't-1', status: 'succeeded · BLOCKED' }, { name: 'tokens', taskId: 't-2', status: tokens }],
  });
  const observer = new QueryObserver(client, decisionQuery('r-1', decisionStamp(run('running (working)'))));
  const shown: unknown[] = [];
  t.after(observer.subscribe((result) => shown.push(result.data)));

  const first = { touched: [], lesson: { said: 'nothing written where the next agent reads', state: 'nothing' } };
  await until(() => answers.length === 1);
  answers[0]!(first);
  await until(() => observer.getCurrentResult().data !== undefined);

  // The poll brings tokens' word as the engine has it, each time a little different.
  for (const word of ['working (quiescent)', 'starting', 'between attempts', 'needs-human', 'running (working)']) {
    observer.setOptions(decisionQuery('r-1', decisionStamp(run(word))));
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(answers.length, 1, 'no ask for a word that moved and a decision that did not');

  // tokens signs off: asked once more, and until the answer lands, the decision read before is what is shown.
  observer.setOptions(decisionQuery('r-1', decisionStamp(run('unverified · done'))));
  await until(() => answers.length === 2);
  assert.equal(answers.length, 2);
  const meanwhile = observer.getCurrentResult();
  assert.deepEqual([meanwhile.data, meanwhile.isPlaceholderData], [first, true]);

  const second = { touched: [], lesson: { said: 'CLAUDE.md +2 −0', state: 'written' } };
  answers[1]!(second);
  await until(() => !observer.getCurrentResult().isPlaceholderData);
  assert.deepEqual(observer.getCurrentResult().data, second);
  // From the first answer on, never nothing: the section does not blink out.
  assert.ok(shown.slice(shown.indexOf(first)).every((data) => data !== undefined), JSON.stringify(shown));
});

