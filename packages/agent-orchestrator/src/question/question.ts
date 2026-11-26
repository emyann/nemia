/**
 * A question a step asks a person, as data: one shape any agent's `output:` schema may declare a field of, decoded strictly, answered by
 * choosing among its options or in the person's own words, and turned into the words the step's next try reads.
 *
 * Pure. A field is a question field because its schema is `QUESTIONS_SCHEMA`, never because of its name or its agent: an output schema
 * asks for it with `"x-shape": "questions"`, which the loader expands (`expandShapes`) before it checks the schema is strict, so the
 * harness is handed standard JSON Schema only.
 */
import type { FieldShape } from 'objects';
import { envelopeRefusals, type Closeout } from '../closeout/index.ts';
import { type StepSpec } from '../step/step.ts';
import { BUDGETS_SCHEMA, budgetRefusals } from '../budget/budget.ts';
import { fieldsOf, itemsOf, knownSchemas, sameSchema } from '../shape/shape.ts';
import { isObject } from 'effect/Predicate';
import type { Answer, AnswerRefusal, Question, QuestionOption, RefusalWords } from '../../contracts/answer.contract.ts';

export type { Answer, Question } from '../../contracts/answer.contract.ts';

/** A question field of a closeout that decoded: the field's name, and its questions, in the order the agent gave them. */
export type Asked = { field: string; questions: Question[] };

/** The marker an output schema writes for a field of questions: `{ "x-shape": "questions", "description": "…" }`. */
export const SHAPE_KEY = 'x-shape';

/** The shape a field of questions is, as its schema; strict, as every schema handed to a harness is. */
export const QUESTIONS_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'The question, in one line. Unique among these questions.' },
      body: { type: 'string', description: 'What the person needs to know to answer it: the context, and what depends on the answer.' },
      options: {
        type: 'array',
        description: 'The answers you see, at least one. The person may also answer in their own words.',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'The option, in a few words. Unique among this question’s options.' },
            meaning: { type: 'string', description: 'What choosing it means: what you would do, and what it costs.' },
          },
          required: ['label', 'meaning'],
          additionalProperties: false,
        },
      },
      recommended: {
        anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }, { type: 'null' }],
        description:
          'The label of the option you recommend, or null for none. Where `multiple` is true, a list of the labels you recommend choosing together; never several labels joined in one string.',
      },
      multiple: { type: 'boolean', description: 'Whether several options may be chosen together.' },
    },
    required: ['title', 'body', 'options', 'recommended', 'multiple'],
    additionalProperties: false,
  },
};

/**
 * `QUESTIONS_SCHEMA` as a run frozen before a question that takes several answers could recommend several holds it, `recommended` one
 * label or null: such a run's fields still read as questions.
 */
const FORMER_QUESTIONS_SCHEMAS = [
  {
    ...QUESTIONS_SCHEMA,
    items: {
      ...QUESTIONS_SCHEMA.items,
      properties: {
        ...QUESTIONS_SCHEMA.items.properties,
        recommended: { type: ['string', 'null'], description: 'The label of the option you recommend, or null for none.' },
      },
    },
  },
];

/** A field that names a place or a commit: a string, or null where the step has none. Its shape tells the board how to draw it. */
const NULLABLE_STRING = { type: ['string', 'null'] };

/** The shapes a marker may name (objects' `FIELD_SHAPES`), each with its schema. */
const SHAPES: Record<FieldShape, object> = {
  questions: QUESTIONS_SCHEMA,
  budgets: BUDGETS_SCHEMA,
  link: NULLABLE_STRING,
  commit: NULLABLE_STRING,
};

/** Whether `shape` is one a marker may name. */
const isShape = (shape: unknown): shape is FieldShape => typeof shape === 'string' && Object.hasOwn(SHAPES, shape);

