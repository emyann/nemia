/**
 * A question as data (`question.ts`), one table per function: the strict decoder (`questionsOf`), the `x-shape` marker the output-schema
 * loader expands, a question field known by its schema and never its name, the questions a closeout asks, the answers a person gives
 * refused when they do not fit (`answerRefusal`), and the words the next try reads. Each refusal row breaks one rule and is asserted
 * by its kind and the facts it names. The terminal's numbering is in `numbered.test.ts`; a run's questions asked and answered at the
 * terminal are told in `test/retry.test.ts` and `test/closeouts.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closeoutSchemaOf, looseAt, parseCloseout } from '../closeout/closeout.ts';
import {
  answerRefusal,
  answerText,
  approvedAnswerText,
  askedQuestions,
  expandShapes,
  QUESTIONS_SCHEMA,
  questionFields,
  questionsOf,
  type Answer,
  type Question,
} from './question.ts';
import { parseWorkflow } from '../workflow.ts';
import { Invalid } from '../refusal/refusal.ts';
import { names, namesFor } from '../../test/assessed.ts';

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

/** What `questionsOf` gives `value` when it refuses it, or a failure when it decodes. */
const decodeFails = (value: unknown): string => {
  const read = questionsOf(value);
  assert.ok(!Array.isArray(read), `${JSON.stringify(value)} decoded`);
  return read.error;
};

test('questionsOf', async (t) => {
  await t.test('reads a list of questions as it is, an empty one too', () => {
    assert.deepEqual(questionsOf([cut, where]), [cut, where]);
    assert.deepEqual(questionsOf([]), []);
  });
  const { multiple: _, ...without } = cut;
  const rows: Array<[string, unknown, string[]]> = [
    ['REFUSED: a recommended option that is none of the options', [{ ...cut, recommended: 'c' }], ['question 1', '"c"', '("a", "b")']],
    ['REFUSED: an option offered twice', [{ ...cut, options: [cut.options[0], cut.options[0]] }], ['question 1', '"a"', 'twice']],
    ['REFUSED: two questions with one title', [cut, { ...where, title: cut.title }], ['"How is the card cut?"', 'two questions']],
    ['REFUSED: a question with no options', [{ ...cut, options: [], recommended: null }], ['question 1', 'no options']],
    [
      'REFUSED: a question missing a key, naming the keys it has and those a question has',
      [without],
      ['question 1', 'body, options, recommended, title', 'body, multiple'],
    ],
    [
      'REFUSED: a question with a key more',
      [cut, { ...where, why: 'x' }],
      ['question 2', 'body, multiple, options,', ' recommended, title, why,'],
    ],
    ['REFUSED: an option missing a key', [{ ...cut, options: [{ label: 'a' }] }], ["question 1's option 1", 'label']],
    ['REFUSED: what is not a list', 'Should we? a) yes b) no', ['not a list']],
    ['REFUSED: a key of the wrong type', [{ ...cut, multiple: 'no' }], ["question 1's `multiple`", 'true or false']],
  ];
  for (const [name, value, facts] of rows) await t.test(name, () => namesFor(name, decodeFails(value), ...facts));
});

/** A step whose `output:` schema holds `properties`, read as the loader reads it. */
const stepWith = (properties: Record<string, unknown>) =>
  parseWorkflow('design', '---\nplace: git\noutput: design.schema.json\n---\nDesign it.\n', () =>
    JSON.stringify({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false }),
  );

/** That `load` throws an `Invalid` with exit 2, naming each of `facts`. */
const loaderRefuses = (load: () => unknown, ...facts: string[]) =>
  assert.throws(load, (err: unknown) => {
    assert.ok(err instanceof Invalid, String(err));
    assert.equal(err.exitCode, 2);
    names(err.message, ...facts);
    return true;
  });

test('expandShapes and questionFields: the `x-shape` marker of a step’s `output:`', async (t) => {
  await t.test('QUESTIONS_SCHEMA is strict, as every schema handed to a harness is', () => {
    assert.equal(looseAt(QUESTIONS_SCHEMA, ''), undefined);
  });
  await t.test(
    'the loader expands a marked field to the strict schema, its description kept; nothing of the marker reaches the harness',
    () => {
      const step = stepWith({ open: { 'x-shape': 'questions', description: 'd' }, goal: { type: 'string' } });
      assert.deepEqual(step.output!.schema.properties.open, { ...QUESTIONS_SCHEMA, description: 'd' });
      assert.deepEqual(questionFields(step), ['open']);
      const filed = closeoutSchemaOf(step, [step]);
      assert.equal(looseAt(filed, ''), undefined);
      assert.ok(!JSON.stringify(filed).includes('x-shape'), 'the marker never reaches the harness');
    },
  );
  await t.test('REFUSED: a shape it does not know, naming the one there is', () =>
    loaderRefuses(() => stepWith({ open: { 'x-shape': 'poll' } }), '`open`', '"poll"', '`questions`', '"x-shape": "questions"'),
  );
  await t.test('REFUSED: a marker beside a schema key', () =>
    loaderRefuses(() => stepWith({ open: { 'x-shape': 'questions', items: { type: 'string' } } }), '`open`', '`items`', '`x-shape`'),
  );
  await t.test('REFUSED: a marker deeper than a field', () =>
    loaderRefuses(() => stepWith({ open: { type: 'array', items: { 'x-shape': 'questions' } } }), '`open`', 'holds `x-shape` inside it'),
  );
  await t.test('expandShapes leaves a field without the marker as it is', () => {
    const field = { type: 'array', items: { type: 'string' } };
    assert.deepEqual(expandShapes({ open: field }), { properties: { open: field } });
  });
  await t.test('a question field is known by its schema, never its name', () => {
    const step = stepWith({ open: { type: 'array', items: { type: 'string' } }, asks: { 'x-shape': 'questions' } });
    assert.deepEqual(questionFields(step), ['asks']);
    assert.deepEqual(questionFields(undefined), []);
  });
});

