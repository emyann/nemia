/**
 * The questions a closeout asks, on a run's detail (`StepCloseout.questions`), and a person's answers to them on POST …/retry
 * (`answeredHow`): checked against the questions the step's current closeout asks, written as the words the package gives them
 * (`answerText`), and refused (400) when they do not fit or ride on a recheck. A closeout that asks in free text is answered as before.
 *
 * One table of what the route refuses, then the story of a person reading the questions and answering them.
 *
 * On the stand-ins: the runtime's test engine, each step's task filed and settled with its closeout by hand, and the test place, under
 * the run record this file seeds. The table runs first: the story writes asks beside the run, and they stay.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import { appOver, beforeEachTest, eachTest, engineFor } from '../../test/placed.ts';
import { story } from '../../test/checkpoints.ts';
import type { RunDetail } from '../detail/detail.ts';
import { askFile } from 'agent-orchestrator';
import { answerText, type Question } from 'agent-orchestrator/run';
import { parseWorkflow } from 'agent-orchestrator/workflow';

const T0 = Date.parse('2026-09-30T06:00:00.000Z');
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

const standIn = eachTest(testEngine);
const stand = eachTest(testPlace);
const app = eachTest(() => appOver(standIn(), stand()));

/** A step's task that ran once on Codex and signed off with `closeout`. */
const signedOff = (taskId: string, closeout: object) => {
  Effect.runSync(engineFor(standIn()).file({ id: taskId, brief: 'Do it.', cwd: '/code/app', harness: 'codex' }));
  standIn().settle(taskId, 'succeeded', { exitCode: 0, closeout });
};

/** A step declaring `open` in its schema, and every field of `more`, as the loader reads it and the run freezes it. */
const declaring = (name: string, open: object, more: Record<string, object> = {}) =>
  parseWorkflow(name, '---\nplace: git\noutput: spec.schema.json\n---\nDesign it.\n', () =>
    JSON.stringify({
      type: 'object',
      properties: { open, ...more },
      required: ['open', ...Object.keys(more)],
      additionalProperties: false,
    }),
  );
const QUESTIONS = { 'x-shape': 'questions', description: 'What is undecided.' };

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

const R = 'r-answers';
const closeout = (outcome: string, open: unknown) => ({ outcome, summary: 'Half.', needs: 'Two questions.', artifacts: [], open });
write(
  path.join(root, 'runs', `${R}.json`),
  JSON.stringify({
    id: R,
    repo: '/code/app',
    workspace: '/code/app',
    baseRef: 'abc123',
    branch: 'main',
    isolate: true,
    brief: 'Ask by choices',
    workflowDir: path.join(root, 'no-such-workflow'),
    createdAt: at(0),
    workflow: [
      declaring('design', QUESTIONS),
      declaring('spec', QUESTIONS),
      declaring('broken', QUESTIONS),
      declaring('plain', { type: 'array', items: { type: 'string' } }),
      declaring('twice', QUESTIONS, { later: QUESTIONS }),
    ],
    steps: {
      design: { taskId: 't-a-design' },
      spec: { taskId: 't-a-spec' },
      broken: { taskId: 't-a-broken' },
      plain: { taskId: 't-a-plain' },
      twice: { taskId: 't-a-twice' },
    },
  }),
);
beforeEachTest(() => {
  signedOff('t-a-design', closeout('blocked', [cut, where]));
  signedOff('t-a-spec', closeout('done', [cut]));
  signedOff('t-a-broken', closeout('blocked', [{ ...cut, recommended: 'z' }]));
  signedOff('t-a-plain', closeout('blocked', ['Postgres or MySQL?']));
  signedOff('t-a-twice', { ...closeout('blocked', [cut]), later: [{ ...where, title: cut.title }] });
});

const BOARD = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', host: '127.0.0.1:8787' };
const ask = (step: string, body: unknown) =>
  app().request(`/api/runs/${R}/steps/${step}/retry`, { method: 'POST', headers: BOARD, body: JSON.stringify(body) });
const asksDir = path.join(root, 'runs', `${R}.asks`);
const asked = (): string[] => (fs.existsSync(asksDir) ? (fs.readdirSync(asksDir, { recursive: true }) as string[]).sort() : []);
const refused = async (res: Response): Promise<string> => {
  assert.equal(res.status, 400, await res.clone().text());
  return ((await res.json()) as { error: string }).error;
};

