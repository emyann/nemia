/**
 * A gate on the board: a step's handoff that waits for a person, as the api carries it — `gates` and each step's `gate` on a run's detail,
 * the need `approve <step>` on the list and the detail — and POST /api/runs/:id/steps/:step/approve, which approves the step as
 * `nemia approve` does, through the package's `approveRun`, refused in the package's words. Sending a step back from its gate is POST
 * …/retry with words, as `nemia retry --message` is. A gate whose step asks questions as data is answered with `answers` on either:
 * checked against the questions its current closeout asks, and written in the package's words (`approvedAnswerText`, `answerText`).
 *
 * On the stand-ins: the runtime's test engine, each task filed and moved by hand (`engine().settle`), and the test place, under
 * the run records this file seeds. One engine for the file, since its runs are seeded as it loads and its tests read them in turn.
 */
import { root } from '../../test/harness.ts';
import type { DecideCommand, Decidable } from '../decide/decision.ts';
import type { RunDetail } from '../detail/detail.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { approvalFile, approveRun, askFile, list, retryRun, runStore, type RunSummary } from 'agent-orchestrator';
import { answerText, approvedAnswerText, onYouWords, type Question } from 'agent-orchestrator/run';
import { parseWorkflow } from 'agent-orchestrator/workflow';
import { Effect } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import { appOver, beforeEachTest, eachTest, engineFor, runOver } from '../../test/placed.ts';

const stand = eachTest(testPlace);
const standIn = eachTest(testEngine);
const engine = () => engineFor(standIn());
const runWith = runOver(() => stand().layer);
const app = eachTest(() => appOver(standIn(), stand()));

const T0 = Date.parse('2026-09-16T21:00:00.000Z');
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

/** A step's task that ran once on Codex and signed off with `closeout`. */
const signedOff = (taskId: string, closeout: object) => {
  Effect.runSync(engine().file({ id: taskId, brief: 'Do it.', cwd: '/code/app', harness: 'codex' }));
  standIn().settle(taskId, 'succeeded', { exitCode: 0, closeout });
};

const PLAN = { outcome: 'done', summary: '## The plan\n\n- parse the flag\n- store it', needs: null, artifacts: [] };

/**
 * A run of `plan → implement → review`, started `--gate plan`, whose plan signed off: it waits at its gate. Beside them `tokens`, signed
 * off and not gated, and `sketch`, gated by its own `gate: true` and not filed.
 */
const gatedRun = (id: string) => {
  write(
    path.join(root, 'runs', `${id}.json`),
    JSON.stringify({
      id,
      repo: '/code/app',
      workspace: '/code/app',
      baseRef: 'abc123',
      branch: 'main',
      isolate: true,
      brief: 'Parse the --flag option',
      workflowDir: path.join(root, 'no-such-workflow'),
      createdAt: at(0),
      gates: ['plan'],
      workflow: [
        { name: 'plan', after: [], body: 'Plan it.' },
        { name: 'implement', after: ['plan'], body: 'Implement it.' },
        { name: 'review', after: ['implement'], body: 'Review it.' },
        { name: 'tokens', after: [], body: 'Pick the tokens.' },
        { name: 'sketch', after: [], body: 'Sketch it.', gate: true },
      ],
      steps: {
        plan: { taskId: `${id}-plan`, branch: `wf/${id}/plan` },
        implement: { taskId: null },
        review: { taskId: null },
        tokens: { taskId: `${id}-tokens` },
        sketch: { taskId: null },
      },
    }),
  );
  signedOff(`${id}-plan`, PLAN);
  signedOff(`${id}-tokens`, { outcome: 'done', summary: 'Picked them.', needs: null, artifacts: [] });
  return fs.readFileSync(path.join(root, 'runs', `${id}.json`), 'utf8');
};

