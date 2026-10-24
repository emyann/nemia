/**
 * A gate on the board: a step's handoff that waits for a person, as the api carries it — `gates` and each step's `gate` on a run's detail,
 * the need `approve <step>` on the list and the detail — and POST /api/runs/:id/steps/:step/approve, which approves the step as
 * `nemia approve` does, through the package's `approveRun`, refused in the package's words. Sending a step back from its gate is POST
 * …/retry with words, as `nemia retry --message` is. A gate whose step asks questions as data is answered with `answers` on either:
 * checked against the questions its current closeout asks, and written in the package's words (`approvedAnswerText`, `answerText`).
 *
 * One table of what the route refuses, with nothing written, then two stories: a person approving a gate, and a person sending a step
 * back from it. The refusals' words are the package's, relayed whole (proven once, `test/refusal.test.ts`): a row reads the status and
 * the facts the words name.
 *
 * On the stand-ins: the runtime's test engine, each task filed and moved by hand (`engine().settle`), and the test place, under
 * the run records this file seeds. Each 409 is asserted equal to what the package's verb says itself. The table runs first: the
 * stories write beside the runs, and what they write stays.
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
import { story } from '../../test/checkpoints.ts';

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

/** The error a refused request answered with, its status `status`. */
const refusedWith = async (res: Response, status: number, said: string): Promise<string> => {
  assert.equal(res.status, status, said);
  return ((await res.json()) as { error: string }).error;
};

test('POST …/approve: what it refuses — a body, a run or step not there, empty words, a step the package will not approve, answers that do not fit — and nothing written', async (t) => {
  await t.test('a body that is not an approval is a 400, naming what it takes', async () => {
    const bodies: Array<[unknown, RegExp]> = [
      ['not json', /^POST …\/approve takes a JSON body/],
      [['Ship it.'], /^POST …\/approve takes a JSON object/],
      [null, /^POST …\/approve takes a JSON object/],
      [{ message: 42 }, /^`message`[^]*was 42/],
      [{ message: null }, /^`message`[^]*was null/],
    ];
    for (const [body, words] of bodies) assert.match(await refusedWith(await approveOver('plan', body), 400, JSON.stringify(body)), words);
    nothingWritten('a body that is not an approval');
  });

  await t.test('a run or a step that does not exist is a 404, naming it', async () => {
    assert.match(await refusedWith(await approveOver('plan', {}, BOARD, 'r-nope'), 404, 'no run'), /^No run 'r-nope'/);
    assert.match(await refusedWith(await approveOver('deploy', {}), 404, 'no step'), new RegExp(`^Run '${R}' has no step 'deploy'`));
    nothingWritten('a run or a step not there');
  });

  await t.test('empty words are a 422, naming --message', async () => {
    for (const message of ['', '  \n ']) {
      const error = await refusedWith(await approveOver('plan', { message }), 422, JSON.stringify(message));
      assert.match(error, /^--message is empty/);
    }
    nothingWritten('empty words');
  });

  await t.test(
    "REFUSED at shipped defaults: a step not gated, a gated step not signed off yet, and a step of a run called off are 409s in `approvalRefusal`'s words",
    async () => {
      const cases: Array<[string, string, RegExp[]]> = [
        [R, 'tokens', [/^tokens has no gate/, /is gated at plan, sketch\./]],
        [R, 'implement', [/^implement has no gate: /]],
        [R, 'sketch', [/^sketch has not signed off yet/, /has not been filed/]],
        [CANCELLED, 'plan', [new RegExp(`^${CANCELLED} was cancelled at ${at(20).replace(/\./g, '\\.')}`), /files nothing/]],
      ];
      for (const [run, step, facts] of cases) {
        const error = await refusedWith(await approveOver(step, { message: 'Ship it.' }, BOARD, run), 409, `${run} ${step}`);
        assert.equal(error, await approveRefuses(step, 'Ship it.', run));
        for (const fact of facts) assert.match(error, fact, `${run} ${step}`);
      }
      nothingWritten('a step the package will not approve');
      nothingWritten('a step of a run called off', CANCELLED);
    },
  );

  await t.test(
    "REFUSED at shipped defaults: an approval's answers that do not fit the questions the gated step asks now, and answers to a step that asks none, are 400s in `answerRefusal`'s words — and no approval is written",
    async () => {
      const id = 'r-gate-asks-refused';
      askingRun(id);
      const misfit = [
        { question: cut.title, chose: ['c'] },
        { question: where.title, chose: ['gate'] },
      ];
      const misfitSaid = await refused400(await approveOver('design', { answers: misfit }, BOARD, id), id);
      assert.match(misfitSaid, /^"How is the card cut\?" offers no "c"/, 'the question that misfits, by its title');
      assert.match(misfitSaid, /its options are "a", "b"/);
      assert.match(
        await refused400(await approveOver('design', { answers: [{ question: cut.title, chose: ['a'] }] }, BOARD, id), id),
        /^"Where do the answers go\?" is not answered/,
      );
      assert.ok(!fs.existsSync(approvalFile(id, 'design', 1)), 'no approval file');
      assert.match(await refused400(await approveOver('design', { answers: 'a' }, BOARD, id), id), /^`answers` are/);

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
    },
  );
});