test('POST …/retry with answers: what it refuses — answers that do not fit the questions the step asks now, answers on a recheck, answers that are no list — 400s, and nothing written', async (t) => {
  const rows: Array<[string, string, object, RegExp]> = [
    [
      'an option the question does not offer',
      'design',
      {
        mode: 'nudge',
        answers: [
          { question: cut.title, chose: ['c'] },
          { question: where.title, chose: ['gate'] },
        ],
      },
      /offers no "c": its options are "a", "b"/,
    ],
    [
      'a question left unanswered',
      'design',
      { mode: 'nudge', answers: [{ question: cut.title, chose: ['a'] }] },
      /"Where do the answers go\?" is not answered/,
    ],
    [
      'a step that asks in free text asks no question answers can name',
      'plain',
      { mode: 'nudge', answers: [{ question: 'Postgres or MySQL?', chose: [] }] },
      /asks no questions now/,
    ],
    [
      'nor one whose fields ask one title twice',
      'twice',
      {
        mode: 'nudge',
        answers: [
          { question: cut.title, chose: ['a'] },
          { question: cut.title, chose: ['retry'] },
        ],
      },
      /asks no questions now/,
    ],
    ['answers on a recheck', 'design', { mode: 'recheck', answers: [{ question: cut.title, chose: ['a'] }] }, /a recheck files no session/],
    ['answers that are no list', 'design', { mode: 'nudge', answers: 'a' }, /^`answers` are/],
  ];
  for (const [name, step, body, fact] of rows)
    await t.test(name, async () => {
      assert.match(await refused(await ask(step, body)), fact);
      assert.deepEqual(asked(), []);
    });
});

test('a person reads the questions a closeout asks on the run’s detail and answers them on the try: the answers are its message, in the package’s words', async (t) => {
  const s = story(t);

  await s.test(
    "a closeout's questions are on the run's detail, blocked or done; a field that asks in free text, or does not decode, has none",
    async () => {
      const run = (await (await app().request(`/api/runs/${R}`)).json()) as RunDetail;
      const questions = (name: string) => run.steps.find((s) => s.name === name)!.closeout!.questions;
      assert.deepEqual(questions('design'), [{ field: 'open', questions: [cut, where] }]);
      assert.deepEqual(questions('spec'), [{ field: 'open', questions: [cut] }], 'a done step’s questions, drawn read-only');
      assert.deepEqual(questions('plain'), []);
      assert.deepEqual(questions('broken'), [], 'drawn as any other field');
      assert.deepEqual(
        questions('twice'),
        [],
        'two fields asking one title: an answer names its question by title alone, so it is answered in words',
      );
      assert.equal(run.steps.find((s) => s.name === 'design')!.needs, 'Two questions.', '`needs` stays the one line it was');
    },
  );

  await s.test(
    'answers that fit are the try’s message, in the package’s words, their note the message beside them; a free-text question still takes a message',
    async () => {
      const answers = [
        { question: cut.title, chose: [], own: 'Three ways.' },
        { question: where.title, chose: ['retry', 'gate'] },
      ];
      const res = await ask('design', { mode: 'nudge', message: 'Thanks.', answers });
      assert.equal(res.status, 202, await res.clone().text());
      const written = JSON.parse(fs.readFileSync(askFile(R, 'design', 2), 'utf8')) as { mode: string; message: string };
      assert.equal(written.mode, 'nudge');
      assert.equal(written.message, answerText([cut, where], answers, 'Thanks.'));
      assert.ok(written.message.endsWith('Answered by: person, on the board'), written.message);

      const plain = await ask('plain', { mode: 'nudge', message: 'Postgres.' });
      assert.equal(plain.status, 202, await plain.clone().text());
      assert.equal((JSON.parse(fs.readFileSync(askFile(R, 'plain', 2), 'utf8')) as { message: string }).message, 'Postgres.');
      const twice = await ask('twice', { mode: 'nudge', message: 'Shape first, into the retry.' });
      assert.equal(twice.status, 202, await twice.clone().text());
    },
  );
});
