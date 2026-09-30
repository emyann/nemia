/**
 * A question as data (`src/question/question.ts`): the strict decoder, the `x-shape` marker the output-schema loader expands, a question
 * field recognised by its schema and never its name, the answers a person gives refused when they do not fit, and the words the next try
 * reads. Each refusal has a fixture that breaks its rule, asserted on its words.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closeoutSchemaOf, looseAt, parseCloseout } from '../src/closeout/closeout.ts';
import {
  answerRefusal,
  answerText,
  askedQuestions,
  expandShapes,
  QUESTIONS_SCHEMA,
  questionFields,
  questionsOf,
  type Answer,
  type Question,
} from '../src/question/question.ts';
import { parseWorkflow } from '../src/workflow.ts';

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

/** The error `questionsOf` gives for `value`, or a failure when it decodes. */
const refusedWith = (value: unknown): string => {
  const read = questionsOf(value);
  assert.ok(!Array.isArray(read), `${JSON.stringify(value)} decoded`);
  return read.error;
};

test('questionsOf reads a list of questions as it is', () => {
  assert.deepEqual(questionsOf([cut, where]), [cut, where]);
  assert.deepEqual(questionsOf([]), []);
});

test('questionsOf refuses a recommended option that is none of the options', () => {
  assert.match(refusedWith([{ ...cut, recommended: 'c' }]), /question 1 recommends "c", which is none of its options \("a", "b"\)/);
});

test('questionsOf refuses an option offered twice', () => {
  assert.match(refusedWith([{ ...cut, options: [cut.options[0], cut.options[0]] }]), /question 1 offers "a" twice/);
});

test('questionsOf refuses two questions with one title', () => {
  assert.match(refusedWith([cut, { ...where, title: cut.title }]), /two questions are titled "How is the card cut\?"/);
});

test('questionsOf refuses a question with no options', () => {
  assert.match(refusedWith([{ ...cut, options: [], recommended: null }]), /question 1 offers no options/);
});

