/**
 * A person's answers to the questions a step asks (agent-orchestrator, src/question/question.ts): `answerRefusal` says why they do not
 * answer the questions the step asks now, or null, and the run writes the answers it lets through into the words the step's next try
 * reads (`answerText`). The board, the terminal (`--answer`) and the MCP port all send their answers through it.
 *
 * A person answers a question by choosing among its options, in their own words, or by saying that none of its options fits (`none`),
 * the way out every question offers, which no agent writes: as the Agent SDK's `AskUserQuestion` supplies "Other" on every question
 * itself, the board supplies "Something else" (own words, no choice) and "None of these" (`none`, no choice, words optional).
 *
 * The types the laws read (`QuestionOption`, `Question`, `Answer`) are declared here, and the code takes them from this file.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** One option of a question: its label, which an answer names, and what choosing it means. */
export type QuestionOption = { label: string; meaning: string };

/**
 * One question: its `title`, which an answer names and which is unique among its field's questions; its `body`; its `options`, at least
 * one, each label unique; what it `recommended`, as the agent wrote it — one label or null, or on a question that takes `multiple`
 * options a list of labels — and whether `multiple` options may be chosen together.
 */
export type Question = {
  title: string;
  body: string;
  options: QuestionOption[];
  recommended: string | string[] | null;
  multiple: boolean;
};

/**
 * A person's answer to one question, named by its title: the labels they `chose`, their `own` words, and whether they said that `none`
 * of its options fits — a choice, words, or none, any but a choice beside none, and words beside either.
 */
export type Answer = { question: string; chose: readonly string[]; own?: string; none?: boolean };

/** Whether `a` carries words of the person's own: text that is not blank. */
const hasWords = (a: Answer) => a.own !== undefined && a.own.trim() !== '';

/** Whether `a` says that none of its question's options fits. */
const saysNone = (a: Answer) => a.none === true;

/** Whether `a` names a question of `asked`. */
const namesAsked = (asked: readonly Question[], a: Answer) => asked.some((q) => q.title === a.question);

/** Whether every label `a` chose is an option of its question. */
const offered = (asked: readonly Question[], a: Answer) =>
  a.chose.every((label) => asked.some((q) => q.title === a.question && q.options.some((o) => o.label === label)));

/** Whether `a` chooses several labels of a question that takes one. */
const severalOfOne = (asked: readonly Question[], a: Answer) =>
  a.chose.length > 1 && asked.some((q) => q.title === a.question && !q.multiple);

/** Whether `a` says something: a choice, words of the person's own, or that none of the options fits. */
const saysSomething = (a: Answer) => a.chose.length > 0 || hasWords(a) || saysNone(a);

/** Whether no question is answered twice in `answers`. */
const onceEach = (answers: readonly Answer[]) =>
  answers.every((a, i) => answers.every((b, j) => i === j || b.question !== a.question));

/** Whether every question of `asked` is answered in `answers`. */
const everyAnswered = (asked: readonly Question[], answers: readonly Answer[]) =>
  asked.every((q) => answers.some((a) => a.question === q.title));

/** Whether `answers` answer `asked`: every rule of an answer kept, each question once. */
const fits = (asked: readonly Question[], answers: readonly Answer[]) =>
  asked.length > 0 &&
  onceEach(answers) &&
  everyAnswered(asked, answers) &&
  answers.every(
    (a) =>
      namesAsked(asked, a) && offered(asked, a) && !severalOfOne(asked, a) && saysSomething(a) && !(saysNone(a) && a.chose.length > 0),
  );

const answerRefusalSpec = spec<(asked: readonly Question[], answers: readonly Answer[], instead?: string) => string | null>({
  /** What every caller hands it: questions as `questionsOf` reads them, each title once (`askedQuestions` drops a closeout that asks one twice). */
  requires: ({ input: [asked] }) => asked.every((q, i) => asked.every((r, j) => i === j || r.title !== q.title)),
  ensures: {
    nothingAskedNothingAnswered: {
      description: 'Answers, even none, to a step that asks no questions now are refused',
      condition: ({ input: [asked], output }) => asked.length > 0 || output !== null,
    },
    onlyAQuestionAsked: {
      description: 'An answer to a question the step does not ask now is refused',
      condition: ({ input: [asked, answers], output }) => answers.every((a) => namesAsked(asked, a)) || output !== null,
    },
    eachQuestionOnce: {
      description: 'Two answers to one question are refused',
      condition: ({ input: [, answers], output }) => onceEach(answers) || output !== null,
    },
    onlyAnOptionOffered: {
      description: 'An answer that chooses a label its question does not offer is refused',
      condition: ({ input: [asked, answers], output }) => answers.every((a) => offered(asked, a)) || output !== null,
    },
    oneWhereOneIsTaken: {
      description: 'An answer that chooses several options of a question that takes one is refused',
      condition: ({ input: [asked, answers], output }) => answers.every((a) => !severalOfOne(asked, a)) || output !== null,
    },
    noneIsNoChoice: {
      description: 'An answer that says none of the options fits and chooses one of them is refused',
      condition: ({ input: [, answers], output }) => answers.every((a) => !(saysNone(a) && a.chose.length > 0)) || output !== null,
    },
    anAnswerSaysSomething: {
      description: "An answer with no choice, no words of the person's own, and no word that none fits is refused",
      condition: ({ input: [, answers], output }) => answers.every(saysSomething) || output !== null,
    },
    everyQuestionAnswered: {
      description: 'Answers that leave a question the step asks unanswered are refused',
      condition: ({ input: [asked, answers], output }) => asked.length === 0 || everyAnswered(asked, answers) || output !== null,
    },
    noneStandsAlone: {
      description: 'An answer that says none of the options fits needs no choice and no words: answers that keep every rule are taken',
      condition: ({ input: [asked, answers], output }) => !fits(asked, answers) || output === null,
    },
  },
});
/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type AnswerRefusal = Implementation<typeof answerRefusalSpec>;