/** Whether `value` holds the marker anywhere, at any depth. */
const marked = (value: unknown) =>
  Array.isArray(value) ? value.some(marked) : isObject(value) && (Object.hasOwn(value, SHAPE_KEY) || Object.values(value).some(marked));

/**
 * An output schema's `properties` with each marked field expanded to the schema of its shape, its `description` kept, and the shape each
 * marked field was (`shapes`, none for an unmarked one); or why they cannot be. Refuses a shape it does not know, a marker beside any
 * schema key but `description`, and a marker anywhere but on a field itself.
 * @param properties The output schema's `properties`, by field name.
 */
export function expandShapes(properties: Record<string, unknown>) {
  const expanded: Record<string, unknown> = {};
  const shapes: Record<string, FieldShape> = {};
  for (const [name, field] of Object.entries(properties)) {
    if (!isObject(field) || !Object.hasOwn(field, SHAPE_KEY)) {
      if (marked(field))
        return { error: `\`${name}\` holds \`${SHAPE_KEY}\` inside it: the marker is read on a field itself, never deeper` };
      expanded[name] = field;
      continue;
    }
    const shape = field[SHAPE_KEY];
    if (!isShape(shape)) {
      const known = Object.keys(SHAPES).map((k) => `\`${k}\``);
      return {
        error: `\`${name}\` asks for the shape ${JSON.stringify(shape)}, which is none of the shapes there are: ${known.join(', ')}`,
      };
    }
    const beside = Object.keys(field).filter((k) => k !== SHAPE_KEY && k !== 'description');
    if (beside.length) {
      return {
        error: `\`${name}\` sets ${beside.map((k) => `\`${k}\``).join(', ')} beside \`${SHAPE_KEY}\`, which stands for the whole schema of the field: keep only \`description\``,
      };
    }
    expanded[name] = { ...SHAPES[shape], ...(typeof field.description === 'string' ? { description: field.description } : {}) };
    shapes[name] = shape;
  }
  return { properties: expanded, shapes };
}

/** `QUESTIONS_SCHEMA` and the former ones, written out once (`knownSchemas`). */
const QUESTIONS_SCHEMAS = knownSchemas([QUESTIONS_SCHEMA, ...FORMER_QUESTIONS_SCHEMAS]);

/**
 * Whether a field's schema is `QUESTIONS_SCHEMA`, or a former one a frozen run holds (`FORMER_QUESTIONS_SCHEMAS`), its `description`
 * aside.
 */
const isQuestionsSchema = (schema: unknown) => sameSchema(schema, QUESTIONS_SCHEMAS);

/**
 * The fields a step's `output:` declares whose schema is `QUESTIONS_SCHEMA`, in the schema's order: none for a step without `output:`.
 * @param step The step as its workflow says it; undefined where it is not known.
 */
export const questionFields = (step: StepSpec | undefined) =>
  Object.entries(step?.output?.schema.properties ?? {})
    .filter(([, schema]) => isQuestionsSchema(schema))
    .map(([name]) => name);

/** An option read, or why it is not one. */
const optionOf = (value: unknown, at: string) => {
  const option = fieldsOf(value);
  if (!option) return `${at} is not an object`;
  // oxlint-disable-next-line unicorn/no-useless-spread -- the verifier sees only a spread as allocated here (`fieldsOf`)
  const keys = [...Object.keys(option)];
  keys.sort();
  if (keys.join() !== 'label,meaning')
    return `${at} has the keys ${keys.join(', ') || 'none'}, and an option has \`label\` and \`meaning\``;
  const { label, meaning } = option;
  if (typeof label !== 'string' || !label.trim()) return `${at}'s \`label\` is not text`;
  if (typeof meaning !== 'string') return `${at}'s \`meaning\` is not text`;
  return { label, meaning };
};

/** The keys a question has, sorted. */
const QUESTION_KEYS = ['body', 'multiple', 'options', 'recommended', 'title'];

/**
 * The labels a question recommends, as a list: none for null, one for a label.
 * @param q The question, whose `recommended` is read.
 */
