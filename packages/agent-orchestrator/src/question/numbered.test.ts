/**
 * The terminal's numbering of a step's questions (`numbered.ts`), one table per function: letters past `z` (`letterOf`), the block
 * `nemia decide` prints (`questionLines`), the `--answer` form it offers (`answerForm`), and each `--answer` value resolved to the
 * board's answer or refused (`numberedAnswers`), each refusal row breaking one rule and asserted by the facts it names. The questions
 * as data are in `question.test.ts`; a run's questions answered at the terminal in `test/retry.test.ts` and `test/closeouts.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerForm, letterOf, numberedAnswers, questionLines } from './numbered.ts';
import type { Asked, Question } from './question.ts';
import { namesFor } from '../../test/assessed.ts';

const cut: Question = {
  title: 'How is the card cut?',
  body: 'It is big.\nTwo parts.',
  options: [
    { label: 'one card', meaning: 'All at once.' },
    { label: 'two cards', meaning: 'The shape first.' },
    { label: 'three, cut thin', meaning: 'Smallest.' },
  ],
  recommended: 'two cards',
  multiple: false,
};
const where: Question = {
  title: 'Where do the answers go?',
  body: '',
  options: [
    { label: 'retry', meaning: 'Into the next try.' },
    { label: 'gate', meaning: 'With the approval.' },
  ],
  recommended: null,
  multiple: true,
};
const when: Question = { ...where, title: 'When?', multiple: false };

const asked: Asked[] = [
  { field: 'open', questions: [cut, where] },
  { field: 'later', questions: [when] },
];
const questions = asked.flatMap((a) => a.questions);

/** What `numberedAnswers` says refusing `typed`, or a failure where it resolves them. */
const unresolved = (typed: string[]): string => {
  const read = numberedAnswers(questions, typed, 'nemia decide r-1');
  assert.ok(!Array.isArray(read), `${JSON.stringify(typed)} was resolved: ${JSON.stringify(read)}`);
  return read.error;
};

test('letterOf', async (t) => {
  await t.test('letters options a to z, then aa, ab', () => {
    assert.deepEqual([0, 1, 25, 26, 27, 51, 52].map(letterOf), ['a', 'b', 'z', 'aa', 'ab', 'az', 'ba']);
  });
});

test('questionLines', async (t) => {
  await t.test('numbers the questions on across the fields, letters each option on its own line and marks the recommended one', () => {
    assert.deepEqual(questionLines(asked), [
      'open:',
      '  1. How is the card cut?',
      '     It is big.',
      '     Two parts.',
      '     a  one card — All at once.',
      '     b  two cards — The shape first.  (recommended)',
      '     c  three, cut thin — Smallest.',
      '     choose one, or answer in your own words',
      '  2. Where do the answers go?',
      '     a  retry — Into the next try.',
      '     b  gate — With the approval.',
      '     choose one or more, or answer in your own words',
      'later:',
      '  3. When?',
      '     a  retry — Into the next try.',
      '     b  gate — With the approval.',
      '     choose one, or answer in your own words',
    ]);
    assert.ok(!questionLines([{ field: 'later', questions: [when] }]).some((l) => l.includes('(recommended)')));
  });
  await t.test('letters a twenty-seventh option aa', () => {
    const many: Question = {
      ...when,
      options: Array.from({ length: 27 }, (_, i) => ({ label: `o${i}`, meaning: '' })),
    };
    assert.equal(questionLines([{ field: 'f', questions: [many] }]).at(-2), '     aa  o26');
  });
});

test('answerForm', async (t) => {
  await t.test('offers one --answer for each question asked', () => {
    assert.equal(answerForm(2), '--answer 1=<letter> --answer 2=<letter>');
  });
});

test('numberedAnswers', async (t) => {
  await t.test('resolves each form to the question’s title, the labels its letters name and the person’s own words', () => {
    assert.deepEqual(numberedAnswers(questions, ['1=b', '2=A, b', '3=a: keep it', '3: only words']), [
      { question: cut.title, chose: ['two cards'] },
      { question: where.title, chose: ['retry', 'gate'] },
      { question: when.title, chose: ['retry'], own: 'keep it' },
      { question: when.title, chose: [], own: 'only words' },
    ]);
  });
  await t.test('resolves nothing for a step that asks none, which answerRefusal refuses itself', () => {
    assert.deepEqual(numberedAnswers([], ['1=a']), []);
  });
  for (const value of ['x', '1=', '=a', '1a', '1', '1:', '1=a b', '1=2'])
    await t.test(`REFUSED: an --answer in no form, naming the forms it takes: ${value}`, () => {
      const said = unresolved([value]);
      assert.ok(said.startsWith(`--answer ${value} `), said);
      namesFor(value, said, 'not an answer', '`n=a`', '`n=a,c`');
    });
  const rows: Array<[string, string[], string[]]> = [
    [
      'REFUSED: a number past the questions asked, naming how many and the command that numbers them',
      ['1=a', '4=a'],
      ['--answer 4=a', 'question 4', 'asks 3', 'nemia decide r-1'],
    ],
    ['REFUSED: a number below 1', ['0=a'], ['--answer 0=a', 'question 0', 'asks 3']],
    [
      'REFUSED: a letter its question does not offer, naming its letters and labels',
      ['1=d'],
      ['--answer 1=d', '"How is the card cut?"', 'no d', 'a (one card), b (two cards), c (three, cut thin).'],
    ],
    ['REFUSED: a letter past those of a question of several', ['2=a,c'], ['"Where do the answers go?"', 'no c', 'a (retry), b (gate).']],
  ];
  for (const [name, typed, facts] of rows) await t.test(name, () => namesFor(name, unresolved(typed), ...facts));
});