const R = 'r-gate';
/** The run R's record as each test's seed writes it. */
let record = '';
/** The same run, called off while its plan waited at its gate. */
const CANCELLED = 'r-gate-cancelled';
beforeEachTest(() => {
  record = gatedRun(R);
  gatedRun(CANCELLED);
  write(path.join(root, 'runs', `${CANCELLED}.cancelled`), at(20));
});

/** What the board sends, through vite's proxy: JSON, same-origin, and Host rewritten to the api's. */
const BOARD = {
  'content-type': 'application/json',
  'sec-fetch-site': 'same-origin',
  origin: 'http://localhost:5173',
  host: '127.0.0.1:8787',
};

const approveOver = (step: string, body: unknown, headers: Record<string, string> = BOARD, run = R) =>
  app().request(`/api/runs/${run}/steps/${step}/approve`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
const ask = (step: string, body: unknown, run = R) =>
  app().request(`/api/runs/${run}/steps/${step}/retry`, { method: 'POST', headers: BOARD, body: JSON.stringify(body) });

/** Every file under a run's asks directory, waiting or consumed. */
const asked = (run = R): string[] => {
  const dir = path.join(root, 'runs', `${run}.asks`);
  return fs.existsSync(dir) ? (fs.readdirSync(dir, { recursive: true }) as string[]).sort() : [];
};

/** Nothing was written: no ask nor approval, and the run's record as it was. */
const nothingWritten = (why: string, run = R) => {
  assert.deepEqual(asked(run), [], `no file beside the run: ${why}`);
  assert.equal(
    fs.readFileSync(path.join(root, 'runs', `${run}.json`), 'utf8'),
    record.replaceAll(R, run),
    `the run's record untouched: ${why}`,
  );
};

/** What the package's `approveRun` refuses, word for word: what `nemia approve` prints. */
const approveRefuses = async (step: string, message?: string, run = R): Promise<string> => {
  try {
    await runWith(engine(), approveRun(run, step, message));
  } catch (err) {
    return (err as Error).message;
  }
  return assert.fail(`approve() approved ${step} of ${run}, and should have refused`);
};

/** What POST …/approve answers when it takes an approval (202). */
type Approved = { try: number; at: string; message: string | null; file: string };
const detail = async (id = R) => (await (await app().request(`/api/runs/${id}`)).json()) as RunDetail;
const commandsOf = async (id = R): Promise<DecideCommand[]> =>
  ((await (await app().request(`/api/runs/${id}/decision`)).json()) as Decidable).commands;
const summary = async (id = R) => {
  const found = ((await (await app().request('/api/runs')).json()) as RunSummary[]).find((r) => r.id === id);
  assert.ok(found, `the list has ${id}`);
  return found;
};

test("a run's detail carries its gates and each gated step's gate — awaiting approval, or not signed off yet — and the list and the detail carry the need `approve plan`, in `nemia ls`'s words", async () => {
  const run = await detail();
  assert.deepEqual(run.gates, ['plan', 'sketch'], "the start's gate and the step's own, in the order they run");
  assert.deepEqual(
    run.steps.map(({ name, status, approve, gate }) => ({ name, status, approve, gate })),
    [
      { name: 'plan', status: 'awaiting approval', approve: 'approve plan', gate: { awaiting: true, approval: null } },
      { name: 'implement', status: 'waiting', approve: null, gate: null },
      { name: 'review', status: 'waiting', approve: null, gate: null },
      { name: 'tokens', status: 'unverified · done', approve: null, gate: null },
      { name: 'sketch', status: 'waiting', approve: null, gate: { awaiting: false, approval: null } },
    ],
    'sketch is gated and not signed off: nothing to approve yet',
  );
  assert.deepEqual(
    [run.steps[0].closeout?.summary, run.steps[0].closeout?.body],
    [PLAN.summary.split('\n')[0], PLAN.summary],
    "the closeout a person approves is the step's own: its first line the summary, the whole the body",
  );
  assert.deepEqual(run.waitingOnYou, ['plan']);
  assert.deepEqual(run.onYou, ['approve plan']);

  const words = await runWith(engine(), list(engine(), runStore.runs.read(R)));
  assert.deepEqual(run.onYou, onYouWords(words), "as `nemia ls` has it: the words after `→ waiting on you:` are the package's");
  const listed = await summary();
  assert.deepEqual(listed.waitingOnYou, words.waitingOnYou);
  assert.deepEqual(listed.onYou, ['approve plan']);
  assert.deepEqual(
    listed.steps.map((s) => [s.name, s.approve]),
    [
      ['plan', 'approve plan'],
      ['implement', null],
      ['review', null],
      ['tokens', null],
      ['sketch', null],
    ],
  );
  assert.equal(
    listed.steps.some((s) => Object.hasOwn(s, 'gate')),
    false,
    'the list carries the need, and no gate: the Factory needs no more',
  );

  assert.deepEqual(
    await commandsOf(),
    [
      {
        label: 'approve',
        command: `nemia approve ${R} plan`,
        said: `plan waits at its gate — with words: nemia approve ${R} plan --message "<words>"`,
        step: 'plan',
      },
      { label: 'send back', command: `nemia retry ${R} plan --message "<objection>"`, said: null, step: 'plan' },
    ],
    "the decision offers the gate's two commands, as `nemia decide` prints them under the step, and nothing else on a run with no branch to ship",
  );

  const cancelled = await summary(CANCELLED);
  assert.deepEqual(
    [cancelled.waitingOnYou, cancelled.onYou, cancelled.steps[0].approve],
    [[], [], null],
    'a run called off waits on nobody: no need, though its step still reads as it stands',
  );
});

test('REFUSED: a body that is not an approval (400), a run or a step that does not exist (404), and empty words (422, naming --message) — and nothing is written', async () => {
  const bodies: Array<[unknown, RegExp]> = [
    ['not json', /^POST …\/approve takes a JSON body/],
    [['Ship it.'], /^POST …\/approve takes a JSON object/],
    [null, /^POST …\/approve takes a JSON object/],
    [{ message: 42 }, /^`message` is the words to approve with, which every step after the gate is handed[\s\S]*This request's was 42/],
    [{ message: null }, /^`message` is the words to approve with[\s\S]*This request's was null/],
  ];
  for (const [body, words] of bodies) {
    const res = await approveOver('plan', body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.match(((await res.json()) as { error: string }).error, words);
  }
  const noRun = await approveOver('plan', {}, BOARD, 'r-nope');
  assert.equal(noRun.status, 404);
  assert.match(((await noRun.json()) as { error: string }).error, /^No run 'r-nope' in this store/);
  const noStep = await approveOver('deploy', {});
  assert.equal(noStep.status, 404);
  assert.match(((await noStep.json()) as { error: string }).error, new RegExp(`^Run '${R}' has no step 'deploy'`));
  for (const message of ['', '  \n ']) {
    const res = await approveOver('plan', { message });
    assert.equal(res.status, 422, JSON.stringify(message));
    const { error } = (await res.json()) as { error: string };
    assert.match(error, /^--message is empty, and an approval's words are handed to every step after the gate/);
  }
  nothingWritten('a body that is not an approval');
});

test("REFUSED at shipped defaults: a step not gated, a gated step not signed off yet, and a step of a run called off are 409s in `approvalRefusal`'s words — and nothing is written", async () => {
  const cases: Array<[string, string, RegExp]> = [
    [
      R,
      'tokens',
      new RegExp(
        `^tokens has no gate: what waits on it is filed once it has signed off, with nobody's approval, so there is nothing to approve\\. ${R} is gated at plan, sketch\\.`,
      ),
    ],
    [R, 'implement', /^implement has no gate: /],
    [R, 'sketch', /^sketch has not signed off yet: it has not been filed\. Its gate holds once it has signed off/],
    [CANCELLED, 'plan', new RegExp(`^${CANCELLED} was cancelled at ${at(20).replace(/\./g, '\\.')}, and a cancelled run files nothing`)],
  ];
  for (const [run, step, words] of cases) {
    const res = await approveOver(step, { message: 'Ship it.' }, BOARD, run);
    assert.equal(res.status, 409, `${run} ${step}`);
    const { error } = (await res.json()) as { error: string };
    assert.equal(error, await approveRefuses(step, 'Ship it.', run));
    assert.match(error, words);
  }
  nothingWritten('a step the package will not approve');
  nothingWritten('a step of a run called off', CANCELLED);
});

test("an approval as the board sends it is the package's: 202 with the try, when, the words and its file — the file as `nemia approve` writes it, the record untouched — and the detail reads the approval under the step, which waits on nobody; a second approval refused", async () => {
  const res = await approveOver('plan', { message: 'Ship the second reading.' });
  assert.equal(res.status, 202, await res.clone().text());
  const took = (await res.json()) as Approved;
  assert.deepEqual(
    { ...took, at: undefined },
    { try: 1, at: undefined, message: 'Ship the second reading.', file: approvalFile(R, 'plan', 1) },
  );
  assert.ok(!Number.isNaN(Date.parse(took.at)), took.at);
  assert.deepEqual(JSON.parse(fs.readFileSync(approvalFile(R, 'plan', 1), 'utf8')), {
    step: 'plan',
    try: 1,
    at: took.at,
    message: 'Ship the second reading.',
  });
  assert.deepEqual(asked(), ['approve-plan-1']);
  assert.equal(fs.readFileSync(path.join(root, 'runs', `${R}.json`), 'utf8'), record, "the api wrote nothing of the run's record");
  assert.equal(standIn().stopped.length, 0, 'and stopped nothing');

  const run = await detail();
  const plan = run.steps.find((s) => s.name === 'plan');
  assert.ok(plan);
  assert.deepEqual(plan.gate, { awaiting: false, approval: { try: 1, at: took.at, message: 'Ship the second reading.' } });
  assert.equal(plan.approve, null);
  assert.deepEqual([run.waitingOnYou, run.onYou], [[], []]);
  const words = await runWith(engine(), list(engine(), runStore.runs.read(R)));
  assert.equal(
    plan.status,
    words.steps.find((s) => s.name === 'plan')?.status,
    'as `nemia ls` has it until the tick files what waits: the plan on its own word',
  );
  assert.deepEqual((await summary()).waitingOnYou, words.waitingOnYou, 'and nobody waited on, as `nemia ls` has it');

  const again = await approveOver('plan', { message: 'Ship the first reading.' });
  assert.equal(again.status, 409);
  const { error } = (await again.json()) as { error: string };
  assert.ok(
    error.startsWith(`try 1 of plan is already approved, at ${took.at}, with words: what waits on it is filed on the next tick, once.`),
    error,
  );
  assert.equal(error, await approveRefuses('plan', 'Ship the first reading.'));
  assert.deepEqual(asked(), ['approve-plan-1']);
});

test('an approval with no words is written with none, and the detail reads its words as null', async () => {
  const id = 'r-gate-wordless';
  gatedRun(id);
  const res = await approveOver('plan', {}, BOARD, id);
  assert.equal(res.status, 202, await res.clone().text());
  const took = (await res.json()) as Approved;
  assert.equal(took.message, null);
  const { at: when, ...written } = JSON.parse(fs.readFileSync(approvalFile(id, 'plan', 1), 'utf8'));
  assert.deepEqual([written, when], [{ step: 'plan', try: 1 }, took.at]);
  assert.deepEqual((await detail(id)).steps[0].gate, { awaiting: false, approval: { try: 1, at: took.at, message: null } });
});

test("REFUSED at shipped defaults: sending a step back from its gate without words is a 409 in `retryRefusal`'s words; with words it is the answer box's ask — and then the step waits on nobody, and its approval is refused while the send-back is asked for", async () => {
  const id = 'r-gate-back';
  gatedRun(id);
  for (const how of [{ mode: 'nudge' }, { mode: 'fresh' }] as const) {
    const res = await ask('plan', how, id);
    assert.equal(res.status, 409, JSON.stringify(how));
    const { error } = (await res.json()) as { error: string };
    let refused = '';
    await runWith(engine(), retryRun(id, 'plan', how, { stopBlocked: true })).catch((err: Error) => {
      refused = err.message;
    });
    assert.equal(error, refused);
    assert.match(
      error,
      /^plan is awaiting approval: a try of it sends it back from its gate, and one with no words tells its session nothing to change/,
    );
  }
  assert.deepEqual(asked(id), [], 'nothing written on a send-back with no words');

  const back = await ask('plan', { mode: 'nudge', message: 'Store the flag before you parse it.' }, id);
  assert.equal(back.status, 202, await back.clone().text());
  assert.deepEqual(await back.json(), { try: 2, file: askFile(id, 'plan', 2), stopFirst: false });
  const plan = (await detail(id)).steps[0];
  assert.deepEqual(plan.asked, { try: 2, mode: 'nudge', model: null, message: 'Store the flag before you parse it.', stopFirst: false });
  assert.deepEqual(
    [plan.status, plan.gate, plan.approve],
    ['awaiting approval', { awaiting: true, approval: null }, null],
    'still at its gate until the tick files the try',
  );
  assert.deepEqual((await detail(id)).onYou, [], 'not waiting on you: what is asked of you, you asked');
  assert.deepEqual(
    await (await app().request(`/api/runs/${id}/decision`)).json(),
    { running: true },
    'the send-back is due, so the run moves and waits on nobody: nothing to decide, as `nemia decide` says, and so no gate offered',
  );

  const res = await approveOver('plan', { message: 'Ship it.' }, BOARD, id);
  assert.equal(res.status, 409);
  const { error } = (await res.json()) as { error: string };
  assert.ok(error.startsWith('try 2 of plan is already asked for (--nudge, at '), error);
  assert.equal(error, await approveRefuses('plan', 'Ship it.', id));
  assert.deepEqual(asked(id), ['retry-plan-2']);
});

/** A step declaring `open` as questions in its schema, as the loader reads it and the run freezes it. */
const asking = (name: string, after: string[]) => ({
  ...parseWorkflow(name, '---\nplace: git\noutput: spec.schema.json\n---\nDesign it.\n', () =>
    JSON.stringify({
      type: 'object',
      properties: { open: { 'x-shape': 'questions', description: 'What is undecided.' } },
      required: ['open'],
      additionalProperties: false,
    }),
  ),
  after,
});

const cut: Question = {
  title: 'How is the card cut?',
  body: 'It is big.',
  options: [
    { label: 'a', meaning: 'The shape and the board first.' },
    { label: 'b', meaning: 'All of it at once.' },
  ],
  recommended: 'a',
  multiple: false,
};
const where: Question = {
  title: 'Where do the answers go?',
  body: 'Either or both.',
  options: [
    { label: 'retry', meaning: 'Into the next try.' },
    { label: 'gate', meaning: 'With the approval.' },
  ],
  recommended: null,
  multiple: true,
};

/** A run of `design → implement`, started `--gate design`, whose design signed off asking `cut` and `where`: it waits at its gate. */
const askingRun = (id: string) => {
  write(
    path.join(root, 'runs', `${id}.json`),
    JSON.stringify({
      id,
      repo: '/code/app',
      workspace: '/code/app',
      baseRef: 'abc123',
      branch: 'main',
      isolate: true,
      brief: 'Ask at the gate',
      workflowDir: path.join(root, 'no-such-workflow'),
      createdAt: at(0),
      gates: ['design'],
      workflow: [asking('design', []), { name: 'implement', after: ['design'], body: 'Implement it.' }],
      steps: { design: { taskId: `${id}-design`, branch: `wf/${id}/design` }, implement: { taskId: null } },
    }),
  );
  signedOff(`${id}-design`, { ...PLAN, open: [cut, where] });
};

/** What a request answered when it was refused with 400, and that it wrote nothing beside the run. */
const refused400 = async (res: Response, id: string): Promise<string> => {
  assert.equal(res.status, 400, await res.clone().text());
  assert.deepEqual(asked(id), [], 'nothing written');
  return ((await res.json()) as { error: string }).error;
};

test("REFUSED at shipped defaults: an approval's answers that do not fit the questions the gated step asks now, and answers to a step that asks none, are 400s in `answerRefusal`'s words — and no approval is written", async () => {
  const id = 'r-gate-asks-refused';
  askingRun(id);
  assert.match(
    await refused400(
      await approveOver(
        'design',
        {
          answers: [
            { question: cut.title, chose: ['c'] },
            { question: where.title, chose: ['gate'] },
          ],
        },
        BOARD,
        id,
      ),
      id,
    ),
    /^"How is the card cut\?" offers no "c": its options are "a", "b"\. Read the step's questions again/,
  );
  assert.match(
    await refused400(await approveOver('design', { answers: [{ question: cut.title, chose: ['a'] }] }, BOARD, id), id),
    /^"Where do the answers go\?" is not answered/,
  );
  assert.ok(!fs.existsSync(approvalFile(id, 'design', 1)), 'no approval file');
  assert.match(
    await refused400(await approveOver('design', { answers: 'a' }, BOARD, id), id),
    /^`answers` are a person's answers to the questions the step asks at its gate/,
  );

  const none = 'r-gate-asks-none';
  gatedRun(none);
  for (const answers of [[], [{ question: cut.title, chose: ['a'] }]]) {
    assert.match(
      await refused400(await approveOver('plan', { message: 'Go.', answers }, BOARD, none), none),
      /^The step asks no questions now/,
      JSON.stringify(answers),
    );
  }
  assert.ok(!fs.existsSync(approvalFile(none, 'plan', 1)), 'no approval file');
});

test("an approval's answers that fit are its words, in the package's words for the steps after the gate, the words beside them their note, ending with who answered", async () => {
  const id = 'r-gate-asks';
  askingRun(id);
  const answers = [
    { question: where.title, chose: ['gate'], own: 'And the retry.' },
    { question: cut.title, chose: ['a'] },
  ];
  const res = await approveOver('design', { message: 'Go.', answers }, BOARD, id);
  assert.equal(res.status, 202, await res.clone().text());
  const took = (await res.json()) as Approved;
  const words = approvedAnswerText('design', [cut, where], answers, 'Go.');
  assert.equal(took.message, words);
  const written = JSON.parse(fs.readFileSync(approvalFile(id, 'design', 1), 'utf8')) as { message: string };
  assert.equal(written.message, words);
  assert.ok(words.startsWith("The person's answers to design's questions:"), words);
  assert.ok(words.endsWith('Note: Go.\n\nAnswered by: person, on the board'), words);
  assert.deepEqual((await detail(id)).steps[0].gate, { awaiting: false, approval: { try: 1, at: took.at, message: words } });
});

test("a send-back from a gate that asks carries the answers as its try's message, in `answerText`'s words, its objection their note; answers that do not fit are a 400 and nothing is written", async () => {
  const id = 'r-gate-asks-back';
  askingRun(id);
  assert.match(
    await refused400(await ask('design', { mode: 'nudge', answers: [{ question: cut.title, chose: ['a'] }] }, id), id),
    /^"Where do the answers go\?" is not answered/,
  );
  const answers = [
    { question: cut.title, chose: ['b'] },
    { question: where.title, chose: ['retry'] },
  ];
  const back = await ask('design', { mode: 'nudge', message: 'Cut it smaller.', answers }, id);
  assert.equal(back.status, 202, await back.clone().text());
  const written = JSON.parse(fs.readFileSync(askFile(id, 'design', 2), 'utf8')) as { message: string };
  assert.equal(written.message, answerText([cut, where], answers, 'Cut it smaller.'));
  assert.deepEqual(asked(id), ['retry-design-2']);
});