export const recommendedOf = (q: Pick<Question, 'recommended'>) =>
  q.recommended === null ? [] : typeof q.recommended === 'string' ? [q.recommended] : q.recommended;

/**
 * A question's `recommended` read: one label of `labels` or null, or where it takes `multiple`, a list of them; or why it is not one.
 */
function recommendedRead(given: unknown, multiple: boolean, labels: readonly string[], at: string) {
  const offered = labels.map((l) => JSON.stringify(l)).join(', ');
  if (given === null) return { recommended: null };
  const items = itemsOf(given);
  if (items) {
    if (!multiple) return `${at} recommends a list, and it takes one option (\`multiple\` is false): recommend one label, or null`;
    const named = items.flatMap((l) => (typeof l === 'string' ? [l] : []));
    if (named.length !== items.length) return `${at}'s \`recommended\` holds something that is not a label`;
    const stray = named.find((l) => !labels.includes(l));
    if (stray !== undefined) return `${at} recommends ${JSON.stringify(stray)}, which is none of its options (${offered})`;
    const twice = named.find((l, i) => named.indexOf(l) !== i);
    if (twice !== undefined) return `${at} recommends ${JSON.stringify(twice)} twice`;
    return { recommended: named };
  }
  if (typeof given !== 'string') return `${at}'s \`recommended\` is not a label, a list of labels, or null`;
  if (labels.includes(given)) return { recommended: given };
  return multiple
    ? `${at} recommends ${JSON.stringify(given)}, which is none of its options (${offered}): to recommend several, give a list of their labels`
    : `${at} recommends ${JSON.stringify(given)}, which is none of its options (${offered})`;
}

/**
 * One question read, or why it is not one: its keys, their types, its options, and a `recommended` that names one of them, or where it
 * takes `multiple` options, a list of them.
 */
function questionOf(value: unknown, at: string) {
  const q = fieldsOf(value);
  if (!q) return `${at} is not an object`;
  // oxlint-disable-next-line unicorn/no-useless-spread -- the verifier sees only a spread as allocated here (`fieldsOf`)
  const keys = [...Object.keys(q)];
  keys.sort();
  if (keys.join() !== QUESTION_KEYS.join())
    return `${at} has the keys ${keys.join(', ') || 'none'}, and a question has ${QUESTION_KEYS.join(', ')}`;
  const { title, body, multiple } = q;
  if (typeof title !== 'string' || !title.trim()) return `${at}'s \`title\` is not text`;
  if (typeof body !== 'string') return `${at}'s \`body\` is not text`;
  if (typeof multiple !== 'boolean') return `${at}'s \`multiple\` is not true or false`;
  const given = itemsOf(q.options);
  if (!given || !given.length) return `${at} offers no options`;
  const options: QuestionOption[] = [];
  for (const [i, item] of given.entries()) {
    const option = optionOf(item, `${at}'s option ${i + 1}`);
    if (typeof option === 'string') return option;
    options.push(option);
  }
  const labels = options.map((o) => o.label);
  const twice = labels.find((label, i) => labels.indexOf(label) !== i);
  if (twice !== undefined) return `${at} offers ${JSON.stringify(twice)} twice`;
  const recommended = recommendedRead(q.recommended, multiple, labels, at);
  if (typeof recommended === 'string') return recommended;
  return { title, body, options, recommended: recommended.recommended, multiple };
}

/**
 * A field's value read as questions, strictly, or why it is not: an array of questions, each with exactly the keys of `QUESTIONS_SCHEMA`,
 * at least one option, no label twice, a `recommended` that is one of its labels or null — or a list of them where it takes `multiple` —
 * and no title twice. What it answers is read afresh from `value`, never `value` itself.
 * @param value The field's value, as the closeout gave it.
 */
