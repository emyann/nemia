/**
 * What a step needs from a person, and the board's answer to it: `needs` and the codes (`AwaitingAnswer` via `session`) on each step,
 * `answer` on a try a person answered, and POST /api/runs/:id/steps/:step/retry, which asks for another try as `nemia retry` does — through
 * the package's `retryRun`, given the harness's word as `nemia retry` gives it, and refused in the package's words.
 *
 * One table of what the route refuses, nothing written and no session stopped, then one story: a person answering a blocked step,
 * rechecking a refused check, continuing the sessions the harness blocked, and reading the answered try once the tick took it. The
 * refusals' words are the package's, relayed whole (proven once, `test/refusal.test.ts`): a row reads the status and the facts named.
 *
 * On the stand-ins: the runtime's test engine, each step's task filed and left where this file says by hand, and the test place,
 * under the run records this file seeds. The table runs first: the story writes asks beside the run, and they stay.
 * A session the harness blocked is a task left `needs-human`, its last words planted where the engine's `transcript` reads them; what a
 * harness says such a session waits for is `test/remote.test.ts`'s.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { RunDetail } from '../detail/detail.ts';
import { askFile, list, runStore, type RunSummary } from 'agent-orchestrator';
import { Effect } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import { appOver, beforeEachTest, eachTest, engineFor, runOver } from '../../test/placed.ts';
import { story } from '../../test/checkpoints.ts';

const stand = eachTest(testPlace);
const standIn = eachTest(testEngine);
const engine = () => engineFor(standIn());
const runWith = runOver(() => stand().layer);
const app = eachTest(() => appOver(standIn(), stand()));

type RetryHow = import('agent-orchestrator').RetryHow;

const T0 = Date.parse('2026-09-14T06:00:00.000Z');
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

/** A task filed on `harness` and left in `phase`, with `end` laid over its attempt. */
const task = (
  taskId: string,
  harness: string,
  phase: Parameters<ReturnType<typeof testEngine>['settle']>[1],
  end?: { exitCode?: number; closeout?: object },
) => {
  Effect.runSync(engine().file({ id: taskId, brief: 'Do it.', cwd: '/code/app', harness }));
  standIn().settle(taskId, phase, end);
};
/** A step's task that ran once on Codex and signed off with `closeout`. */
const signedOff = (taskId: string, closeout: object) => task(taskId, 'codex', 'succeeded', { exitCode: 0, closeout });

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
      /** A Claude Code task whose session the harness lists as still at work, with nothing signed: the engine's `working`. */
      working: { taskId: 't-working' },
      review: { taskId: null },
    },
  }),
);
/** Claude Code tasks whose sessions the harness blocked, their attempts never ended: the engine's `needs-human`. */
const blockedSession = (taskId: string) => task(taskId, 'claude', 'needs-human');
beforeEachTest(() => {
  signedOff('t-implement', blocked);
  signedOff('t-theme', { outcome: 'done', summary: 'Themed it.', artifacts: [] });
  task('t-theme-check', 'check', 'failed', { exitCode: 1 });
  signedOff('t-tokens', { outcome: 'done', summary: 'Picked them.', artifacts: [] });
  blockedSession('t-held');
  blockedSession('t-idle');
  blockedSession('t-silent');
  task('t-working', 'claude', 'working');
});

const record = fs.readFileSync(recordFile, 'utf8');

/** What the board sends, through vite's proxy: JSON, same-origin, and Host rewritten to the api's. */
const BOARD = {
  'content-type': 'application/json',
  'sec-fetch-site': 'same-origin',
  origin: 'http://localhost:5173',
  host: '127.0.0.1:8787',
};

