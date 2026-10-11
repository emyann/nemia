/**
 * What a step needs from a person, and the board's answer to it: `needs` and `blockedByHarness` on each step, `answer` on a try a
 * person answered, and POST /api/runs/:id/steps/:step/retry, which asks for another try as `nemia retry` does — through the package's
 * `retryRun`, given the harness's word as `nemia retry` gives it, and refused in the package's words.
 *
 * At shipped defaults: the api's own engine over a store this file seeds, reading transcripts where Claude Code keeps them
 * (CLAUDE_CONFIG_DIR). The harness's fake `claude` (test/harness.ts) is first on PATH, listing the sessions this file says are running
 * and noting every call, so the registry of the sessions on this machine is never asked, and a test can count what a request costs.
 */
import { config, observations, registry, root, stops } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { RunDetail } from '../detail/detail.ts';
import { app } from '../app.ts';
import { askFile, engine, list, retryRun, runStore, runShipped as runWith, type RunSummary } from 'agent-orchestrator';
import { messageRefusal } from 'agent-orchestrator/run';

type RetryHow = import('agent-orchestrator').RetryHow;

const T0 = Date.parse('2026-09-14T06:00:00.000Z');
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
const jsonl = (lines: object[]) => lines.map((line) => `${JSON.stringify(line)}\n`).join('');
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

const journal = (taskId: string, events: object[]) => write(path.join(root, 'engine', 'tasks', `${taskId}.jsonl`), jsonl(events));
const started = (harness: string) => [
  { kind: 'filed', at: at(0), brief: 'Do it.', cwd: '/code/app', maxAttempts: 1, harness },
  { kind: 'starting', at: at(1), attempt: 1 },
  { kind: 'spawned', at: at(1), attempt: 1 },
];
/** A step's task that ran once on Codex and signed off with `closeout`. */
const signedOff = (taskId: string, closeout: object) =>
  journal(taskId, [
    ...started('codex'),
    { kind: 'ended', at: at(9), attempt: 1, sessionId: `ae/${taskId}/1`, observed: 'done', reason: 'harness', closeout },
    { kind: 'settled', at: at(9), outcome: 'succeeded' },
  ]);

/**
 * The error Claude Code writes into a session's conversation when another process is refreshing its login: the last words of held's
 * conversation, and the last line its step reads.
 */
const LOGIN =
  'Could not refresh your login because another Claude Code process is refreshing it (or exited mid-refresh) · Try again in a minute; if it keeps happening, close other Claude Code windows or sign in again with /login';

/** A line of a Claude Code 2.1.270 transcript. */
const said = (sessionId: string, type: 'user' | 'assistant', uuid: string, s: number, content: unknown, more: object = {}) => ({
  sessionId,
  isSidechain: false,
  userType: 'external',
  cwd: '/code/app',
  version: '2.1.270',
  type,
  uuid,
  timestamp: at(s),
  message: { role: type, content },
  ...more,
});
const transcriptFile = (sessionId: string) => path.join(config, 'projects', '-code-app', `${sessionId}.jsonl`);

/**
 * A Claude Code task whose session the harness lists as blocked, its attempt never ended: the engine's `needs-human`. `lines` is its
 * conversation on disk, or none at all, and `waitingFor` what the harness says it waits for — as `claude agents --json` prints it beside
 * a blocked state — or nothing, for a harness that says nothing.
 */
const blockedSession = (taskId: string, lines?: (sessionId: string) => object[], waitingFor?: string) => {
  const sessionId = randomUUID();
  journal(taskId, started('claude'));
  const rows = JSON.parse(fs.readFileSync(registry, 'utf8')) as object[];
  rows.push({
    name: `ae/${taskId}/1`,
    sessionId,
    kind: 'background',
    state: 'blocked',
    status: 'idle',
    startedAt: T0,
    ...(waitingFor ? { waitingFor } : {}),
  });
  fs.writeFileSync(registry, JSON.stringify(rows));
  if (lines) write(transcriptFile(sessionId), jsonl(lines(sessionId)));
  return sessionId;
};