export function questionsOf(value: unknown) {
  const items = itemsOf(value);
  if (!items) return { error: 'the questions are not a list' };
  const questions: Question[] = [];
  for (const [i, item] of items.entries()) {
    const q = questionOf(item, `question ${i + 1}`);
    if (typeof q === 'string') return { error: q };
    questions.push(q);
  }
  const titles = questions.map((q) => q.title);
  const twice = titles.find((title, i) => titles.indexOf(title) !== i);
  if (twice !== undefined) return { error: `two questions are titled ${JSON.stringify(twice)}` };
  return questions;
}

/**
 * What a closeout asks through its step's question fields: each field it gave that decodes and holds a question, in the schema's order.
 * None for a closeout that is not there or did not read, and none of a field that does not decode: it is drawn as any other field. None
 * at all when two fields ask one title: an answer names its question by title alone, so such a closeout is answered in words.
 * @param step The step as its workflow says it, whose `output:` names its question fields; undefined where it is not known.
 * @param said What the step's closeout said, or the error it was read with; undefined where it has said nothing.
 */
export function askedQuestions(step: StepSpec | undefined, said: Closeout | { error: string } | undefined) {
  if (!said || 'error' in said) return [];
  const asked = questionFields(step).flatMap((field) => {
    const questions = questionsOf(said.output?.[field]);
    return Array.isArray(questions) && questions.length ? [{ field, questions }] : [];
  });
  const titles = asked.flatMap((a) => a.questions.map((q) => q.title));
  return new Set(titles).size === titles.length ? asked : [];
}

/**
 * Why the run does not read a closeout's question fields as questions, each a sentence that names the field, says why (`questionsOf`) and
 * what to do: a field given that does not decode, and two fields that ask one title. None for a closeout not there or unreadable, nor of
 * a field it did not give, which `declaredOutput` counts as missing. The run refuses such a closeout back to its agent as it refuses an
 * envelope (`envelopeRefusals`), and a reader of one that stands says why the field is drawn as words.
 * @param step The step as its workflow says it, whose `output:` names its question fields; undefined where it is not known.
 * @param said What the step's closeout said, or the error it was read with; undefined where it has said nothing.
 */
export function questionRefusals(step: StepSpec | undefined, said: Closeout | { error: string } | undefined) {
  if (!said || 'error' in said) return [];
  const read: Question[] = [];
  const refused: string[] = [];
  for (const field of questionFields(step)) {
    if (said.output?.[field] === undefined) continue;
    const questions = questionsOf(said.output[field]);
    if (Array.isArray(questions)) read.push(...questions);
    else {
      refused.push(
        `\`${field}\` is not read as questions, so nobody can answer them: ${questions.error}. Mend the field and sign off again.`,
      );
    }
  }
  const titles = read.map((q) => q.title);
  const twice = titles.find((title, i) => titles.indexOf(title) !== i);
  if (twice !== undefined) {
    refused.push(
      `Two questions are titled ${JSON.stringify(twice)}, and an answer names its question by title: retitle one, and sign off again.`,
    );
  }
  return refused;
}

/**
 * What the run refuses of a closeout a step gave, each a sentence saying what to do instead: its envelope (`envelopeRefusals`), its
 * question fields (`questionRefusals`) and its budget fields (`budgetRefusals`, which reads the run's `steps` for the steps after it). A
 * closeout with any reads `unsigned`, and the run asks its session once a round to mend it.
 * @param step The step that gave the closeout, as its workflow says it; undefined where it is not known.
 * @param said The closeout the step gave.
 * @param steps The run's steps, whose order says which come after `step`.
 */
export const closeoutRefusals = (step: StepSpec | undefined, said: Closeout, steps: readonly StepSpec[]) => [
  ...envelopeRefusals(said),
  ...questionRefusals(step, said),
  ...budgetRefusals(step, steps, said),
];

/** Words that say to read the step again, for an answer that does not fit the questions it asks now. */
const READ_AGAIN = "Read the step's questions again and answer those.";

