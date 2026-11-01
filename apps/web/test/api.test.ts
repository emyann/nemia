import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { decisionQuery, ReadRefusal, retryRun, runGone, runQuery, sayToStep } from '../src/lib/api.ts';
import { decisionStamp } from '../src/lib/decide.ts';
import { coded, decidable, detail, type Word } from './run-fixtures.ts';
import { bell, until, WAITED } from './waits.ts';

const { workflowNameOf } = await import('../src/lib/api.ts');

const { startRun } = await import('../src/lib/api.ts');

/** POST /api/runs answering each start with `answer()`, for the length of the test: the requests the board sent. */
function starting(t: { after: (fn: () => void) => void }, answer: () => Response) {
  const before = globalThis.fetch;
  const sent: Array<{ url: string; init: RequestInit | undefined }> = [];
  globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(url), init });
    return answer();
  };
  t.after(() => {
    globalThis.fetch = before;
  });
  return sent;
}

const answered = (status: number, body: object, statusText = '') =>
  new Response(JSON.stringify(body), { status, statusText, headers: { 'content-type': 'application/json' } });

const asked = { workflow: 'dev', from: 'repo' as const, brief: 'Give the board a legend' };

test("startRun: posted as JSON, refused in the api's words, and an answer with nothing to say said for what came back", async (t) => {
  await t.test("a start is posted as JSON, the one body the api takes, and resolves with the new run's id", async (t) => {
    const sent = starting(t, () => answered(201, { id: 'give-the-board-a-legend-ab12' }, 'Created'));
    assert.deepEqual(await startRun(asked), { id: 'give-the-board-a-legend-ab12' });
    assert.equal(sent.length, 1);
    const [{ url, init }] = sent as [(typeof sent)[number]];
    assert.equal(url, '/api/runs');
    assert.equal(init?.method, 'POST');
    assert.equal(
      new Headers(init?.headers).get('content-type'),
      'application/json',
      'the api answers anything else 415: a body any page could send it unasked',
    );
    assert.deepEqual(JSON.parse(String(init?.body)), asked);
  });
  await t.test("REFUSED: a start the api refuses rejects with the api's message word for word, whatever the status", async (t) => {
    let answer = answered(500, {});
    starting(t, () => answer);
    const refusals: Array<[number, string]> = [
      [
        400,
        'POST /api/runs names the workflow to start in `workflow`, a folder\'s name: `{ "workflow": "<name>", "brief": "<what to do>" }`.',
      ],
      [
        403,
        "POST /api/runs refuses a request made by a page on another site (Sec-Fetch-Site: cross-site): a run's brief is what an agent acts on in this repository.",
      ],
      [
        404,
        "No workflow 'nope' in /code/app/workflows or /home/me/.agent-workflows/workflows. The workflows there are: dev (repo), ui (repo).",
      ],
      [409, 'Both the repository and yours have a workflow named \'dev\'. Say which with `"from": "repo"` or `"from": "yours"`.'],
      [415, 'POST /api/runs takes its body as `content-type: application/json`, and this request sent `text/plain`.'],
      [
        422,
        "build-check: a step may not be named for another step's check. build has a `check:`, and the run files it as build-check. Rename build-check.md.",
      ],
    ];
    for (const [status, error] of refusals) {
      answer = answered(status, { error });
      await assert.rejects(startRun(asked), (err: Error) => err.message === error, String(status));
    }
  });
  await t.test(
    'an answer with nothing to say says what came back: the status line of an error that is not JSON, and a warning to look before starting again on a success with no id',
    async (t) => {
      let answer = new Response('<html>Bad Gateway</html>', {
        status: 502,
        statusText: 'Bad Gateway',
        headers: { 'content-type': 'text/html' },
      });
      starting(t, () => answer);
      await assert.rejects(startRun(asked), (err: Error) => err.message === 'POST /api/runs answered 502 Bad Gateway');
      answer = answered(422, { message: 'not the field the board reads' }, 'Unprocessable Entity');
      await assert.rejects(startRun(asked), (err: Error) => err.message === 'POST /api/runs answered 422 Unprocessable Entity');
      answer = answered(201, { run: 'give-the-board-a-legend-ab12' }, 'Created');
      await assert.rejects(
        startRun(asked),
        (err: Error) =>
          err.message.startsWith('POST /api/runs answered what this board does not read: at id, the value is missing.') &&
          /look on the Runs page before starting it again/.test(err.message),
      );
    },
  );
});
test(
  "a run's decision is asked for once while a live step's engine word moves, once more when it settles — and the last one stays shown meanwhile",
  WAITED,
  async (t) => {
    const answers: Array<(body: object) => void> = [];
    const rang = bell();
    const before = globalThis.fetch;
    globalThis.fetch = async () => {
      const body = await new Promise<object>((resolve) => {
        answers.push(resolve);
        rang.ring();
      });
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const client = new QueryClient();
    t.after(() => {
      globalThis.fetch = before;
      client.clear();
    });

    const run = (tokens: Word) => ({
      status: 'failed' as const,
      cancelledAt: null,
      waitingOnYou: ['implement'],
      steps: [
        { name: 'implement', taskId: 't-1', ...coded('succeeded · BLOCKED') },
        { name: 'tokens', taskId: 't-2', ...coded(tokens) },
      ],
    });
    const observer = new QueryObserver(client, decisionQuery('r-1', decisionStamp(run('running (working)'))));
    const shown: unknown[] = [];
    t.after(
      observer.subscribe((result) => {
        shown.push(result.data);
        rang.ring();
      }),
    );

    const first = decidable({ touched: [], lesson: { said: 'nothing written where the next agent reads', state: 'nothing' } });
    await until(t, () => answers.length === 1, 'the decision asked for once', { bell: rang });
    answers[0](first);
    await until(t, () => observer.getCurrentResult().data !== undefined, 'the first answer shown', { bell: rang });

    for (const word of ['working (quiescent)', 'starting', 'between attempts', 'needs-human', 'running (working)'] as const) {
      observer.setOptions(decisionQuery('r-1', decisionStamp(run(word))));
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(
      answers.length,
      1,
      "no ask while the poll brings tokens' engine word a little different each time, and nothing the decision reads moves",
    );

    observer.setOptions(decisionQuery('r-1', decisionStamp(run('unverified · done'))));
    await until(t, () => answers.length === 2, 'the decision asked for once more, as tokens signs off', { bell: rang });
    assert.equal(answers.length, 2, 'tokens signs off: asked once more');
    const meanwhile = observer.getCurrentResult();
    assert.deepEqual(
      [meanwhile.data, meanwhile.isPlaceholderData],
      [first, true],
      'until the answer lands, the decision read before is what is shown',
    );

    const second = decidable({ touched: [], lesson: { said: 'CLAUDE.md +2 −0', state: 'written' } });
    answers[1](second);
    await until(t, () => !observer.getCurrentResult().isPlaceholderData, 'the second answer shown in place of the first', {
      bell: rang,
    });
    assert.deepEqual(observer.getCurrentResult().data, second);
    const from = shown.findIndex((data) => isDeepStrictEqual(data, first));
    assert.ok(from >= 0, `the first answer, a copy the observer made, is among what was shown: ${JSON.stringify(shown)}`);
    assert.ok(shown.length - from > 2, `every value from the first answer on is held to it, not the last alone: ${JSON.stringify(shown)}`);
    assert.ok(
      shown.slice(from).every((data) => data !== undefined),
      `from the first answer on, never nothing, so the section does not blink out: ${JSON.stringify(shown)}`,
    );
  },
);

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

const { askRound } = await import('../src/lib/api.ts');

test("each ask of a run's page: posted as the api takes it, read back, and refused in the api's words", async (t) => {
  await t.test(
    "saying something to a step posts the words as JSON and resolves with the engine's entry; a refusal rejects with the api's words, verbatim, and an answer without the entry says so",
    async (t) => {
      const before = globalThis.fetch;
      const sent: Array<{ url: string; init: RequestInit }> = [];
      let answer = () =>
        new Response(JSON.stringify({ at: '2026-09-14T16:06:19.851Z', attempt: 1, text: 'Widen it.', after: null }), { status: 202 });
      globalThis.fetch = (async (url: string, init: RequestInit) => {
        sent.push({ url, init });
        return answer();
      }) as typeof fetch;
      t.after(() => {
        globalThis.fetch = before;
      });
      assert.deepEqual(await sayToStep('r 1', 'implement', 'Widen it.'), {
        at: '2026-09-14T16:06:19.851Z',
        attempt: 1,
        text: 'Widen it.',
        after: null,
      });
      const [{ url, init }] = sent as [{ url: string; init: RequestInit }];
      assert.deepEqual(
        [url, init.method, (init.headers as Record<string, string>)['content-type'], init.body],
        ['/api/runs/r%201/steps/implement/say', 'POST', 'application/json', '{"text":"Widen it."}'],
      );

      const refusal = "implement is not running: try 1's task settled `succeeded`, so no session of it is there to hear anything.";
      answer = () => new Response(JSON.stringify({ error: refusal }), { status: 409 });
      await assert.rejects(sayToStep('r-1', 'implement', 'Widen it.'), (err: Error) => err.message === refusal);
      answer = () => new Response('{}', { status: 202 });
      await assert.rejects(
        sayToStep('r-1', 'implement', 'Widen it.'),
        (err: Error) =>
          err.message.startsWith(
            'POST /api/runs/r-1/steps/implement/say answered what this board does not read: at at, the value is missing.',
          ) && /before saying them again/.test(err.message),
      );
    },
  );
  await t.test(
    "an answer is asked for as the api takes it — POST, JSON, the step by name — and resolves with the try, its ask file and the package's `stopFirst`",
    async (t) => {
      const sent: Array<{ url: string; init: RequestInit }> = [];
      asking(t, 202, JSON.stringify({ try: 2, file: '/store/runs/r 1.asks/retry-implement-2', stopFirst: false }), sent);
      assert.deepEqual(await askTry('r 1', 'implement', { mode: 'continue', message: '--flag stays' }), {
        try: 2,
        file: '/store/runs/r 1.asks/retry-implement-2',
        stopFirst: false,
      });
      assert.equal(sent.length, 1);
      assert.equal(sent[0].url, '/api/runs/r%201/steps/implement/retry');
      assert.equal(sent[0].init.method, 'POST');
      assert.deepEqual(sent[0].init.headers, { 'content-type': 'application/json' });
      assert.deepEqual(JSON.parse(String(sent[0].init.body)), { mode: 'continue', message: '--flag stays' });

      asking(t, 202, JSON.stringify({ try: 2, file: '/store/runs/r-1.asks/retry-held-2', stopFirst: true }), sent);
      assert.deepEqual(
        await askTry('r-1', 'held', { mode: 'continue' }),
        { try: 2, file: '/store/runs/r-1.asks/retry-held-2', stopFirst: true },
        'continue on a session the harness blocked: the tick stops it before it files the try, and the api says so',
      );
      assert.deepEqual(JSON.parse(String(sent[1].init.body)), { mode: 'continue' });
    },
  );
  await t.test(
    "REFUSED: an ask the api refuses rejects with the api's words, verbatim; an answer without the try it asked for, or without JSON, says so",
    async (t) => {
      const refusal =
        'working is still running, so there is nothing to try again until it ends. Wait for it: wf ls r-1 (or stop the run: wf cancel r-1).';
      const sent: Array<{ url: string; init: RequestInit }> = [];
      asking(t, 409, JSON.stringify({ error: refusal }), sent);
      await assert.rejects(askTry('r-1', 'working', { mode: 'continue' }), (err: Error) => err.message === refusal);

      globalThis.fetch = async () => new Response(JSON.stringify({ ok: true }), { status: 202 });
      await assert.rejects(
        askTry('r-1', 'implement', { mode: 'continue' }),
        (err: Error) =>
          err.message.startsWith(
            'POST /api/runs/r-1/steps/implement/retry answered what this board does not read: at try, the value is missing.',
          ) && /before asking again/.test(err.message),
      );

      globalThis.fetch = async () => new Response('<html>Bad Gateway</html>', { status: 502, statusText: 'Bad Gateway' });
      await assert.rejects(
        askTry('r-1', 'implement', { mode: 'continue' }),
        (err: Error) => err.message === 'POST /api/runs/r-1/steps/implement/retry answered 502 Bad Gateway',
      );
    },
  );
  await t.test(
    "a raise is posted as JSON beside the try's mode, or with the round's step, and resolves with what the api asked for; a refusal rejects with the package's words, verbatim, and an answer without the round says so",
    async (t) => {
      const refusal =
        "--budget 4 is not above $4.25, what tokens's tries have cost: a try under it would read over budget again as soon as it ended. Give more than $4.25: wf retry r-1 tokens --budget <amount>.";
      let answer = () => answered(202, { try: 3, file: '/store/runs/r-1.asks/retry-tokens-3', stopFirst: false });
      const sent = starting(t, () => answer());
      assert.deepEqual(await askTry('r-1', 'tokens', { mode: 'continue', budget: 5 }), {
        try: 3,
        file: '/store/runs/r-1.asks/retry-tokens-3',
        stopFirst: false,
      });
      answer = () => answered(409, { error: refusal });
      await assert.rejects(askTry('r-1', 'tokens', { mode: 'continue', budget: 4 }), (err: Error) => err.message === refusal);

      answer = () => answered(202, { step: 'review', round: 3, file: '/store/runs/r 1.asks/round-review-3' });
      assert.deepEqual(await askRound('r 1', { step: 'review', budget: 3 }), {
        step: 'review',
        round: 3,
        file: '/store/runs/r 1.asks/round-review-3',
      });
      const words =
        '--budget 2 is not above $2.10, what implement has cost: the round would be held again as soon as it was asked for. Give more than $2.10: nemia retry r-1 review --round --budget <amount>.';
      answer = () => answered(409, { error: words });
      await assert.rejects(askRound('r-1', { step: 'review', budget: 2 }), (err: Error) => err.message === words);
      answer = () => answered(202, {});
      await assert.rejects(
        askRound('r-1', { budget: 3 }),
        (err: Error) =>
          err.message.startsWith('POST /api/runs/r-1/round answered what this board does not read: at step, the value is missing.') &&
          /before asking again/.test(err.message),
      );

      assert.deepEqual(
        sent.map(({ url, init }) => [url, init?.method, new Headers(init?.headers).get('content-type'), JSON.parse(String(init?.body))]),
        [
          ['/api/runs/r-1/steps/tokens/retry', 'POST', 'application/json', { mode: 'continue', budget: 5 }],
          ['/api/runs/r-1/steps/tokens/retry', 'POST', 'application/json', { mode: 'continue', budget: 4 }],
          ['/api/runs/r%201/round', 'POST', 'application/json', { step: 'review', budget: 3 }],
          ['/api/runs/r-1/round', 'POST', 'application/json', { step: 'review', budget: 2 }],
          ['/api/runs/r-1/round', 'POST', 'application/json', { budget: 3 }],
        ],
      );
    },
  );
});

test("a run's reads: gone on a 404 alone, its last read kept, any other failure tried again; and a run's workflow named", async (t) => {
  await t.test("a run's workflow is named by the last segment of its folder, as the Workflows page names it", () => {
    assert.equal(workflowNameOf('/code/app/workflows/dev-build'), 'dev-build');
    assert.equal(workflowNameOf('/code/app/workflows/ui/'), 'ui');
    assert.equal(
      workflowNameOf('/code/app/packages/agent-orchestrator/workflows'),
      'workflows',
      "the package's shipped default is a folder called `workflows`, and that is its name",
    );
    assert.equal(workflowNameOf('C:\\code\\app\\workflows\\dev'), 'dev');
  });
  await t.test(
    'a run removed while its page is open is said as gone on the one read that finds none: its last read is kept, and a 404 is not tried again',
    async (t) => {
      const before = globalThis.fetch;
      const asked: string[] = [];
      const said = "No run 'r-1' in this store. GET /api/runs (or `wf ls`) lists the runs it has; check WF_ROOT if you expected it here.";
      globalThis.fetch = (async (url: string) => {
        asked.push(url);
        return new Response(JSON.stringify({ error: said }), { status: 404, headers: { 'content-type': 'application/json' } });
      }) as typeof fetch;
      const client = new QueryClient();
      t.after(() => {
        globalThis.fetch = before;
        client.clear();
      });
      const last = detail();
      client.setQueryData(runQuery('r-1').queryKey, last);
      const observer = new QueryObserver(client, { ...runQuery('r-1'), refetchOnMount: false });
      t.after(observer.subscribe(() => {}));

      await client.invalidateQueries({ queryKey: ['runs', 'r-1'], exact: true });
      const result = observer.getCurrentResult();
      assert.equal(
        runGone(result.error),
        true,
        `on a page that read the run on its load, the read the feed's \`removed\` asks for finds none and is told apart: ${String(result.error)}`,
      );
      assert.ok(result.error instanceof ReadRefusal);
      assert.equal(result.error.message, said, "in the api's words");
      assert.equal(result.data, last, 'the last read is kept by the query — the page, not the query, stops drawing it');
      assert.deepEqual(asked, ['/api/runs/r-1'], 'read once: a run gone is said at once, not after three tries');
    },
  );
  await t.test('only a 404 is a run gone: any other failure is tried again three times, as before', () => {
    assert.equal(runGone(new ReadRefusal('No run', 404)), true);
    for (const other of [
      new ReadRefusal('the api is down', 502),
      new ReadRefusal('refused', 400),
      new Error('without its graph'),
      undefined,
    ]) {
      assert.equal(runGone(other), false, String(other));
      assert.equal(retryRun(0, other), true, `${String(other)} is tried again`);
      assert.equal(retryRun(3, other), false, `${String(other)} three times, and no more`);
    }
    assert.equal(retryRun(0, new ReadRefusal('No run', 404)), false, 'a run gone is not tried again');
  });
});