const ask = (step: string, body: unknown, headers: Record<string, string> = BOARD, run = R) =>
  app().request(`/api/runs/${run}/steps/${step}/retry`, {
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

const detail = async (id = R) => (await app().request(`/api/runs/${id}`)).json() as Promise<RunDetail>;
const summary = async (id = R) => ((await (await app().request('/api/runs')).json()) as RunSummary[]).find((r) => r.id === id)!;

/** The error a refused ask answered with, its status `status`. */
const refusedWith = async (res: Response, status: number, said: string): Promise<string> => {
  assert.equal(res.status, status, said);
  return ((await res.json()) as { error: string }).error;
};

test('POST …/retry: what it refuses — a message it will not carry, a step not waiting on a person, a body that is not an ask, a run or step not there — and nothing written, no session stopped', async (t) => {
  await t.test(
    'REFUSED at shipped defaults: an empty message, and a message on a recheck, are 422s, each naming the flag it is of',
    async () => {
      for (const [step, how, fact] of [
        ['implement', { mode: 'nudge', message: '' }, /^--message is empty/],
        ['implement', { mode: 'fresh', message: '  \n ' }, /^--message is empty/],
        ['theme', { mode: 'recheck', message: 'Look again.' }, /^--message carries[^]*--recheck files no session/],
      ] as const)
        assert.match(await refusedWith(await ask(step, how), 422, JSON.stringify(how)), fact);
      nothingWritten('a message the package refuses');
    },
  );

  await t.test(
    'REFUSED at shipped defaults: a step not waiting on a person, a session still working however it is asked, a recheck of a session the harness blocked, and a recheck with no check that failed are 409s, each naming why',
    async () => {
      const cases: Array<[string, RetryHow, RegExp]> = [
        ['tokens', { mode: 'nudge' }, /^tokens signed off done and declares no check/],
        ['review', { mode: 'nudge', message: 'Start.' }, /^review has not been filed yet/],
        ['working', { mode: 'nudge' }, /^working is still running/],
        ['working', { mode: 'fresh', message: 'Start again.' }, /^working is still running/],
        ['held', { mode: 'recheck' }, /^--recheck [^]* held is running, its session blocked/],
        ['implement', { mode: 'recheck' }, /^--recheck [^]* implement is blocked: no check/],
      ];
      for (const [step, how, fact] of cases)
        assert.match(await refusedWith(await ask(step, how), 409, `${step} ${JSON.stringify(how)}`), fact);
      assert.equal(standIn().stopped.length, 0, 'no session stopped');
      nothingWritten('a step the package will not try again');
    },
  );

  await t.test('REFUSED: a body that is not an ask (400), naming the key, and a run or a step that does not exist (404)', async () => {
    const bodies: Array<[unknown, RegExp]> = [
      ['not json', /^POST …\/retry takes a JSON body/],
      [['nudge'], /^POST …\/retry takes a JSON object/],
      [{}, /^`mode`[^]*was left out/],
      [{ mode: 'again' }, /^`mode`[^]*was "again"/],
      [{ mode: 'nudge', model: 'opus' }, /^`model`[^]*goes with "mode": "fresh"/],
      [{ mode: 'fresh', model: '' }, /^`model`[^]*was ""/],
      [{ mode: 'nudge', message: 42 }, /^`message`[^]*was 42/],
      [{ mode: 'fresh', model: 3 }, /^`model`[^]*`nemia retry --model <m>`[^]*was 3\.$/],
      [{ mode: 'fresh', model: '  ' }, /^`model`[^]*was "  "\.$/],
      [{ mode: 'nudge', budget: 'five' }, /^`budget`[^]*`nemia retry --budget <amount>`[^]*was "five": `/],
    ];
    for (const [body, fact] of bodies) assert.match(await refusedWith(await ask('implement', body), 400, JSON.stringify(body)), fact);
    assert.match(await refusedWith(await ask('implement', { mode: 'nudge' }, BOARD, 'r-nope'), 404, 'no run'), /^No run 'r-nope'/);
    assert.match(await refusedWith(await ask('deploy', { mode: 'nudge' }), 404, 'no step'), new RegExp(`^Run '${R}' has no step 'deploy'`));
    nothingWritten('a body that is not an ask');
  });
});

/** One event of a session's transcript, as the engine's `transcript` answers it. */
const event = (id: string, s: number, role: 'user' | 'assistant' | 'system', kind: 'text' | 'tool_use' | 'system', text?: string) => ({
  id,
  at: at(s),
  role,
  kind,
  ...(text === undefined ? {} : { text }),
});

test("a blocked session's last line is what it said last — its last `text` or `system` event, trimmed, never what it was told — read on a run's detail alone, and followed from where the last read stopped", async () => {
  const login = 'Could not refresh your login · Try again in a minute';
  const held = [
    event('u-1', 2, 'user', 'text', 'Hold on.'),
    event('a-1', 3, 'assistant', 'text', 'Reading the tests first.'),
    event('a-2', 4, 'assistant', 'tool_use'),
    event('a-3', 6, 'assistant', 'text', login),
  ];
  standIn().plantTranscript('t-held', 1, held);
  standIn().plantTranscript('t-idle', 1, [
    event('u-1', 2, 'user', 'text', 'Idle on.'),
    event('s-1', 3, 'system', 'system', '  Session idle\n'),
    event('a-1', 4, 'assistant', 'tool_use'),
  ]);
  standIn().plantTranscript('t-implement', 1, [event('a-1', 2, 'assistant', 'text', 'Which database?')]);
  const WAITED = ['held', 'idle', 'silent', 'implement'];
  const lastLines = async () =>
    Object.fromEntries((await detail()).steps.filter((step) => WAITED.includes(step.name)).map((step) => [step.name, step.lastLine]));
  assert.deepEqual(
    await lastLines(),
    { held: login, idle: 'Session idle', silent: null, implement: null },
    "held's last text, past the call before it; idle's system line, trimmed, past the call after it; silent, with nothing said, none; and none for a step its closeout blocked, though its session said something",
  );
  assert.equal(
    (await summary()).steps.some((step) => Object.hasOwn(step, 'lastLine')),
    false,
    'the list carries no last line: it reads no conversation',
  );

  const since = [...held, event('a-4', 7, 'assistant', 'tool_use')];
  standIn().plantTranscript('t-held', 1, since);
  assert.equal((await lastLines()).held, login, 'a call alone moves nothing: read from where the last read stopped, it says nothing');
  standIn().plantTranscript('t-held', 1, [...since, event('a-5', 8, 'assistant', 'text', 'Logged in again; carrying on.')]);
  assert.equal((await lastLines()).held, 'Logged in again; carrying on.', 'words written since are read');
  standIn().plantTranscript('t-held', 1, [
    ...since,
    event('a-5', 8, 'assistant', 'text', 'Logged in again; carrying on.'),
    event('u-3', 9, 'user', 'text', 'Log in and carry on.'),
  ]);
  assert.equal(
    (await lastLines()).held,
    'Logged in again; carrying on.',
    "what the session said, never what it was told: a brief, a `nemia say` and every tool result are `user` events, and the board would otherwise read a person's own words back at them",
  );
});

test('a person answers a blocked step, rechecks a refused check and continues the sessions the harness blocked — each the package’s ask, read on the list and the detail — and reads the answer on its try once the tick took it', async (t) => {
  const s = story(t);
  const tasksOf = () => ['t-held', 't-idle'].map((id) => JSON.stringify(standIn().tasks.get(id)));
  let tasks: string[] = [];

  await s.test(
    "an answer as the board sends it is the package's ask: 202 with the try, its file and no `stopFirst`, the run's record untouched, and the step reads `try 2 asked` and waits on nobody — a second ask refused, a refused check rechecked",
    async () => {
      tasks = tasksOf();
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
      assert.equal(implement.note, 'try 2 asked (--continue, with your answer) — the next tick files it');
      assert.equal(implement.note, words.steps.find((s) => s.name === 'implement')?.note, 'as `nemia ls` has it: a note beside the step');
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
      assert.ok(error.startsWith('try 2 of implement is already asked for (--continue, at '), error);
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
    },
  );

  await s.test(
    "a session the harness blocked is continued as `nemia retry` continues it: 202 with the package's `stopFirst`, the ask written with its mode and nothing else — no session stopped, the engine's tasks and the run's record as they were — and the step reads `nemia ls`'s `stopping its blocked session`",
    async () => {
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
        'both, as `nemia retry --fresh --message` writes them',
      );
      assert.ok(!Number.isNaN(Date.parse(freshWhen)), freshWhen);

      assert.equal(fs.readFileSync(recordFile, 'utf8'), record, "the api wrote nothing of the run's record");
      assert.deepEqual(tasksOf(), tasks, "nor of the engine's tasks");
      assert.deepEqual([standIn().said, standIn().interrupts], [[], []], 'and said nothing to a session');
      assert.equal(
        standIn().stopped.length,
        0,
        "and stopped no session: the api wrote the asks and nothing else, stopping the session is the tick's",
      );

      const words = await runWith(engine(), list(engine(), runStore.runs.read(R)));
      const noteOf = (name: string) => words.steps.find((s) => s.name === name)?.note;
      const run = await detail();
      const held = run.steps.find((s) => s.name === 'held')!;
      assert.equal(held.note, 'try 2 asked (--continue) — stopping its blocked session, then the tick files it');
      assert.equal(
        held.note,
        noteOf('held'),
        'as `nemia ls` has it until a tick stops the session: the note says the session is stopped first',
      );
      assert.deepEqual(held.asked, { try: 2, mode: 'nudge', model: null, message: null, stopFirst: true });
      assert.deepEqual(
        [held.status, held.reason, held.via],
        ['needs-human', 'AwaitingAnswer', 'session'],
        'still blocked: no tick has stopped it',
      );
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
      assert.ok(error.startsWith('try 2 of held is already asked for (--continue, at '), error);
      assert.equal(standIn().stopped.length, 0, 'and still nothing is stopped');
    },
  );

  await s.test(
    "a try a person answered carries the answer, as `nemia decide` prints it — the note says `answered`, as `list`'s does — and a try nobody answered, none",
    async () => {
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
            implement: { taskId: 't-a-implement-try2', tries: [{ taskId: 't-a-implement', cause: 'nudge' }] },
            /** Tried again fresh on a person's word, with nothing said: no answer. */
            plan: { taskId: 't-a-plan-try2', tries: [{ taskId: 't-a-plan', cause: 'fresh' }] },
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
    },
  );
});
