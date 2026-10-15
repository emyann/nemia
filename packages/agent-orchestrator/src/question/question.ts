/**
 * A question a step asks a person, as data: one shape any agent's `output:` schema may declare a field of, decoded strictly, answered by
 * choosing among its options or in the person's own words, and turned into the words the step's next try reads.
 *
 * Pure. A field is a question field because its schema is `QUESTIONS_SCHEMA`, never because of its name or its agent: an output schema
 * asks for it with `"x-shape": "questions"`, which the loader expands (`expandShapes`) before it checks the schema is strict, so the
 * harness is handed standard JSON Schema only.
 */
import type { Closeout } from '../closeout/index.ts';
import { isObject, type Workflow } from '../step/step.ts';

/** One option of a question: its label, which an answer names, and what choosing it means. */
export type QuestionOption = { label: string; meaning: string };

/**
 * One question: its `title`, which an answer names and which is unique among its field's questions; its `body`; its `options`, at least
 * one, each label unique; the label it `recommended`, or null; and whether `multiple` options may be chosen together.
 */
export type Question = { title: string; body: string; options: QuestionOption[]; recommended: string | null; multiple: boolean };

/** A question field of a closeout that decoded: the field's name, and its questions, in the order the agent gave them. */
export type Asked = { field: string; questions: Question[] };

/** A person's answer to one question, named by its title: the labels they `chose`, and their `own` words, either or both. */
export type Answer = { question: string; chose: readonly string[]; own?: string };

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
      recommended: { type: ['string', 'null'], description: 'The label of the option you recommend, or null for none.' },
      multiple: { type: 'boolean', description: 'Whether several options may be chosen together.' },
    },
    required: ['title', 'body', 'options', 'recommended', 'multiple'],
    additionalProperties: false,
  },
};

/** The shapes a marker may name, each with its schema. */
const SHAPES: Record<string, object> = { questions: QUESTIONS_SCHEMA };

/** A value's JSON with every object's keys sorted, so two schemas compare whatever order their keys were written in. */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    isObject(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v,
  );

/** Whether `value` holds the marker anywhere, at any depth. */
const marked = (value: unknown): boolean =>
  Array.isArray(value) ? value.some(marked) : isObject(value) && (Object.hasOwn(value, SHAPE_KEY) || Object.values(value).some(marked));

/**
 * An output schema's `properties` with each marked field expanded to the schema of its shape, its `description` kept; or why they cannot
 * be. Refuses a shape it does not know, a marker beside any schema key but `description`, and a marker anywhere but on a field itself.
 */
export function expandShapes(properties: Record<string, unknown>): { properties: Record<string, unknown> } | { error: string } {
  const expanded: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(properties)) {
    if (!isObject(field) || !Object.hasOwn(field, SHAPE_KEY)) {
      if (marked(field))
        return { error: `\`${name}\` holds \`${SHAPE_KEY}\` inside it: the marker is read on a field itself, never deeper` };
      expanded[name] = field;
      continue;
    }
    const shape = field[SHAPE_KEY];
    if (typeof shape !== 'string' || !Object.hasOwn(SHAPES, shape)) {
      return { error: `\`${name}\` asks for the shape ${JSON.stringify(shape)}, and the one shape there is is \`questions\`` };
    }
    const beside = Object.keys(field).filter((k) => k !== SHAPE_KEY && k !== 'description');
    if (beside.length) {
      return {
        error: `\`${name}\` sets ${beside.map((k) => `\`${k}\``).join(', ')} beside \`${SHAPE_KEY}\`, which stands for the whole schema of the field: keep only \`description\``,
      };
    }
    expanded[name] = { ...SHAPES[shape], ...(typeof field.description === 'string' ? { description: field.description } : {}) };
  }
  return { properties: expanded };
}

/** Whether a field's schema is `QUESTIONS_SCHEMA`, its `description` aside. */
const isQuestionsSchema = (schema: unknown): boolean => {
  if (!isObject(schema)) return false;
  const { description: _, ...rest } = schema;
  return canonical(rest) === canonical(QUESTIONS_SCHEMA);
};