test('a person approves a gate on the board: the need on the list and the detail, the approval written as `nemia approve` writes it, then the step waits on nobody', async (t) => {
  const s = story(t);
  let took: Approved | undefined;

  await s.test(
    "a run's detail carries its gates and each gated step's gate — awaiting approval, or not signed off yet — and the list and the detail carry the need `approve plan`, in `nemia ls`'s words",
    async () => {
      const run = await detail();
      assert.deepEqual(run.gates, ['plan', 'sketch'], "the start's gate and the step's own, in the order they run");
      assert.deepEqual(
        run.steps.map(({ name, status, approve, gate }) => ({ name, status, approve, gate })),
        [
          { name: 'plan', status: 'awaiting approval', approve: 'approve plan', gate: { awaiting: true, approval: null } },
          { name: 'implement', status: 'pending', approve: null, gate: null },
          { name: 'review', status: 'pending', approve: null, gate: null },
          { name: 'tokens', status: 'unverified · done', approve: null, gate: null },
          { name: 'sketch', status: 'pending', approve: null, gate: { awaiting: false, approval: null } },
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
      assert.deepEqual(run.onYou, onYouWords(words), 'as `nemia ls` has it after `→ waiting on you:`');
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
        "the decision offers the gate's two commands, as `nemia decide` prints them under the step, and nothing else on a run with no branch to land",
      );

      const cancelled = await summary(CANCELLED);
      assert.deepEqual(
        [cancelled.waitingOnYou, cancelled.onYou, cancelled.steps[0].approve],
        [[], [], null],
        'a run called off waits on nobody: no need, though its step still reads as it stands',
      );
    },
  );

  await s.test(
    "an approval as the board sends it is the package's: 202 with the try, when, the words and its file — the file as `nemia approve` writes it, the record untouched",
    async () => {
      const res = await approveOver('plan', { message: 'Ship the second reading.' });
      assert.equal(res.status, 202, await res.clone().text());
      took = (await res.json()) as Approved;
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
    },
  );

  await s.test('the detail reads the approval under the step, which waits on nobody, as `nemia ls` has it', async () => {
    assert.ok(took);
    const run = await detail();
    const plan = run.steps.find((s) => s.name === 'plan');
    assert.ok(plan);
    assert.deepEqual(plan.gate, { awaiting: false, approval: { try: 1, at: took.at, message: 'Ship the second reading.' } });
    assert.equal(plan.approve, null);
    assert.deepEqual([run.waitingOnYou, run.onYou], [[], []]);
    const words = await runWith(engine(), list(engine(), runStore.runs.read(R)));
    assert.equal(plan.status, words.steps.find((s) => s.name === 'plan')?.status, 'as `nemia ls` has it until the tick files what waits');
    assert.deepEqual((await summary()).waitingOnYou, words.waitingOnYou, 'and nobody waited on, as `nemia ls` has it');
  });

  await s.test('a second approval is refused (409), naming the try approved and when, and nothing more is written', async () => {
    assert.ok(took);
    const error = await refusedWith(await approveOver('plan', { message: 'Ship the first reading.' }), 409, 'approved once');
    assert.ok(error.startsWith(`try 1 of plan is already approved, at ${took.at}`), error);
    assert.equal(error, await approveRefuses('plan', 'Ship the first reading.'));
    assert.deepEqual(asked(), ['approve-plan-1']);
  });

  await s.test('an approval with no words is written with none, and the detail reads its words as null', async () => {
    const id = 'r-gate-wordless';
    gatedRun(id);
    const res = await approveOver('plan', {}, BOARD, id);
    assert.equal(res.status, 202, await res.clone().text());
    const wordless = (await res.json()) as Approved;
    assert.equal(wordless.message, null);
    const { at: when, ...written } = JSON.parse(fs.readFileSync(approvalFile(id, 'plan', 1), 'utf8'));
    assert.deepEqual([written, when], [{ step: 'plan', try: 1 }, wordless.at]);
    assert.deepEqual((await detail(id)).steps[0].gate, { awaiting: false, approval: { try: 1, at: wordless.at, message: null } });
  });

  await s.test(
    "an approval's answers that fit are its words, in the package's words for the steps after the gate, the words beside them their note, ending with who answered",
    async () => {
      const id = 'r-gate-asks';
      askingRun(id);
      const answers = [
        { question: where.title, chose: ['gate'], own: 'And the retry.' },
        { question: cut.title, chose: ['a'] },
      ];
      const res = await approveOver('design', { message: 'Go.', answers }, BOARD, id);
      assert.equal(res.status, 202, await res.clone().text());
      const answered = (await res.json()) as Approved;
      const words = approvedAnswerText('design', [cut, where], answers, 'Go.');
      assert.equal(answered.message, words);
      const written = JSON.parse(fs.readFileSync(approvalFile(id, 'design', 1), 'utf8')) as { message: string };
      assert.equal(written.message, words);
      assert.ok(words.startsWith("The person's answers to design's questions:"), words);
      assert.ok(words.endsWith('Note: Go.\n\nAnswered by: person, on the board'), words);
      assert.deepEqual((await detail(id)).steps[0].gate, { awaiting: false, approval: { try: 1, at: answered.at, message: words } });
    },
  );
});

test('a person sends a step back from its gate: refused without words, asked with them — then its approval is refused — and answers carried as the try’s message', async (t) => {
  const s = story(t);
  const id = 'r-gate-back';

  await s.test(
    "REFUSED at shipped defaults: sending a step back from its gate without words is a 409 in `retryRefusal`'s words, and nothing is written",
    async () => {
      gatedRun(id);
      for (const how of [{ mode: 'nudge' }, { mode: 'fresh' }] as const) {
        const error = await refusedWith(await ask('plan', how, id), 409, JSON.stringify(how));
        let refused = '';
        await runWith(engine(), retryRun(id, 'plan', how, { stopBlocked: true })).catch((err: Error) => {
          refused = err.message;
        });
        assert.equal(error, refused);
        assert.match(error, /^plan is awaiting approval: /);
      }
      assert.deepEqual(asked(id), [], 'nothing written on a send-back with no words');
    },
  );

  await s.test(
    "with words it is the answer box's ask: 202, the step still at its gate until the tick files the try, and the run waits on nobody",
    async () => {
      const back = await ask('plan', { mode: 'nudge', message: 'Store the flag before you parse it.' }, id);
      assert.equal(back.status, 202, await back.clone().text());
      assert.deepEqual(await back.json(), { try: 2, file: askFile(id, 'plan', 2), stopFirst: false });
      const plan = (await detail(id)).steps[0];
      assert.deepEqual(plan.asked, {
        try: 2,
        mode: 'nudge',
        model: null,
        message: 'Store the flag before you parse it.',
        stopFirst: false,
      });
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
    },
  );

  await s.test('its approval is refused while the send-back is asked for (409), and nothing more is written', async () => {
    const error = await refusedWith(await approveOver('plan', { message: 'Ship it.' }, BOARD, id), 409, 'asked for');
    assert.ok(error.startsWith('try 2 of plan is already asked for (--nudge, at '), error);
    assert.equal(error, await approveRefuses('plan', 'Ship it.', id));
    assert.deepEqual(asked(id), ['retry-plan-2']);
  });

  await s.test(
    "a send-back from a gate that asks carries the answers as its try's message, in `answerText`'s words, its objection their note; answers that do not fit are a 400 and nothing is written",
    async () => {
      const asks = 'r-gate-asks-back';
      askingRun(asks);
      assert.match(
        await refused400(await ask('design', { mode: 'nudge', answers: [{ question: cut.title, chose: ['a'] }] }, asks), asks),
        /^"Where do the answers go\?" is not answered/,
      );
      const answers = [
        { question: cut.title, chose: ['b'] },
        { question: where.title, chose: ['retry'] },
      ];
      const back = await ask('design', { mode: 'nudge', message: 'Cut it smaller.', answers }, asks);
      assert.equal(back.status, 202, await back.clone().text());
      const written = JSON.parse(fs.readFileSync(askFile(asks, 'design', 2), 'utf8')) as { message: string };
      assert.equal(written.message, answerText([cut, where], answers, 'Cut it smaller.'));
      assert.deepEqual(asked(asks), ['retry-design-2']);
    },
  );
});
