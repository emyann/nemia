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

const { startRun } = await import('../src/lib/api.ts');

/** POST /api/runs answering each start with `answer()`, for the length of the test: the requests the board sent. */
function starting(t: { after: (fn: () => void) => void }, answer: () => Response) {
  const before = globalThis.fetch;
  const sent: Array<{ url: string; init: RequestInit | undefined }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(url), init });
    return answer();
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = before;
  });
  return sent;
}

const answered = (status: number, body: object, statusText = '') =>
  new Response(JSON.stringify(body), { status, statusText, headers: { 'content-type': 'application/json' } });

const asked = { workflow: 'dev', from: 'repo' as const, brief: 'Give the board a legend' };

test("a start is posted as JSON, the one body the api takes, and resolves with the new run's id", async (t) => {
  const sent = starting(t, () => answered(201, { id: 'give-the-board-a-legend-ab12' }, 'Created'));
  assert.deepEqual(await startRun(asked), { id: 'give-the-board-a-legend-ab12' });
  assert.equal(sent.length, 1);
  const [{ url, init }] = sent as [(typeof sent)[number]];
  assert.equal(url, '/api/runs');
  assert.equal(init?.method, 'POST');
  // Anything else the api answers 415: a body any page could send it unasked.
  assert.equal(new Headers(init?.headers).get('content-type'), 'application/json');
  assert.deepEqual(JSON.parse(String(init?.body)), asked);
});

test("REFUSED: a start the api refuses rejects with the api's message word for word, whatever the status", async (t) => {
  let answer = answered(500, {});
  starting(t, () => answer);
  const refusals: Array<[number, string]> = [
    [400, 'POST /api/runs names the workflow to start in `workflow`, a folder\'s name: `{ "workflow": "<name>", "brief": "<what to do>" }`.'],
    [403, "POST /api/runs refuses a request made by a page on another site (Sec-Fetch-Site: cross-site): a run's brief is what an agent acts on in this repository."],
    [404, "No workflow 'nope' in /code/app/workflows or /home/me/.agent-workflows/workflows. The workflows there are: dev (repo), ui (repo)."],
    [409, "Both the repository and yours have a workflow named 'dev'. Say which with `\"from\": \"repo\"` or `\"from\": \"yours\"`."],
    [415, 'POST /api/runs takes its body as `content-type: application/json`, and this request sent `text/plain`.'],
    [422, "build-check: a step may not be named for another step's check. build has a `check:`, and the run files it as build-check. Rename build-check.md."],
  ];
  for (const [status, error] of refusals) {
    answer = answered(status, { error });
    await assert.rejects(startRun(asked), (err: Error) => err.message === error, String(status));
  }
});

test('an answer with nothing to say says what came back: the status line of an error that is not JSON, and a warning to look before starting again on a success with no id', async (t) => {
  let answer = new Response('<html>Bad Gateway</html>', { status: 502, statusText: 'Bad Gateway', headers: { 'content-type': 'text/html' } });
  starting(t, () => answer);
  await assert.rejects(startRun(asked), (err: Error) => err.message === 'POST /api/runs answered 502 Bad Gateway');
  answer = answered(422, { message: 'not the field the board reads' }, 'Unprocessable Entity');
  await assert.rejects(startRun(asked), (err: Error) => err.message === 'POST /api/runs answered 422 Unprocessable Entity');
  answer = answered(201, { run: 'give-the-board-a-legend-ab12' }, 'Created');
  await assert.rejects(startRun(asked), (err: Error) =>
    err.message.startsWith("POST /api/runs answered 201 Created without the new run's id") && /look on the Runs page before starting it again/.test(err.message));
});
