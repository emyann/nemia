import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runQuery, withGraph, type RunDetail } from '../src/lib/api.ts';

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

const { workflowNameOf } = await import('../src/lib/api.ts');

test("a run's workflow is named by the last segment of its folder, as the Workflows page names it", () => {
  assert.equal(workflowNameOf('/code/app/workflows/dev-build'), 'dev-build');
  assert.equal(workflowNameOf('/code/app/workflows/ui/'), 'ui');
  // The package's shipped default is a folder called `workflows`, and that is its name.
  assert.equal(workflowNameOf('/code/app/packages/agent-workflows/workflows'), 'workflows');
  assert.equal(workflowNameOf('C:\\code\\app\\workflows\\dev'), 'dev');
});