/** The fields a step's `output:` declares whose schema is `QUESTIONS_SCHEMA`, in the schema's order: none for a step without `output:`. */
export const questionFields = (step: Workflow | undefined): string[] =>
  Object.entries(step?.output?.schema.properties ?? {})
    .filter(([, schema]) => isQuestionsSchema(schema))
    .map(([name]) => name);

/** Why an option is not one, or null. */
const optionRefusal = (option: unknown, at: string): string | null => {
  if (!isObject(option)) return `${at} is not an object`;
  const keys = Object.keys(option).sort();
  if (keys.join() !== 'label,meaning')
    return `${at} has the keys ${keys.join(', ') || 'none'}, and an option has \`label\` and \`meaning\``;
  if (typeof option.label !== 'string' || !option.label.trim()) return `${at}'s \`label\` is not text`;
  if (typeof option.meaning !== 'string') return `${at}'s \`meaning\` is not text`;
  return null;
};

/** The keys a question has, sorted. */
const QUESTION_KEYS = ['body', 'multiple', 'options', 'recommended', 'title'];

/** Why one question is not one, or null: its keys, their types, its options, and a `recommended` that names one of them. */
function questionRefusal(q: unknown, at: string): string | null {
  if (!isObject(q)) return `${at} is not an object`;
  const keys = Object.keys(q).sort();
  if (keys.join() !== QUESTION_KEYS.join())
    return `${at} has the keys ${keys.join(', ') || 'none'}, and a question has ${QUESTION_KEYS.join(', ')}`;
  if (typeof q.title !== 'string' || !q.title.trim()) return `${at}'s \`title\` is not text`;
  if (typeof q.body !== 'string') return `${at}'s \`body\` is not text`;
  if (typeof q.multiple !== 'boolean') return `${at}'s \`multiple\` is not true or false`;
  if (!Array.isArray(q.options) || !q.options.length) return `${at} offers no options`;
  for (const [i, option] of q.options.entries()) {
    const wrong = optionRefusal(option, `${at}'s option ${i + 1}`);
    if (wrong) return wrong;
  }
  const labels = (q.options as QuestionOption[]).map((o) => o.label);
  const twice = labels.find((label, i) => labels.indexOf(label) !== i);
  if (twice !== undefined) return `${at} offers ${JSON.stringify(twice)} twice`;
  if (q.recommended !== null && !labels.includes(q.recommended as string)) {
    return `${at} recommends ${JSON.stringify(q.recommended)}, which is none of its options (${labels.map((l) => JSON.stringify(l)).join(', ')})`;
  }
  return null;
}

/**
 * A field's value read as questions, strictly, or why it is not: an array of questions, each with exactly the keys of `QUESTIONS_SCHEMA`,
 * at least one option, no label twice, a `recommended` that is one of its labels or null, and no title twice.
 */
export function questionsOf(value: unknown): Question[] | { error: string } {
  if (!Array.isArray(value)) return { error: 'the questions are not a list' };
  for (const [i, q] of value.entries()) {
    const wrong = questionRefusal(q, `question ${i + 1}`);
    if (wrong) return { error: wrong };
  }
  const titles = (value as Question[]).map((q) => q.title);
  const twice = titles.find((title, i) => titles.indexOf(title) !== i);
  if (twice !== undefined) return { error: `two questions are titled ${JSON.stringify(twice)}` };
  return value as Question[];
}

/**
 * What a closeout asks through its step's question fields: each field it gave that decodes and holds a question, in the schema's order.
 * None for a closeout that is not there or did not read, and none of a field that does not decode: it is drawn as any other field. None
 * at all when two fields ask one title: an answer names its question by title alone, so such a closeout is answered in words.
 */
export function askedQuestions(step: Workflow | undefined, said: Closeout | { error: string } | undefined): Asked[] {
  if (!said || 'error' in said) return [];
  const asked = questionFields(step).flatMap((field) => {
    const questions = questionsOf(said.output?.[field]);
    return Array.isArray(questions) && questions.length ? [{ field, questions }] : [];
  });
  const titles = asked.flatMap((a) => a.questions.map((q) => q.title));
  return new Set(titles).size === titles.length ? asked : [];
}