test('askedQuestions', async (t) => {
  await t.test('each question field that decodes and holds a question, in the schema order; none of a field that does not decode', () => {
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
  await t.test('none of a closeout whose fields ask one title twice: an answer names its question by title alone', () => {
    const step = stepWith({ open: { 'x-shape': 'questions' }, later: { 'x-shape': 'questions' } });
    const said = (later: unknown[]) =>
      parseCloseout({ outcome: 'blocked', summary: 's', artifacts: [], needs: 'Two questions.', open: [cut], later });
    assert.deepEqual(askedQuestions(step, said([{ ...where, title: cut.title }])), []);
    assert.deepEqual(askedQuestions(step, said([where])), [
      { field: 'open', questions: [cut] },
      { field: 'later', questions: [where] },
    ]);
  });
});

test('answerRefusal', async (t) => {
  await t.test('lets through a choice for each question, and words of the person’s own alone', () => {
    const through: Answer[][] = [
      [
        { question: cut.title, chose: ['a'] },
        { question: where.title, chose: ['retry', 'gate'] },
      ],
      [
        { question: cut.title, chose: [], own: 'Neither: cut it three ways.' },
        { question: where.title, chose: ['gate'] },
      ],
    ];
    for (const answers of through) assert.equal(answerRefusal([cut, where], answers), null);
  });
  const rows: Array<[string, Question[], Answer[], string[], string?]> = [
    [
      'REFUSED: a label the question does not offer, naming it and the options',
      [cut, where],
      [
        { question: cut.title, chose: ['c'] },
        { question: where.title, chose: ['gate'] },
      ],
      ['"How is the card cut?"', '"c"', '"a", "b"'],
    ],
    [
      'REFUSED: two labels on a question that takes one',
      [cut, where],
      [
        { question: cut.title, chose: ['a', 'b'] },
        { question: where.title, chose: ['gate'] },
      ],
      ['"How is the card cut?"', 'one option', '"a" and "b"'],
    ],
    [
      'REFUSED: an answer to a question not asked',
      [cut, where],
      [
        { question: 'Something else?', chose: [] },
        { question: cut.title, chose: ['a'] },
      ],
      ['"Something else?"', 'does not ask'],
    ],
    [
      'REFUSED: a question left with neither a choice nor words',
      [cut, where],
      [
        { question: cut.title, chose: [], own: '  ' },
        { question: where.title, chose: ['gate'] },
      ],
      ['"How is the card cut?"', 'not answered'],
    ],
    ['REFUSED: a question left out', [cut, where], [{ question: cut.title, chose: ['a'] }], ['"Where do the answers go?"', 'not answered']],
    [
      'REFUSED: a question answered twice',
      [cut, where],
      [
        { question: cut.title, chose: ['a'] },
        { question: cut.title, chose: ['b'] },
      ],
      ['"How is the card cut?"', 'twice'],
    ],
    ['REFUSED: an empty list to a step that asks no questions now, naming `answers`', [], [], ['asks no questions', 'without `answers`']],
    ['REFUSED: any answer to a step that asks none', [], [{ question: cut.title, chose: ['a'] }], ['asks no questions']],
    [
      'REFUSED: to a step that asks none, naming the terminal’s flags when given them',
      [],
      [],
      ['asks no questions', 'with --message "<words>", without --answer.'],
      'with --message "<words>", without --answer',
    ],
  ];
  for (const [name, questions, answers, facts, instead] of rows)
    await t.test(name, () => namesFor(name, answerRefusal(questions, answers, instead), ...facts));
});

test('answerText and approvedAnswerText', async (t) => {
  await t.test('answerText says each answer in the order asked, the note, and who answered', () => {
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
  await t.test('approvedAnswerText says whose questions they answer, each in the order asked, the note, and who answered', () => {
    const text = approvedAnswerText(
      'design',
      [cut, where],
      [
        { question: where.title, chose: ['gate'] },
        { question: cut.title, chose: ['b'], own: 'Fine.' },
      ],
      ' Go. ',
    );
    assert.equal(
      text,
      [
        "The person's answers to design's questions:",
        '',
        '1. How is the card cut?',
        '   Chose: b — All of it at once.',
        '   In my own words: Fine.',
        '',
        '2. Where do the answers go?',
        '   Chose: gate — With the approval.',
        '',
        'Note: Go.',
        '',
        'Answered by: person, on the board',
      ].join('\n'),
    );
    assert.ok(!approvedAnswerText('design', [cut], [{ question: cut.title, chose: ['a'] }]).includes('Answers to your questions'));
  });
  await t.test('each says where the person answered: at the terminal when it says so, on the board by default', () => {
    const answers = [{ question: cut.title, chose: ['a'] }];
    assert.ok(answerText([cut], answers, undefined, 'at the terminal').endsWith('\n\nAnswered by: person, at the terminal'));
    assert.ok(
      approvedAnswerText('design', [cut], answers, 'n', 'at the terminal').endsWith('Note: n\n\nAnswered by: person, at the terminal'),
    );
    assert.ok(answerText([cut], answers).endsWith('\n\nAnswered by: person, on the board'));
    assert.ok(approvedAnswerText('design', [cut], answers).endsWith('\n\nAnswered by: person, on the board'));
  });
});