const R = 'r-asks';
const blocked = {
  outcome: 'blocked',
  summary: 'Half of it is done.',
  needs: 'Which database: the one in docker-compose.yml, or a new one?',
  artifacts: [],
};

fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
const recordFile = path.join(root, 'runs', `${R}.json`);
fs.writeFileSync(
  recordFile,
  JSON.stringify({
    id: R,
    repo: '/code/app',
    workspace: '/code/app',
    baseRef: 'abc123',
    branch: 'main',
    isolate: true,
    brief: 'Ask and answer',
    workflowDir: path.join(root, 'no-such-workflow'),
    createdAt: at(0),
    workflow: [
      { name: 'implement', after: [], body: 'Implement it.' },
      { name: 'theme', after: [], body: 'Theme it.', check: 'npm test' },
      { name: 'tokens', after: [], body: 'Pick the tokens.' },
      { name: 'held', after: [], body: 'Hold on.' },
      { name: 'idle', after: [], body: 'Idle on.' },
      { name: 'silent', after: [], body: 'Say nothing.' },
      { name: 'working', after: [], body: 'Work on.' },
      { name: 'review', after: ['implement'], body: 'Review it.' },
    ],
    steps: {
      /** Signed off blocked with a question: waiting on you. */
      implement: { taskId: 't-implement', branch: `wf/${R}/implement` },
      /** Signed off, and its check refused with exit 1: waiting on you. */
      theme: { taskId: 't-theme', check: { taskId: 't-theme-check' } },
      /** Signed off done with no check: waiting on nobody. */
      tokens: { taskId: 't-tokens' },
      /** Blocked by the harness, its conversation ending on the login message, after words and a call. */
      held: { taskId: 't-held' },
      /** Blocked, its last words a system line, and a call after them. */
      idle: { taskId: 't-idle' },
      /** Blocked, with no conversation on disk. */
      silent: { taskId: 't-silent' },
      /** A Claude Code task whose session the harness lists as still at work, with nothing signed: the engine's running (working). */
      working: { taskId: 't-working' },
      review: { taskId: null },
    },
  }),
);
signedOff('t-implement', blocked);
signedOff('t-theme', { outcome: 'done', summary: 'Themed it.', artifacts: [] });
journal('t-theme-check', [
  { kind: 'filed', at: at(10), brief: JSON.stringify({ check: 'npm test', env: {} }), cwd: '/code/app', maxAttempts: 1, harness: 'check' },
  { kind: 'starting', at: at(10), attempt: 1 },
  { kind: 'spawned', at: at(10), attempt: 1 },
  { kind: 'ended', at: at(20), attempt: 1, sessionId: 'ae/t-theme-check/1', observed: 'failed', reason: 'harness', exitCode: 1 },
  { kind: 'settled', at: at(20), outcome: 'failed' },
]);
signedOff('t-tokens', { outcome: 'done', summary: 'Picked them.', artifacts: [] });
const held = blockedSession(
  't-held',
  (id) => [
    said(id, 'user', 'u-1', 2, 'Hold on.'),
    said(id, 'assistant', 'a-1', 3, [{ type: 'text', text: 'Reading the tests first.' }]),
    said(id, 'assistant', 'a-2', 4, [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'npm test' } }]),
    said(id, 'user', 'u-2', 5, [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '# pass 12' }]),
    said(id, 'assistant', 'a-3', 6, [{ type: 'text', text: LOGIN }], { isApiErrorMessage: true, error: 'server_error' }),
  ],
  'permission prompt',
);
blockedSession('t-idle', (id) => [
  said(id, 'user', 'u-1', 2, 'Idle on.'),
  {
    sessionId: id,
    isSidechain: false,
    type: 'system',
    uuid: 's-1',
    subtype: 'informational',
    content: '  Background session idle\n',
    timestamp: at(3),
  },
  said(id, 'assistant', 'a-1', 4, [{ type: 'tool_use', id: 'toolu_2', name: 'Read', input: { file_path: '/code/app/README.md' } }]),
]);
blockedSession('t-silent');
journal('t-working', started('claude'));
fs.writeFileSync(
  registry,
  JSON.stringify([
    ...(JSON.parse(fs.readFileSync(registry, 'utf8')) as object[]),
    { name: 'ae/t-working/1', sessionId: randomUUID(), kind: 'background', state: 'working', status: 'busy', startedAt: T0 },
  ]),
);

