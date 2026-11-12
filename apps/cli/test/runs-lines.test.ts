/**
 * What the run's runners read and print, pure, off the api's answers: a person's `--answer`s numbered and lettered as `nemia decide`
 * prints them into the `answers` the api takes, `--budget <step>=<amount>` and `--model <step>=<model>` read, a plan card's frontmatter
 * read off a file, an `--input` sent as text or bytes; and the lines each verb prints of what the api answered. A refusal asserts its
 * exit code and what it names, never its sentence.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { Refused } from '../src/refused.ts';
import { cancelLines, holdLines, refreshLines, routeLines, waitLines } from '../src/commands/runs/act.ts';
import { approveLines, budgetsOf, retryLines, sayLines } from '../src/commands/runs/answer.ts';
import { numberedAnswers } from '../src/commands/runs/answers.ts';
import { nowLines, pauseLines, timeoutLines } from '../src/commands/runs/pause.ts';
import { inputOf, modelsOf, planCardOf } from '../src/commands/runs/start.ts';

/** `act` refused, exit 2, its words naming each of `named`. */
const refused = (act: () => unknown, ...named: (string | RegExp)[]): void =>
  assert.throws(act, (err: unknown) => {
    assert.ok(err instanceof Refused, String(err));
    assert.equal(err.code, 2);
    for (const n of named) assert.match(err.message, typeof n === 'string' ? new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) : n);
    return true;
  });

const QUESTIONS = [
  {
    title: 'Which store?',
    body: '',
    options: [
      { label: 'redis', meaning: '' },
      { label: 'memory', meaning: '' },
    ],
    recommended: 'redis',
    multiple: false,
  },
  {
    title: 'Which tests?',
    body: '',
    options: [
      { label: 'unit', meaning: '' },
      { label: 'e2e', meaning: '' },
      { label: 'none', meaning: '' },
    ],
    recommended: 'unit',
    multiple: true,
  },
];

test('--answer n=letter resolves to the question and label, several letters and own words too, numbered from 1 across the step', () => {
  assert.deepEqual(numberedAnswers(QUESTIONS, ['1=b', '2=a,b: and a smoke test'], 'r-1'), [
    { question: 'Which store?', chose: ['memory'] },
    { question: 'Which tests?', chose: ['unit', 'e2e'], own: 'and a smoke test' },
  ]);
  assert.deepEqual(numberedAnswers(QUESTIONS, ['1: neither, a file'], 'r-1'), [
    { question: 'Which store?', chose: [], own: 'neither, a file' },
  ]);
  assert.deepEqual(numberedAnswers([], ['1=a'], 'r-1'), [], 'a step that asks none is the api to refuse');
});

test('REFUSED, exit 2: an --answer in no form, a question past the last, a letter the question does not offer', () => {
  refused(() => numberedAnswers(QUESTIONS, ['a=1'], 'r-1'), '--answer a=1');
  refused(() => numberedAnswers(QUESTIONS, ['3=a'], 'r-1'), 'nemia decide r-1');
  refused(() => numberedAnswers(QUESTIONS, ['1=c'], 'r-1'), 'a (redis)', 'b (memory)');
});

test('--budget step=amount reads into budgets; one that is not a step and dollars above zero is refused, exit 2', () => {
  assert.deepEqual(budgetsOf(['implement=60', 'review=2.5'], 'r-1', 'ship'), [
    { step: 'implement', usd: 60 },
    { step: 'review', usd: 2.5 },
  ]);
  for (const bad of ['60', 'implement=', '=60', 'implement=0', 'implement=$5'])
    refused(() => budgetsOf([bad], 'r-1', 'ship'), 'nemia approve r-1 ship --budget');
});

test('--model step=model reads into models; one that is not a step and a model is refused, exit 2', () => {
  assert.deepEqual(modelsOf(['implement=opus', 'review=sonnet']), { implement: 'opus', review: 'sonnet' });
  assert.equal(modelsOf([]), undefined);
  refused(() => modelsOf(['opus']), '--model <step>=<model>');
});

test("a plan card's file gives its body, workflow: and after:; a file with no block of keys is the whole brief", () => {
  assert.deepEqual(planCardOf('c.md', '---\nworkflow: dev\n---\nDo it.\n', []), { body: 'Do it.', workflow: 'dev', after: [] });
  assert.deepEqual(planCardOf('c.md', '---\nworkflow: dev\nafter: a, b\n---\nDo it.\n', ['r-1', 'r-2']), {
    body: 'Do it.',
    workflow: 'dev',
    after: ['a', 'b'],
  });
  assert.equal(planCardOf('c.md', 'Do it.\n', []), null);
  assert.equal(planCardOf('c.md', '---\nA sentence: not a key\n---\nDo it.\n', []), null);
});

test("REFUSED, exit 2: a key a plan's card lacks, naming nemia inbox add; an after: with no --after, naming --after", () => {
  refused(() => planCardOf('c.md', '---\nworkflow: dev\nrepo: /x\n---\nDo it.\n', []), 'nemia inbox add c.md', '`repo`');
  refused(() => planCardOf('c.md', '---\nafter: a\n---\nDo it.\n', []), '--after');
});