/** Words that say to read the step again, for an answer that does not fit the questions it asks now. */
const READ_AGAIN = "Read the step's questions again and answer those.";

/** Why one answer does not fit its question, or null. */
function oneAnswerRefusal(q: Question, a: Answer): string | null {
  const labels = q.options.map((o) => o.label);
  const stray = a.chose.find((label) => !labels.includes(label));
  if (stray !== undefined) {
    return `"${q.title}" offers no ${JSON.stringify(stray)}: its options are ${labels.map((l) => JSON.stringify(l)).join(', ')}. ${READ_AGAIN}`;
  }
  if (!q.multiple && a.chose.length > 1) {
    return `"${q.title}" takes one option, and the answer chose ${a.chose.map((l) => JSON.stringify(l)).join(' and ')}: choose one, or say the rest in your own words.`;
  }
  if (!a.chose.length && !a.own?.trim()) return `"${q.title}" is not answered: choose an option, or answer it in your own words.`;
  return null;
}

/**
 * Why `answers` do not answer `asked`, or null: answers, even none, to a step that asks no questions now; an answer to a question not
 * asked, two to one question, a label its question does not offer, several labels where one is taken, and a question left with neither
 * a choice nor words of the person's own.
 *
 * @param instead How a person says what they mean to a step that asks none, as the refusal names it: in words, without `answers`, on the
 *   board's side; with `--message`, without `--answer`, at the terminal.
 */
export function answerRefusal(
  asked: readonly Question[],
  answers: readonly Answer[],
  instead = 'in words, without `answers`',
): string | null {
  if (!asked.length) {
    return `The step asks no questions now, so there is nothing to answer. Read the step again, and say what you mean ${instead}.`;
  }
  const seen = new Set<string>();
  for (const a of answers) {
    const q = asked.find((one) => one.title === a.question);
    if (!q) return `The step does not ask "${a.question}" now. ${READ_AGAIN}`;
    if (seen.has(a.question)) return `"${a.question}" is answered twice: answer each question once.`;
    seen.add(a.question);
    const wrong = oneAnswerRefusal(q, a);
    if (wrong) return wrong;
  }
  const left = asked.find((q) => !seen.has(q.title));
  return left ? `"${left.title}" is not answered: choose an option, or answer it in your own words.` : null;
}

/**
 * Each question in the order asked, what was chosen with what it means, and the person's own words; then `note`; then who answered, and
 * where (`from`).
 */
function answerBlocks(asked: readonly Question[], answers: readonly Answer[], note: string | undefined, from: string): string[] {
  const blocks = asked.map((q, i) => {
    const a = answers.find((one) => one.question === q.title);
    const chose = (a?.chose ?? []).map((label) => `   Chose: ${label} — ${q.options.find((o) => o.label === label)?.meaning ?? ''}`);
    const own = a?.own?.trim() ? [`   In my own words: ${a.own.trim()}`] : [];
    return [`${i + 1}. ${q.title}`, ...chose, ...own].join('\n');
  });
  const noted = note?.trim() ? [`Note: ${note.trim()}`] : [];
  return [...blocks, ...noted, `Answered by: person, ${from}`];
}

/**
 * The words a step's next try reads for `answers` to `asked`, which `answerRefusal` let through: each question in the order asked, what was
 * chosen with what it means, and the person's own words; then `note`, when there is one; and last, who answered, and where: `from`, on
 * the board unless the terminal says otherwise.
 */
export const answerText = (asked: readonly Question[], answers: readonly Answer[], note?: string, from = 'on the board'): string =>
  ['Answers to your questions:', ...answerBlocks(asked, answers, note, from)].join('\n\n');

/**
 * The words an approval carries for `answers` to the questions `step` asked at its gate, which `answerRefusal` let through: read under
 * `## Approved` by the steps after the gate, so they open naming whose questions they answer; then each answer as `answerText` says it,
 * `note`, and who answered, and where (`from`).
 */
export const approvedAnswerText = (
  step: string,
  asked: readonly Question[],
  answers: readonly Answer[],
  note?: string,
  from = 'on the board',
): string => [`The person's answers to ${step}'s questions:`, ...answerBlocks(asked, answers, note, from)].join('\n\n');