test('questionsOf refuses a question missing a key, and one with a key more', () => {
  const { multiple: _, ...without } = cut;
  assert.match(refusedWith([without]), /question 1 has the keys body, options, recommended, title, and a question has body, multiple/);
  assert.match(refusedWith([cut, { ...where, why: 'x' }]), /question 2 has the keys body, multiple, options, recommended, title, why/);
  assert.match(refusedWith([{ ...cut, options: [{ label: 'a' }] }]), /question 1's option 1 has the keys label, and an option has/);
});

test('questionsOf refuses what is not a list, and a key of the wrong type', () => {
  assert.equal(refusedWith('Should we? a) yes b) no'), 'the questions are not a list');
  assert.match(refusedWith([{ ...cut, multiple: 'no' }]), /question 1's `multiple` is not true or false/);
});

test('QUESTIONS_SCHEMA is strict, as every schema handed to a harness is', () => {
  assert.equal(looseAt(QUESTIONS_SCHEMA, ''), undefined);
});

/** A step whose `output:` schema holds `properties`, read as the loader reads it. */
const stepWith = (properties: Record<string, unknown>) =>
  parseWorkflow('design', '---\noutput: design.schema.json\n---\nDesign it.\n', () =>
    JSON.stringify({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false }),
  );

test('the loader expands a field marked `x-shape: questions` to the strict schema, its description kept, and nothing of the marker reaches the harness', () => {
  const step = stepWith({ open: { 'x-shape': 'questions', description: 'd' }, goal: { type: 'string' } });
  assert.deepEqual(step.output!.schema.properties.open, { ...QUESTIONS_SCHEMA, description: 'd' });
  assert.deepEqual(questionFields(step), ['open']);
  const filed = closeoutSchemaOf(step, [step]);
  assert.equal(looseAt(filed, ''), undefined);
  assert.ok(!JSON.stringify(filed).includes('x-shape'), 'the marker never reaches the harness');
});

test('the loader refuses a shape it does not know, naming the one there is', () => {
  assert.throws(
    () => stepWith({ open: { 'x-shape': 'poll' } }),
    (err: Error & { exitCode?: number }) => {
      assert.match(err.message, /`open` asks for the shape "poll", and the one shape there is is `questions`/);
      assert.equal(err.exitCode, 2);
      return true;
    },
  );
});

test('the loader refuses a marker beside a schema key, and a marker deeper than a field', () => {
  assert.throws(
    () => stepWith({ open: { 'x-shape': 'questions', items: { type: 'string' } } }),
    (err: Error) => /`open` sets `items` beside `x-shape`/.test(err.message),
  );
  assert.throws(
    () => stepWith({ open: { type: 'array', items: { 'x-shape': 'questions' } } }),
    (err: Error) => /`open` holds `x-shape` inside it/.test(err.message),
  );
});

test('expandShapes leaves a field without the marker as it is', () => {
  const field = { type: 'array', items: { type: 'string' } };
  assert.deepEqual(expandShapes({ open: field }), { properties: { open: field } });
});

test('a question field is known by its schema, never its name', () => {
  const step = stepWith({ open: { type: 'array', items: { type: 'string' } }, asks: { 'x-shape': 'questions' } });
  assert.deepEqual(questionFields(step), ['asks']);
  assert.deepEqual(questionFields(undefined), []);
});

test('askedQuestions gives each question field that decodes and holds a question, in the schema order, and none of a field that does not decode', () => {
  const step = stepWith({ later: { 'x-shape': 'questions' }, open: { 'x-shape': 'questions' }, broken: { 'x-shape': 'questions' } });
  const said = parseCloseout({
    outcome: 'blocked',
    summary: 's',
    artifacts: [],
    needs: 'Two questions.',
    open: [cut],
    later: [where],
    broken: [{ ...cut, recommended: 'z' }],
  });
  assert.deepEqual(askedQuestions(step, said), [
    { field: 'later', questions: [where] },
    { field: 'open', questions: [cut] },
  ]);
  assert.deepEqual(askedQuestions(step, parseCloseout({ outcome: 'done', summary: '', artifacts: [], open: [] })), []);
  assert.deepEqual(askedQuestions(step, { error: 'not an object' }), []);
});

/** The words `answerRefusal` gives, or a failure when it lets the answers through. */
const answerRefused = (answers: Answer[]): string => {
  const why = answerRefusal([cut, where], answers);
  assert.ok(why, `${JSON.stringify(answers)} was let through`);
  return why;
};

test('answerRefusal lets through a choice for each question, and words of the person’s own alone', () => {
  assert.equal(
    answerRefusal(
      [cut, where],
      [
        { question: cut.title, chose: ['a'] },
        { question: where.title, chose: ['retry', 'gate'] },
      ],
    ),
    null,
  );
  assert.equal(
    answerRefusal(
      [cut, where],
      [
        { question: cut.title, chose: [], own: 'Neither: cut it three ways.' },
        { question: where.title, chose: ['gate'] },
      ],
    ),
    null,
  );
});

test('answerRefusal refuses a label the question does not offer, naming it and the options', () => {
  assert.match(
    answerRefused([
      { question: cut.title, chose: ['c'] },
      { question: where.title, chose: ['gate'] },
    ]),
    /"How is the card cut\?" offers no "c": its options are "a", "b"\. Read the step's questions again/,
  );
});

test('answerRefusal refuses two labels on a question that takes one', () => {
  assert.match(
    answerRefused([
      { question: cut.title, chose: ['a', 'b'] },
      { question: where.title, chose: ['gate'] },
    ]),
    /"How is the card cut\?" takes one option, and the answer chose "a" and "b"/,
  );
});

test('answerRefusal refuses an answer to a question not asked', () => {
  assert.match(
    answerRefused([
      { question: 'Something else?', chose: [] },
      { question: cut.title, chose: ['a'] },
    ]),
    /The step does not ask "Something else\?" now/,
  );
});

test('answerRefusal refuses a question left with neither a choice nor words', () => {
  assert.match(
    answerRefused([
      { question: cut.title, chose: [], own: '  ' },
      { question: where.title, chose: ['gate'] },
    ]),
    /"How is the card cut\?" is not answered/,
  );
  assert.match(answerRefused([{ question: cut.title, chose: ['a'] }]), /"Where do the answers go\?" is not answered/);
});

test('answerRefusal refuses a question answered twice', () => {
  assert.match(
    answerRefused([
      { question: cut.title, chose: ['a'] },
      { question: cut.title, chose: ['b'] },
    ]),
    /"How is the card cut\?" is answered twice/,
  );
});

test('answerText says each answer in the order asked, the note, and who answered', () => {
  const text = answerText(
    [cut, where],
    [
      { question: where.title, chose: ['retry', 'gate'], own: 'Both, the gate later.' },
      { question: cut.title, chose: ['a'] },
    ],
    ' Thanks. ',
  );
  assert.equal(
    text,
    [
      'Answers to your questions:',
      '',
      '1. How is the card cut?',
      '   Chose: a — The shape and the board first.',
      '',
      '2. Where do the answers go?',
      '   Chose: retry — Into the next try.',
      '   Chose: gate — With the approval.',
      '   In my own words: Both, the gate later.',
      '',
      'Note: Thanks.',
      '',
      'Answered by: person, on the board',
    ].join('\n'),
  );
  assert.equal(
    answerText([cut], [{ question: cut.title, chose: [], own: 'Neither.' }]),
    'Answers to your questions:\n\n1. How is the card cut?\n   In my own words: Neither.\n\nAnswered by: person, on the board',
  );
});