test('an --input is sent as text where its bytes are UTF-8, else as base64, by its name alone; a file not there is refused', () => {
  const dir = scratch('nemia-runs-inputs-');
  fs.writeFileSync(path.join(dir, 'notes.md'), 'hello\n');
  fs.writeFileSync(path.join(dir, 'shot.png'), Buffer.from([0x89, 0x50, 0xff, 0x00]));
  assert.deepEqual(inputOf(path.join(dir, 'notes.md')), { name: 'notes.md', text: 'hello\n' });
  assert.deepEqual(inputOf(path.join(dir, 'shot.png')), {
    name: 'shot.png',
    base64: Buffer.from([0x89, 0x50, 0xff, 0x00]).toString('base64'),
  });
  refused(() => inputOf(path.join(dir, 'gone.md')), 'gone.md');
});

test('nemia retry prints the try asked for, how, with what, and when it is filed; of a round, the round and its cap', () => {
  const typed = { runId: 'r-1', step: 'implement', round: false, mode: 'fresh', answered: false };
  assert.deepEqual(retryLines({ try: 3, file: '/a/retry-implement-3' }, typed), [
    'r-1  asked: try 3 of implement (--fresh) — the next tick files it, once',
    '   /a/retry-implement-3',
  ]);
  const [line] = retryLines({ try: 3, file: 'f', stopFirst: true }, { ...typed, model: 'opus', budget: 5, answered: true });
  assert.match(line ?? '', /\(--model opus, --budget 5\), with your answers — its harness blocked its session/);
  const [round] = retryLines({ step: 'review', round: 4, budget: 30, file: 'f' }, { ...typed, round: true });
  assert.match(round ?? '', /round 4 of review's loop, its cap raised to \$30/);
});

test('nemia approve prints the try approved and what the next tick files, each cap, the file; a loop accepted as it stands', () => {
  const approved = {
    step: 'ship',
    try: 1,
    at: 't',
    message: 'go',
    file: 'f',
    next: 'step' as const,
    caps: [{ step: 'implement', usd: 60, above: true, workflow: 40 }],
  };
  assert.deepEqual(approveLines(approved, 'r-1', false), [
    'r-1  approved: try 1 of ship, with your words — the next tick files ship',
    "   cap  implement $60.00 (above the workflow's $40.00)",
    '   f',
  ]);
  assert.match(approveLines({ ...approved, loop: true, next: 'nothing' }, 'r-1', false)[0] ?? '', /accepted: try 1 of ship as it stands/);
});

test('nemia say prints where the words went, then the words fenced longer than any run of backticks in them', () => {
  const lines = sayLines({ at: 't', attempt: 2, text: 'use ``` here', after: null, try: 1, taskId: 'task-1' }, 'r-1', 'implement');
  assert.match(lines[0] ?? '', /said to implement, try 1, attempt 2, at t — journalled on task-1/);
  assert.deepEqual(lines.slice(1), ['   ````text', '   use ``` here', '   ````']);
  assert.match(
    sayLines({ at: 't', attempt: 1, text: 'x', after: null, kept: true }, 'r-1', 'review')[0] ?? '',
    /kept for review's first try/,
  );
});

test('cancel, hold, route, refresh and wait print what they did off the answer', () => {
  assert.deepEqual(cancelLines({ id: 'r-1', plan: { kind: 'finished', status: 'succeeded' } } as never), [
    'r-1  already succeeded — nothing to stop',
  ]);
  assert.match(holdLines({ id: 'r-1', lifted: false, hold: { until: [], why: 'legal' } } as never)[0] ?? '', /nemia hold r-1 --off/);
  assert.match(holdLines({ id: 'r-1', lifted: false, hold: { until: ['a', 'b'] } } as never)[0] ?? '', /held until a and b land/);
  assert.deepEqual(routeLines({ step: 'review', try: 2, route: 'fix', file: 'f' } as never, 'r-1'), [
    'r-1  routed: try 2 of review takes fix — the next tick files what its when: names',
    '   f',
  ]);
  assert.match(refreshLines({ drift: [] }, 'r-1', false)[0] ?? '', /asked: the new revisions/);
  assert.deepEqual(waitLines({ ended: 'bound', lines: [], cursor: '40' }), ['cursor: 40']);
});

test('pause, pause --now and pause-timeout print what they did or would do', () => {
  const pause = { at: 't', by: 'ann', why: 'upgrade' };
  assert.match(pauseLines({ pause }, '')[0] ?? '', /paused since t by ann: upgrade — .*nemia resume resumes it/);
  const now = nowLines([{ run: 'r-1', step: 'implement', kind: 'session' }] as never, false, 'It costs a call.');
  assert.match(now[0] ?? '', /would pause the store and cut 1/);
  assert.equal(now.at(-1), 'nemia pause --now --yes does it.');
  assert.deepEqual(timeoutLines({ timeout: { ms: 600_000, set: false }, wrote: false }), [
    "the store's pause timeout is 10m (the default)",
  ]);
  assert.match(timeoutLines({ timeout: { ms: 900_000, set: true }, wrote: true })[0] ?? '', /is now 15m/);
});