/** Why `title` is refused as not answered, naming each way to answer it. */
const NOT_ANSWERED = (title: string) =>
  `"${title}" is not answered: choose an option, answer it in your own words, or say that none of its options fits (\`none\`).`;

/** Whether `label` is an option of the question of `asked` that `a` answers. */
const offers = (asked: readonly Question[], a: Answer, label: string) =>
  asked.some((q) => q.title === a.question && q.options.some((o) => o.label === label));

/** The labels of the question of `asked` titled `title`, each quoted. */
const labelsOf = (asked: readonly Question[], title: string) =>
  asked
    .filter((q) => q.title === title)
    .flatMap((q) => q.options.map((o) => JSON.stringify(o.label)))
    .join(', ');

/** The labels `a` chose, each quoted, joined by `and`. */
const choseWords = (a: Answer) => a.chose.map((l) => JSON.stringify(l)).join(' and ');

/** Whether `a` carries words of the person's own: text that is not blank. */
const hasWords = (a: Answer) => a.own !== undefined && a.own.trim() !== '';

/** Whether `a` chooses several labels of a question of `asked` that takes one. */
const severalOfOne = (asked: readonly Question[], a: Answer) =>
  a.chose.length > 1 && asked.some((q) => q.title === a.question && !q.multiple);

/** Whether `a` says something: a choice, words of the person's own, or that none of the options fits. */
const saysSomething = (a: Answer) => a.chose.length > 0 || hasWords(a) || a.none === true;

/**
 * Why `answers` do not answer `asked`, the first rule one of them breaks named: called only where they do not (`answerRefusal`), and typed
 * by its own spec, so the refusal's laws are proved on its decision and never on these words.
 */
const whyNot: RefusalWords = (asked, answers) => {
  const unasked = answers.find((a) => !asked.some((q) => q.title === a.question));
  if (unasked !== undefined) return `The step does not ask "${unasked.question}" now. ${READ_AGAIN}`;
  const twice = answers.find((a, i) => answers.some((b, j) => j !== i && b.question === a.question));
  if (twice !== undefined) return `"${twice.question}" is answered twice: answer each question once.`;
  const stray = answers.find((a) => !a.chose.every((label) => offers(asked, a, label)));
  if (stray !== undefined) {
    const label = stray.chose.find((l) => !offers(asked, stray, l)) ?? '';
    return `"${stray.question}" offers no ${JSON.stringify(label)}: its options are ${labelsOf(asked, stray.question)}. ${READ_AGAIN}`;
  }
  const several = answers.find((a) => severalOfOne(asked, a));
  if (several !== undefined) {
    return `"${several.question}" takes one option, and the answer chose ${choseWords(several)}: choose one, or say the rest in your own words.`;
  }
  const both = answers.find((a) => a.none === true && a.chose.length > 0);
  if (both !== undefined) {
    return `"${both.question}" is answered both with ${choseWords(both)} and with none of its options: choose, or say none fits, not both.`;
  }
  const silent = answers.find((a) => !saysSomething(a));
  if (silent !== undefined) return NOT_ANSWERED(silent.question);
  const left = asked.find((q) => !answers.some((a) => a.question === q.title));
  return NOT_ANSWERED(left?.title ?? '');
};

/**
 * Why `answers` do not answer `asked`, or null: answers, even none, to a step that asks no questions now; an answer to a question not
 * asked, two to one question, a label its question does not offer, several labels where one is taken, a choice beside saying that none
 * of the options fits (`none`), and a question left with no choice, no words of the person's own and no `none`.
 *
 * @param asked The questions the step asks now.
 * @param answers The person's answers, each naming its question by title.
 * @param instead How a person says what they mean to a step that asks none, as the refusal names it: in words, without `answers`, on the
 *   board's side; with `--message`, without `--answer`, at the terminal.
 */
