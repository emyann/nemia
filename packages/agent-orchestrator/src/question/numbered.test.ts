/**
 * The terminal's numbering of a step's questions (`numbered.ts`): numbers across the asked fields, letters past `z`, the block `nemia
 * decide` prints, and each `--answer` value resolved to the board's answer or refused, each refusal with a fixture that breaks its rule.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerForm, letterOf, numberedAnswers, questionLines } from './numbered.ts';
import type { Asked, Question } from './question.ts';

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

/** The refusal `numberedAnswers` gives `typed`, or a failure where it resolves them. */
const refused = (typed: string[]): string => {
  const read = numberedAnswers(questions, typed, 'nemia decide r-1');
  assert.ok(!Array.isArray(read), `${JSON.stringify(typed)} was resolved: ${JSON.stringify(read)}`);
  return read.error;
};

test('letterOf letters options a to z, then aa, ab', () => {
  assert.deepEqual([0, 1, 25, 26, 27, 51, 52].map(letterOf), ['a', 'b', 'z', 'aa', 'ab', 'az', 'ba']);
});

test('questionLines numbers the questions on across the fields, letters each option on its own line and marks the recommended one', () => {
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

test('questionLines letters a twenty-seventh option aa', () => {
  const many: Question = {
    ...when,
    options: Array.from({ length: 27 }, (_, i) => ({ label: `o${i}`, meaning: '' })),
  };
  assert.equal(questionLines([{ field: 'f', questions: [many] }]).at(-2), '     aa  o26');
});

test('answerForm offers one --answer for each question asked', () => {
  assert.equal(answerForm(2), '--answer 1=<letter> --answer 2=<letter>');
});

test('numberedAnswers resolves each form to the question’s title, the labels its letters name and the person’s own words', () => {
  assert.deepEqual(numberedAnswers(questions, ['1=b', '2=A, b', '3=a: keep it', '3: only words']), [
    { question: cut.title, chose: ['two cards'] },
    { question: where.title, chose: ['retry', 'gate'] },
    { question: when.title, chose: ['retry'], own: 'keep it' },
    { question: when.title, chose: [], own: 'only words' },
  ]);
});

test('numberedAnswers resolves nothing for a step that asks none, which answerRefusal refuses itself', () => {
  assert.deepEqual(numberedAnswers([], ['1=a']), []);
});

test('REFUSED: an --answer in no form, naming the forms it takes', () => {
  for (const value of ['x', '1=', '=a', '1a', '1', '1:', '1=a b', '1=2']) {
    assert.match(refused([value]), new RegExp(`^--answer ${value} is not an answer: it takes \`n=a\`, \`n=a,c\``), value);
  }
});

test('REFUSED: a number past the questions asked, or below 1, naming how many it asks and the command that numbers them', () => {
  const past = refused(['1=a', '4=a']);
  assert.match(past, /^--answer 4=a names question 4, /);
  assert.match(past, /the step asks 3 now/);
  assert.match(past, /nemia decide r-1/);
  assert.match(refused(['0=a']), /^--answer 0=a names question 0, and the step asks 3 now/);
});

test('REFUSED: a letter its question does not offer, naming its letters and labels', () => {
  const cut = refused(['1=d']);
  assert.ok(cut.startsWith('--answer 1=d: "How is the card cut?" offers no d'), cut);
  assert.match(cut, /a \(one card\), b \(two cards\), c \(three, cut thin\)\.$/);
  const where = refused(['2=a,c']);
  assert.match(where, /"Where do the answers go\?" offers no c/);
  assert.match(where, /a \(retry\), b \(gate\)\.$/);
});
