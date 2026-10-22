/**
 * What a step needs from a person as the harness says it: `needs` and `blockedByHarness` on each step, what a blocked session waits for
 * as Claude Code's registry lists it, read afresh on every request, and its last words off its conversation on disk, followed from where
 * the last read stopped, at an observation a read. The asks a person makes of such a step, on the stand-ins, are `asks.test.ts`'s.
 *
 * At shipped defaults: the api's own engine over a store this file seeds, reading transcripts where Claude Code keeps them
 * (CLAUDE_CONFIG_DIR). The harness's fake `claude` (test/harness.ts) is first on PATH, listing the sessions this file says are running
 * and noting every call, so the registry of the sessions on this machine is never asked, and a test can count what a request costs.
 */
import { config, observations, registry, root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { RunDetail } from '../detail/detail.ts';
import { app } from '../app.ts';
import { Effect } from 'effect';
import { engine, type RunSummary } from 'agent-orchestrator';

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
  assert.equal(
    (await Effect.runPromise(engine().view('t-held'))).waitingFor,
    'workspace trust dialog',
    "the word is the engine's own, off the harness's registry",
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