export const answerRefusal: AnswerRefusal = (asked, answers, instead = 'in words, without `answers`') => {
  if (!asked.length) {
    return `The step asks no questions now, so there is nothing to answer. Read the step again, and say what you mean ${instead}.`;
  }
  const kept =
    answers.every((a, i) => answers.every((b, j) => i === j || b.question !== a.question)) &&
    answers.length >= asked.length &&
    answers.every((a) => asked.some((q) => q.title === a.question)) &&
    answers.every((a) => a.chose.every((label) => offers(asked, a, label))) &&
    answers.every((a) => !severalOfOne(asked, a)) &&
    answers.every((a) => !(a.none === true && a.chose.length > 0)) &&
    answers.every(saysSomething);
  return kept ? null : whyNot(asked, answers);
};

/**
 * Who answered, in the words a person reads after `Answered by: ` — objects' `actorWords` of the caller who sent the answers (the person
 * under the name of their token, an agent by its token or of its session), worded by the verb that knows the caller (`asked.verb.ts`), so
 * this file loads no value of `objects`; or, for answers given in-process, the person and where they gave them.
 */
export type AnsweredBy = string;

/** Who answered where no caller is handed: the person, on the board (`actorWords` of the person, and where). */
const ON_THE_BOARD: AnsweredBy = 'the person, on the board';

/** The last line of the words answers become: who answered (`AnsweredBy`). */
const answeredLine = (by: AnsweredBy) => `Answered by: ${by}`;

/**
 * Each question in the order asked, what was chosen with what it means, that none of its options fits where the person said so, and the
 * person's own words; then `note`; then who answered (`by`).
 */
function answerBlocks(asked: readonly Question[], answers: readonly Answer[], note: string | undefined, by: AnsweredBy) {
  const blocks = asked.map((q, i) => {
    const a = answers.find((one) => one.question === q.title);
    const chose = (a?.chose ?? []).map((label) => `   Chose: ${label} — ${q.options.find((o) => o.label === label)?.meaning ?? ''}`);
    const none = a?.none === true ? ['   None of these: none of the options fits.'] : [];
    const own = a?.own?.trim() ? [`   In my own words: ${a.own.trim()}`] : [];
    return [`${i + 1}. ${q.title}`, ...chose, ...none, ...own].join('\n');
  });
  const noted = note?.trim() ? [`Note: ${note.trim()}`] : [];
  return [...blocks, ...noted, answeredLine(by)];
}

/**
 * The words a step's next try reads for `answers` to `asked`, which `answerRefusal` let through: each question in the order asked, what was
 * chosen with what it means, and the person's own words; then `note`, when there is one; and last, who answered (`by`): the caller's actor,
 * or where the person answered in-process, on the board unless the terminal says otherwise.
 * @param asked The questions asked, in the order asked.
 * @param answers The person's answers, each naming its question by title.
 * @param note The person's note under the answers; absent where there is none.
 * @param by Who answered; the person, on the board, where absent.
 */
export const answerText = (asked: readonly Question[], answers: readonly Answer[], note?: string, by: AnsweredBy = ON_THE_BOARD) =>
  ['Answers to your questions:', ...answerBlocks(asked, answers, note, by)].join('\n\n');

/**
 * The words an approval carries for `answers` to the questions `step` asked at its gate, which `answerRefusal` let through: read under
 * `## Approved` by the steps after the gate, so they open naming whose questions they answer; then each answer as `answerText` says it,
 * `note`, and who answered (`by`).
 * @param step The name of the step whose gate asked the questions.
 * @param asked The questions asked, in the order asked.
 * @param answers The person's answers, each naming its question by title.
 * @param note The person's note under the answers; absent where there is none.
 * @param by Who answered; the person, on the board, where absent.
 */
export const approvedAnswerText = (
  step: string,
  asked: readonly Question[],
  answers: readonly Answer[],
  note?: string,
  by: AnsweredBy = ON_THE_BOARD,
) => [`The person's answers to ${step}'s questions:`, ...answerBlocks(asked, answers, note, by)].join('\n\n');
