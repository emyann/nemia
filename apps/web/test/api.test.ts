import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { decisionQuery, runQuery, sayToStep, withGraph, type RunDetail } from '../src/lib/api.ts';
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

test("a run's detail whose steps come without their tries is refused, naming the step and the fix — an api started before the board showed rounds", async (t) => {
  const stale = detail({ graph, steps: [{ name: 'implement', tries: [] }, { name: 'review' }] });
  const refusesTries = (err: Error) =>
    /^The api answered run 'r-1' without the tries of its step 'review', so it is older than this board/.test(err.message) && /Restart the api/.test(err.message);
  assert.throws(() => withGraph('r-1', stale), refusesTries);
  answering(t, stale);
  await assert.rejects((runQuery('r-1').queryFn as unknown as () => Promise<RunDetail>)(), refusesTries);
  assert.doesNotThrow(() => withGraph('r-1', detail({ graph, steps: [{ name: 'implement', tries: [], said: [] }] })));
});

test("a run's detail whose steps come without what was said to them is refused, naming the step and the fix — an api started before the session page showed it", async (t) => {
  const stale = detail({ graph, steps: [{ name: 'implement', tries: [], said: [] }, { name: 'review', tries: [] }] });
  const refusesSaid = (err: Error) =>
    /^The api answered run 'r-1' without what was said to its step 'review', so it is older than this board/.test(err.message) && /Restart the api/.test(err.message);
  assert.throws(() => withGraph('r-1', stale), refusesSaid);
  answering(t, stale);
  await assert.rejects((runQuery('r-1').queryFn as unknown as () => Promise<RunDetail>)(), refusesSaid);
});

test("saying something to a step posts the words as JSON and resolves with the engine's entry; a refusal rejects with the api's words, verbatim, and an answer without the entry says so", async (t) => {
  const before = globalThis.fetch;
  const sent: Array<{ url: string; init: RequestInit }> = [];
  let answer = () => new Response(JSON.stringify({ at: '2026-09-14T16:06:19.851Z', attempt: 1, text: 'Widen it.' }), { status: 202 });
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    sent.push({ url, init });
    return answer();
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = before;
  });
  assert.deepEqual(await sayToStep('r 1', 'implement', 'Widen it.'), { at: '2026-09-14T16:06:19.851Z', attempt: 1, text: 'Widen it.' });
  const [{ url, init }] = sent as [{ url: string; init: RequestInit }];
  assert.deepEqual([url, init.method, (init.headers as Record<string, string>)['content-type'], init.body], ['/api/runs/r%201/steps/implement/say', 'POST', 'application/json', '{"text":"Widen it."}']);

  const refusal = "implement is not running: try 1's task settled `succeeded`, so no session of it is there to hear anything.";
  answer = () => new Response(JSON.stringify({ error: refusal }), { status: 409 });
  await assert.rejects(sayToStep('r-1', 'implement', 'Widen it.'), (err: Error) => err.message === refusal);
  answer = () => new Response('{}', { status: 202 });
  await assert.rejects(sayToStep('r-1', 'implement', 'Widen it.'), (err: Error) => /^POST \/api\/runs\/r-1\/steps\/implement\/say answered 202 +without what it journalled/.test(err.message));
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


const { askTry } = await import('../src/lib/api.ts');

/** POST …/retry answering `status` and `body`, for the length of the test; what was sent is kept in `sent`. */
function asking(t: { after: (fn: () => void) => void }, status: number, body: string, sent: Array<{ url: string; init: RequestInit }>) {
  const before = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    sent.push({ url, init });
    return new Response(body, { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = before;
  });
}

test("an answer is asked for as the api takes it — POST, JSON, the step by name — and resolves with the try, its ask file and the package's `stopFirst`", async (t) => {
  const sent: Array<{ url: string; init: RequestInit }> = [];
  asking(t, 202, JSON.stringify({ try: 2, file: '/store/runs/r 1.asks/retry-implement-2', stopFirst: false }), sent);
  assert.deepEqual(await askTry('r 1', 'implement', { mode: 'nudge', message: '--flag stays' }), { try: 2, file: '/store/runs/r 1.asks/retry-implement-2', stopFirst: false });
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.url, '/api/runs/r%201/steps/implement/retry');
  assert.equal(sent[0]!.init.method, 'POST');
  assert.deepEqual(sent[0]!.init.headers, { 'content-type': 'application/json' });
  assert.deepEqual(JSON.parse(String(sent[0]!.init.body)), { mode: 'nudge', message: '--flag stays' });

  // Continue on a session the harness blocked: the tick stops it before it files the try, and the api says so.
  asking(t, 202, JSON.stringify({ try: 2, file: '/store/runs/r-1.asks/retry-held-2', stopFirst: true }), sent);
  assert.deepEqual(await askTry('r-1', 'held', { mode: 'nudge' }), { try: 2, file: '/store/runs/r-1.asks/retry-held-2', stopFirst: true });
  assert.deepEqual(JSON.parse(String(sent[1]!.init.body)), { mode: 'nudge' });
});

test("REFUSED: an ask the api refuses rejects with the api's words, verbatim; an answer without the try it asked for, or without JSON, says so", async (t) => {
  const refusal = "working is still running, so there is nothing to try again until it ends. Wait for it: wf ls r-1 (or stop the run: wf cancel r-1).";
  const sent: Array<{ url: string; init: RequestInit }> = [];
  asking(t, 409, JSON.stringify({ error: refusal }), sent);
  await assert.rejects(askTry('r-1', 'working', { mode: 'nudge' }), (err: Error) => err.message === refusal);

  globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true }), { status: 202 })) as typeof fetch;
  await assert.rejects(askTry('r-1', 'implement', { mode: 'nudge' }), (err: Error) =>
    /^POST \/api\/runs\/r-1\/steps\/implement\/retry answered 202 .*without the try it asked for/.test(err.message) && /before asking again/.test(err.message));

  globalThis.fetch = (async () => new Response('<html>Bad Gateway</html>', { status: 502, statusText: 'Bad Gateway' })) as typeof fetch;
  await assert.rejects(askTry('r-1', 'implement', { mode: 'nudge' }), (err: Error) => err.message === 'POST /api/runs/r-1/steps/implement/retry answered 502 Bad Gateway');
});