const record = fs.readFileSync(recordFile, 'utf8');

/** What the board sends, through vite's proxy: JSON, same-origin, and Host rewritten to the api's. */
const BOARD = {
  'content-type': 'application/json',
  'sec-fetch-site': 'same-origin',
  origin: 'http://localhost:5173',
  host: '127.0.0.1:8787',
};

const ask = (step: string, body: unknown, headers: Record<string, string> = BOARD, run = R) =>
  app.request(`/api/runs/${run}/steps/${step}/retry`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

/** Every file under the run's asks directory, waiting or consumed. */
const asked = (run = R): string[] => {
  const dir = path.join(root, 'runs', `${run}.asks`);
  return fs.existsSync(dir) ? (fs.readdirSync(dir, { recursive: true }) as string[]).sort() : [];
};

/** Nothing was written: no ask, and the run's record as it was. */
const nothingWritten = (why: string) => {
  assert.deepEqual(asked(), [], `no ask file: ${why}`);
  assert.equal(fs.readFileSync(recordFile, 'utf8'), record, `the run's record untouched: ${why}`);
};

/**
 * What the package's `retryRun` refuses `how` for, word for word — given the harness's word, as `nemia retry` gives it: what `nemia retry`
 * prints.
 */
const retryRefuses = async (step: string, how: RetryHow): Promise<string> => {
  try {
    await runWith(engine(), retryRun(R, step, how, { stopBlocked: true }));
  } catch (err) {
    return (err as Error).message;
  }
  return assert.fail(`retry() asked for ${step} (${JSON.stringify(how)}), and should have refused`);
};

const detail = async (id = R) => (await app.request(`/api/runs/${id}`)).json() as Promise<RunDetail>;
const summary = async (id = R) => ((await (await app.request('/api/runs')).json()) as RunSummary[]).find((r) => r.id === id)!;
const lastLineOf = async (step: string): Promise<string | null> => (await detail()).steps.find((s) => s.name === step)!.lastLine;

test("a step says what a person has to know to act — the question of one signed off blocked, and that the harness blocked a session — on both endpoints, and on the run's detail what the session said last", async () => {
  const waits = { words: 'waiting for a permission prompt', advice: 'answer it in Claude Code: claude agents, session ae/t-held/1' };
  const expected = [
    { name: 'implement', needs: blocked.needs, blockedByHarness: false, waitingFor: null },
    { name: 'theme', needs: null, blockedByHarness: false, waitingFor: null },
    { name: 'tokens', needs: null, blockedByHarness: false, waitingFor: null },
    { name: 'held', needs: null, blockedByHarness: true, waitingFor: waits },
    { name: 'idle', needs: null, blockedByHarness: true, waitingFor: null },
    { name: 'silent', needs: null, blockedByHarness: true, waitingFor: null },
    { name: 'working', needs: null, blockedByHarness: false, waitingFor: null },
    { name: 'review', needs: null, blockedByHarness: false, waitingFor: null },
  ];
  const lines: Record<string, string | null> = {
    /** Its last `text` event, not the call before it nor the prompt: what the harness wrote into the conversation. */
    held: LOGIN,
    /** Its last `system` event, trimmed, past the call after it. */
    idle: 'Background session idle',
    /** Nothing to quote. */
    silent: null,
  };
  const run = await detail();
  assert.deepEqual(
    run.steps.map(({ name, needs, blockedByHarness, waitingFor, lastLine }) => ({
      name,
      needs,
      blockedByHarness,
      waitingFor,
      lastLine,
    })),
    expected.map((step) => ({ ...step, lastLine: lines[step.name] ?? null })),
    "held's harness says what it waits for, in the package's words, naming the session to answer it in; idle and silent are blocked by a harness that said nothing about what for, a word missing and not a step reading differently; silent, with no conversation to read, is blocked all the same; working's session is still at work, nothing needed",
  );
  const listed = (await summary()).steps;
  assert.deepEqual(
    listed.map(({ name, needs, blockedByHarness, waitingFor }) => ({ name, needs, blockedByHarness, waitingFor })),
    expected,
    'the list carries the word too: it is off the views the request already read, and costs no observation of its own',
  );
  assert.equal(
    listed.some((step) => Object.hasOwn(step, 'lastLine')),
    false,
    'the list carries no last line: it reads no conversation',
  );
  assert.deepEqual(
    run.steps.filter((s) => s.blockedByHarness).map((s) => s.status),
    ['needs-human', 'needs-human', 'needs-human'],
    "the engine's word on a session the harness blocked: `needs-human`",
  );
  assert.deepEqual(run.waitingOnYou, ['implement', 'theme'], 'a session the harness blocked is waiting on nobody the package names');
  assert.deepEqual(
    run.steps.map((s) => s.asked),
    [null, null, null, null, null, null, null, null],
  );
});

test("REFUSED at shipped defaults: the list observes the harness once however many sessions it blocked — only a run's detail reads their last lines, an observation each", async () => {
  let before = observations();
  await summary();
  assert.equal(
    observations() - before,
    1,
    'GET /api/runs, with three sessions the harness blocked: one `claude agents`, for every task at once',
  );
  before = observations();
  await detail();
  assert.equal(
    observations() - before,
    1 + 3,
    "GET /api/runs/:id: one for every task at once, and one for each blocked session's last line; theme's refused check's output (checksOf) is read on the check's own harness, which runs no `claude agents`, the engine's view observing a task's own harness alone",
  );
});

test("what a blocked session's harness waits for is read afresh on every request: the word changes with the registry, and goes when the harness stops saying it", async () => {
  const setWait = (word: string | undefined) => {
    const rows = JSON.parse(fs.readFileSync(registry, 'utf8')) as Array<Record<string, unknown>>;
    for (const row of rows)
      if (row.name === 'ae/t-held/1') {
        delete row.waitingFor;
        if (word) row.waitingFor = word;
      }
    fs.writeFileSync(registry, JSON.stringify(rows));
  };
  const heldStep = async () => (await summary()).steps.find((s) => s.name === 'held')!;

  setWait('workspace trust dialog');
  assert.deepEqual(
    (await heldStep()).waitingFor,
    {
      words: 'waiting for a workspace trust dialog',
      advice: 'answer it in Claude Code: claude agents, session ae/t-held/1',
    },
    "the pass's own word, whatever the last pass carried",
  );
  assert.doesNotMatch(JSON.stringify(await heldStep()), /permission prompt/, 'nothing of the old word is left');
  assert.equal(
    (await heldStep()).status,
    'needs-human',
    "GET /api/runs says the engine's bare word, which the board's chip and needsOf compare exactly: the wait is beside it, never in it",
  );

  setWait(undefined);
  const silent = await heldStep();
  assert.deepEqual(
    [silent.waitingFor, silent.blockedByHarness, silent.status],
    [null, true, 'needs-human'],
    'a harness that stops saying: still blocked, and nothing said about what for',
  );

  setWait('permission prompt');
  assert.equal((await heldStep()).waitingFor!.words, 'waiting for a permission prompt', 'and back, as the tests after this one have it');
});

test("a blocked session's last line follows its conversation: words written since are read from where the last read stopped, and a call alone moves nothing", async () => {
  await detail();
  fs.appendFileSync(
    transcriptFile(held),
    jsonl([said(held, 'assistant', 'a-4', 7, [{ type: 'tool_use', id: 'toolu_3', name: 'Bash', input: { command: 'git status' } }])]),
  );
  assert.equal(await lastLineOf('held'), LOGIN);
  fs.appendFileSync(
    transcriptFile(held),
    jsonl([said(held, 'assistant', 'a-5', 8, [{ type: 'text', text: 'Logged in again; carrying on.' }])]),
  );
  assert.equal(await lastLineOf('held'), 'Logged in again; carrying on.');
  write(transcriptFile(held), jsonl([said(held, 'assistant', 'a-1', 3, [{ type: 'text', text: LOGIN }])]));
  assert.equal(
    await lastLineOf('held'),
    LOGIN,
    'replaced by a shorter conversation, which no cursor of the last read fits: read from its start',
  );

  write(
    transcriptFile(held),
    jsonl([
      said(held, 'assistant', 'a-1', 3, [{ type: 'text', text: 'Waiting on you.' }]),
      said(held, 'user', 'u-1', 4, [{ type: 'text', text: 'Log in and carry on.' }]),
    ]),
  );
  assert.equal(
    await lastLineOf('held'),
    'Waiting on you.',
    "what the session said, and never what it was told: a brief, a `nemia say` and every tool result are `user` events, and the board would otherwise read a person's own words back at them as the reason the harness stopped; the conversation before it ends differently, so the line can only come from the filter",
  );
});

test('REFUSED at shipped defaults: an ask another site could make — a page on another site (403), a name that is not this machine (403), a body not sent as application/json (415) — and nothing is written', async () => {
  const body = { mode: 'nudge', message: 'Postgres.' };
  for (const site of ['cross-site', 'same-site', 'none']) {
    const res = await ask('implement', body, { ...BOARD, 'sec-fetch-site': site });
    assert.equal(res.status, 403, site);
    const { error } = (await res.json()) as { error: string };
    assert.ok(
      error.startsWith(
        `POST /api/runs/${R}/steps/implement/retry refuses a request made by a page on another site (Sec-Fetch-Site: ${site})`,
      ),
      error,
    );
  }
  for (const host of ['evil.example', 'evil.example:8787', 'localhost.evil.example:8787']) {
    const res = await ask('implement', body, { ...BOARD, host });
    assert.equal(res.status, 403, host);
    assert.ok(
      ((await res.json()) as { error: string }).error.startsWith(
        `POST /api/runs/${R}/steps/implement/retry refuses a request addressed to ${host}:`,
      ),
    );
  }
  for (const type of ['text/plain;charset=UTF-8', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x']) {
    const res = await ask('implement', body, { ...BOARD, 'content-type': type });
    assert.equal(res.status, 415, type);
    assert.ok(
      ((await res.json()) as { error: string }).error.startsWith(
        `POST /api/runs/${R}/steps/implement/retry takes its body as \`content-type: application/json\``,
      ),
    );
  }
  nothingWritten('a request another site could make');
});

test("REFUSED at shipped defaults: an empty message, and a message on a recheck, are 422s in `messageRefusal`'s words — and nothing is written", async () => {
  for (const [step, how] of [
    ['implement', { mode: 'nudge', message: '' }],
    ['implement', { mode: 'fresh', message: '  \n ' }],
    ['theme', { mode: 'recheck', message: 'Look again.' }],
  ] as const) {
    const res = await ask(step, how);
    assert.equal(res.status, 422, JSON.stringify(how));
    const { error } = (await res.json()) as { error: string };
    assert.equal(error, messageRefusal(how, `nemia retry ${R} ${step}`));
    assert.equal(error, await retryRefuses(step, how), "the package's own sentence, and the one `retryRun` refuses with");
    assert.match(
      error,
      how.mode === 'recheck'
        ? /^--message carries your answer into the try's brief, and --recheck files no session/
        : /^--message is empty/,
    );
  }
  nothingWritten('a message the package refuses');
});

test("REFUSED at shipped defaults: a step not waiting on a person, a session still working however it is asked, a recheck of a session the harness blocked, and a recheck with no check that failed are 409s in `retryRefusal`'s words — and nothing is written, and no session stopped", async () => {
  const cases: Array<[string, RetryHow, RegExp]> = [
    ['tokens', { mode: 'nudge' }, /^tokens signed off done and declares no check/],
    ['review', { mode: 'nudge', message: 'Start.' }, /^review has not been filed yet/],
    ['working', { mode: 'nudge' }, /^working is still running, so there is nothing to try again until it ends/],
    ['working', { mode: 'fresh', message: 'Start again.' }, /^working is still running, so there is nothing to try again until it ends/],
    [
      'held',
      { mode: 'recheck' },
      /^--recheck runs a step's check again, and held is running, its session blocked by its harness with nothing signed off: no check of it failed/,
    ],
    ['implement', { mode: 'recheck' }, /^--recheck runs a step's check again, and implement is blocked: no check of it failed/],
  ];
  for (const [step, how, words] of cases) {
    const res = await ask(step, how);
    assert.equal(res.status, 409, `${step} ${JSON.stringify(how)}`);
    const { error } = (await res.json()) as { error: string };
    assert.equal(error, await retryRefuses(step, how));
    assert.match(error, words);
  }
  assert.equal(stops(), 0, 'no session stopped');
  nothingWritten('a step the package will not try again');
});

test('REFUSED: a body that is not an ask (400), and a run or a step that does not exist (404) — and nothing is written', async () => {
  const bodies: Array<[unknown, RegExp]> = [
    ['not json', /^POST …\/retry takes a JSON body/],
    [['nudge'], /^POST …\/retry takes a JSON object/],
    [{}, /^`mode` is how to try the step again[\s\S]*was left out/],
    [{ mode: 'again' }, /^`mode` is how to try the step again[\s\S]*was "again"/],
    [{ mode: 'nudge', model: 'opus' }, /^`model` names the model a new session runs on[\s\S]*goes with "mode": "fresh"/],
    [{ mode: 'fresh', model: '' }, /^`model` names the model a new session runs on[\s\S]*was ""/],
    [{ mode: 'nudge', message: 42 }, /^`message` is what to tell the step[\s\S]*was 42/],
    [
      { mode: 'fresh', model: 3 },
      /^`model` names the model a new session runs on, as `nemia retry --model <m>` does: a name, or left out for the step's own\. This request's was 3\.$/,
    ],
    [{ mode: 'fresh', model: '  ' }, /^`model` names the model a new session runs on[\s\S]*This request's was "  "\.$/],
    [
      { mode: 'nudge', budget: 'five' },
      /^`budget` is the cap to raise to, as `nemia retry --budget <amount>` takes it[\s\S]*This request's was "five": `/,
    ],
  ];
  for (const [body, words] of bodies) {
    const res = await ask('implement', body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.match(((await res.json()) as { error: string }).error, words);
  }
  const noRun = await ask('implement', { mode: 'nudge' }, BOARD, 'r-nope');
  assert.equal(noRun.status, 404);
  assert.match(((await noRun.json()) as { error: string }).error, /^No run 'r-nope' in this store/);
  const noStep = await ask('deploy', { mode: 'nudge' });
  assert.equal(noStep.status, 404);
  assert.match(((await noStep.json()) as { error: string }).error, new RegExp(`^Run '${R}' has no step 'deploy'`));
  nothingWritten('a body that is not an ask');
});

test("an answer as the board sends it is the package's ask: 202 with the try, its file and no `stopFirst`, the run's record untouched, and the step reads `try 2 asked` and waits on nobody — a second ask refused", async () => {
  const res = await ask('implement', { mode: 'nudge', message: 'Postgres, the one in docker-compose.yml.' });
  assert.equal(res.status, 202, await res.clone().text());
  assert.deepEqual(await res.json(), { try: 2, file: askFile(R, 'implement', 2), stopFirst: false });
  const { at: when, ...written } = JSON.parse(fs.readFileSync(askFile(R, 'implement', 2), 'utf8'));
  assert.deepEqual(written, { step: 'implement', try: 2, mode: 'nudge', message: 'Postgres, the one in docker-compose.yml.' });
  assert.ok(!Number.isNaN(Date.parse(when)), when);
  assert.deepEqual(asked(), ['retry-implement-2']);
  assert.equal(fs.readFileSync(recordFile, 'utf8'), record, "the api wrote nothing of the run's record");

  const words = await runWith(engine(), list(engine(), runStore.runs.read(R)));
  const run = await detail();
  const implement = run.steps.find((s) => s.name === 'implement')!;
  assert.equal(implement.note, 'try 2 asked (--nudge, with your answer) — the next tick files it');
  assert.equal(
    implement.note,
    words.steps.find((s) => s.name === 'implement')?.note,
    'as `nemia ls` has it until the tick files the try: a note beside the step',
  );
  assert.deepEqual(implement.asked, {
    try: 2,
    mode: 'nudge',
    model: null,
    message: 'Postgres, the one in docker-compose.yml.',
    stopFirst: false,
  });
  assert.equal(implement.needs, blocked.needs, "the question is still the closeout's");
  assert.deepEqual(run.waitingOnYou, ['theme'], 'and nobody waited on for implement');
  assert.deepEqual((await summary()).waitingOnYou, words.waitingOnYou);

  const again = await ask('implement', { mode: 'fresh', message: 'MySQL.' });
  assert.equal(again.status, 409);
  const { error } = (await again.json()) as { error: string };
  assert.ok(error.startsWith('try 2 of implement is already asked for (--nudge, at '), error);
  assert.deepEqual(asked(), ['retry-implement-2']);

  const recheck = await ask('theme', { mode: 'recheck' });
  assert.equal(recheck.status, 202, await recheck.clone().text());
  assert.deepEqual(
    await recheck.json(),
    { try: 2, file: askFile(R, 'theme', 2), stopFirst: false },
    'a refused check, run again: no message, and no session',
  );
  assert.deepEqual((await detail()).steps.find((s) => s.name === 'theme')!.asked, {
    try: 2,
    mode: 'recheck',
    model: null,
    message: null,
    stopFirst: false,
  });
});

test("a session the harness blocked is continued as `nemia retry` continues it: 202 with the package's `stopFirst`, the ask written with its mode and nothing else — no session stopped, the engine's journals and the run's record as they were — and the step reads `nemia ls`'s `stopping its blocked session`", async () => {
  const journalOf = (taskId: string) => fs.readFileSync(path.join(root, 'engine', 'tasks', `${taskId}.jsonl`), 'utf8');
  const journals = { held: journalOf('t-held'), idle: journalOf('t-idle') };

  const res = await ask('held', { mode: 'nudge' });
  assert.equal(res.status, 202, await res.clone().text());
  assert.deepEqual(await res.json(), { try: 2, file: askFile(R, 'held', 2), stopFirst: true });
  const { at: when, ...written } = JSON.parse(fs.readFileSync(askFile(R, 'held', 2), 'utf8'));
  assert.deepEqual(
    written,
    { step: 'held', try: 2, mode: 'nudge' },
    "Continue, as the board's banner sends it with nothing written: a nudge, and no message",
  );
  assert.ok(!Number.isNaN(Date.parse(when)), when);
  const fresh = await ask('idle', { mode: 'fresh', message: 'Sign in again first.' });
  assert.equal(fresh.status, 202, await fresh.clone().text());
  assert.deepEqual(await fresh.json(), { try: 2, file: askFile(R, 'idle', 2), stopFirst: true });
  const { at: freshWhen, ...freshly } = JSON.parse(fs.readFileSync(askFile(R, 'idle', 2), 'utf8'));
  assert.deepEqual(
    freshly,
    { step: 'idle', try: 2, mode: 'fresh', message: 'Sign in again first.' },
    'a new session with something to tell it: the ask carries both, as `nemia retry --fresh --message` writes them',
  );
  assert.ok(!Number.isNaN(Date.parse(freshWhen)), freshWhen);

  assert.equal(fs.readFileSync(recordFile, 'utf8'), record, "the api wrote nothing of the run's record");
  assert.deepEqual({ held: journalOf('t-held'), idle: journalOf('t-idle') }, journals, "nor of the engine's journals");
  assert.equal(stops(), 0, "and stopped no session: the api wrote the asks and nothing else, stopping the session is the tick's");

  const words = await runWith(engine(), list(engine(), runStore.runs.read(R)));
  const noteOf = (name: string) => words.steps.find((s) => s.name === name)?.note;
  const run = await detail();
  const held = run.steps.find((s) => s.name === 'held')!;
  assert.equal(held.note, 'try 2 asked (--nudge) — stopping its blocked session, then the tick files it');
  assert.equal(
    held.note,
    noteOf('held'),
    'as `nemia ls` has it until a tick stops the session: the note says the session is stopped first',
  );
  assert.deepEqual(held.asked, { try: 2, mode: 'nudge', model: null, message: null, stopFirst: true });
  assert.deepEqual([held.status, held.blockedByHarness], ['needs-human', true], 'still blocked: no tick has stopped it');
  const idle = run.steps.find((s) => s.name === 'idle')!;
  assert.equal(idle.note, 'try 2 asked (--fresh, with your answer) — stopping its blocked session, then the tick files it');
  assert.equal(idle.note, noteOf('idle'));
  assert.deepEqual(idle.asked, { try: 2, mode: 'fresh', model: null, message: 'Sign in again first.', stopFirst: true });
  const listed = (await summary()).steps.filter((s) => s.name === 'held' || s.name === 'idle');
  assert.deepEqual(
    listed.map((s) => s.note),
    [noteOf('held'), noteOf('idle')],
    'the list says it too',
  );
  assert.deepEqual(run.waitingOnYou, words.waitingOnYou);

  const again = await ask('held', { mode: 'nudge' });
  assert.equal(again.status, 409, "asked once: a second Continue is refused in the package's words");
  const { error } = (await again.json()) as { error: string };
  assert.ok(error.startsWith('try 2 of held is already asked for (--nudge, at '), error);
  assert.equal(stops(), 0, 'and still nothing is stopped');
});

test("a try a person answered carries the answer, as `nemia decide` prints it — the note says `answered`, as `list`'s does — and a try nobody answered, none", async () => {
  const A = 'r-answered';
  write(
    path.join(root, 'runs', `${A}.json`),
    JSON.stringify({
      id: A,
      repo: '/code/app',
      workspace: '/code/app',
      baseRef: 'abc123',
      branch: 'main',
      isolate: true,
      brief: 'Answered',
      workflowDir: path.join(root, 'no-such-workflow'),
      createdAt: at(0),
      workflow: [
        { name: 'implement', after: [], body: 'Implement it.' },
        { name: 'plan', after: [], body: 'Plan it.' },
      ],
      steps: {
        /** Signed off blocked, answered with a nudge, and signed off done on the try that answer filed. */
        implement: { taskId: 't-a-implement-try2', tries: [{ taskId: 't-a-implement', then: 'nudge' }] },
        /** Tried again fresh on a person's word, with nothing said: no answer. */
        plan: { taskId: 't-a-plan-try2', tries: [{ taskId: 't-a-plan', then: 'fresh' }] },
      },
    }),
  );
  signedOff('t-a-implement', blocked);
  signedOff('t-a-implement-try2', { outcome: 'done', summary: 'Used Postgres.', artifacts: [] });
  signedOff('t-a-plan', blocked);
  signedOff('t-a-plan-try2', { outcome: 'done', summary: 'Planned it.', artifacts: [] });
  write(
    path.join(root, 'runs', `${A}.asks`, 'done', 'retry-implement-2'),
    JSON.stringify({ mode: 'nudge', message: 'Postgres.', at: at(30) }),
  );
  write(path.join(root, 'runs', `${A}.asks`, 'done', 'retry-plan-2'), JSON.stringify({ mode: 'fresh', at: at(30) }));

  const run = await detail(A);
  const [implement, plan] = run.steps;
  assert.deepEqual(
    implement.tries.map((t: { try: number; answer: string | null; note: string | null }) => [t.try, t.answer, t.note]),
    [
      [1, null, null],
      [2, 'Postgres.', 'try 2, nudged on your word, answered'],
    ],
    'the answer read off the ask as the tick leaves it once it filed the try: consumed, into done/',
  );
  assert.deepEqual(
    plan.tries.map((t: { try: number; answer: string | null; note: string | null }) => [t.try, t.answer, t.note]),
    [
      [1, null, null],
      [2, null, 'try 2, fresh, on your word'],
    ],
  );
  assert.equal(implement.tries[0].closeout!.needs, blocked.needs, "the question the answer answers is on the try before's closeout");
  assert.equal(implement.needs, null, 'the current try signed off done');

  const words = await runWith(engine(), list(engine(), runStore.runs.read(A)));
  for (const [where, said] of [
    ['detail', run],
    ['list', await summary(A)],
  ] as const) {
    assert.deepEqual(
      said.steps.map(({ name, note }) => ({ name, note })),
      words.steps.map(({ name, note }) => ({ name, note: note ?? null })),
      where,
    );
  }
});
