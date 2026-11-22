/**
 * What a person has said so far of a step's questions on the board (src/lib/question-draft/questionDraft.ts), drawn by the one part
 * that answers a series of questions (`QuestionSeries`, src/components/gate/Questions.tsx), and sent as the api's `answers` once
 * nothing is left.
 *
 * Each question is answered by choosing among its options, or by one of the two ways out the board supplies on every question, as the
 * Agent SDK's `AskUserQuestion` supplies "Other" itself and no agent writes one: "Something else" (`else`), which needs the person's
 * words, and "None of these" (`none`), which stands without words and chooses no option. Words may sit beside a choice too.
 *
 * `chosenDraft` and `wayDraft` are what a press on an option's tile or a way out's tile writes; `unanswered` is what still holds the
 * send back; `answersFrom` is what is sent. The api refuses what the run would (`answerRefusal`, agent-orchestrator's
 * contracts/answer.contract.ts): these laws keep the board from sending a draft it refuses for its shape.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** A way out of a question the board supplies on every question: "Something else" or "None of these". */
export type WayOut = 'else' | 'none';

/**
 * What a person has said of one question: the labels they `chose`, their `own` words as typed, and the way out they took, null for none.
 * `none` holds no choice; `else` on a question that takes one holds no choice either.
 */
export type DraftEntry = { readonly chose: readonly string[]; readonly own: string; readonly way: WayOut | null };

/** What a person has said so far of each question, by its title. */
export type Draft = Readonly<Record<string, DraftEntry>>;

/** A question as the draft reads it: its title, its options' labels, whether it takes several. */
export type DraftQuestion = { readonly title: string; readonly options: readonly { readonly label: string }[]; readonly multiple: boolean };

/** One answer as the api takes it (`answers`, objects' run-actions.ts): the title, the labels chosen, words where there are any, `none`. */
export type SentAnswer = { question: string; chose: readonly string[]; own?: string; none?: true };

/**
 * What the person has said of `title`: nothing chosen, no words, no way out where they have said nothing. Read of the draft's own keys
 * alone, so a title `Object.prototype` holds (`toString`) reads as nothing said rather than as its member.
 */
const entryOf = (draft: Draft, title: string) =>
  (Object.hasOwn(draft, title) ? draft[title] : undefined) ?? { chose: [], own: '', way: null };

const entryOfSpec = spec<(draft: Draft, title: string) => DraftEntry>({
  ensures: {
    whatWasSaid: {
      description: 'What is read of a question is what the person said of it, or nothing said where they said nothing',
      condition: ({ input: [draft, title], output }) => {
        const said = entryOf(draft, title);
        return (
          output.way === said.way &&
          output.own === said.own &&
          output.chose.length === said.chose.length &&
          output.chose.every((l, i) => said.chose[i] === l)
        );
      },
    },
  },
});
/** The function's type, which the code takes: its key read proved once here, and read by this law alone where the others call it. */
export type EntryOf = Implementation<typeof entryOfSpec>;

/** Whether `entry` holds words of the person's own: text that is not blank. */
const hasWords = (entry: DraftEntry) => entry.own.trim() !== '';

/** Whether `entry` answers its question: a choice, words, or none — and never "Something else" without its words. */
const answers = (entry: DraftEntry) =>
  (entry.chose.length > 0 || entry.way === 'none' || hasWords(entry)) && !(entry.way === 'else' && !hasWords(entry));

const unansweredSpec = spec<(questions: readonly DraftQuestion[], draft: Draft) => string[]>({
  ensures: {
    eachSilentQuestionIsLeft: {
      description: 'A question with no choice, no words and no "None of these", or "Something else" with no words, is left',
      condition: ({ input: [questions, draft], output }) =>
        questions.every((q) => answers(entryOf(draft, q.title)) || output.includes(q.title)),
    },
    anAnsweredQuestionIsNotLeft: {
      description: 'A question answered by a choice, by words, or by "None of these" is not left',
      condition: ({ input: [questions, draft], output }) =>
        questions.every((q) => !answers(entryOf(draft, q.title)) || !output.includes(q.title)),
    },
    onlyQuestionsAsked: {
      description: 'Only a question asked is ever left',
      condition: ({ input: [questions], output }) => output.every((t) => questions.some((q) => q.title === t)),
    },
  },
});
/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type Unanswered = Implementation<typeof unansweredSpec>;

const answersFromSpec = spec<(questions: readonly DraftQuestion[], draft: Draft) => SentAnswer[]>({
  ensures: {
    oneAnswerEachInOrder: {
      description: 'One answer is sent for each question, in the order asked, naming it by its title',
      condition: ({ input: [questions], output }) =>
        output.length === questions.length && questions.every((q, i) => output[i]?.question === q.title),
    },
    theChoicesAsChosen: {
      description: 'Each answer sends the labels the person chose, no more and no fewer',
      condition: ({ input: [questions, draft], output }) =>
        questions.every((q, i) => {
          const chose = entryOf(draft, q.title).chose;
          const sent = output[i]?.chose ?? [];
          return sent.length === chose.length && sent.every((l) => chose.includes(l));
        }),
    },
    noneExactlyWhenTaken: {
      description: 'An answer says "None of these" exactly where the person took it',
      condition: ({ input: [questions, draft], output }) =>
        questions.every((q, i) => (output[i]?.none === true) === (entryOf(draft, q.title).way === 'none')),
    },
    wordsExactlyWhenWritten: {
      description: 'An answer carries words exactly where the person wrote some that are not blank',
      condition: ({ input: [questions, draft], output }) =>
        questions.every((q, i) => (output[i]?.own !== undefined) === hasWords(entryOf(draft, q.title))),
    },
  },
});
/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type AnswersFrom = Implementation<typeof answersFromSpec>;

/**
 * Whether `title` can be a key of a draft: every title but `__proto__`, which a record written at sets its prototype rather than a key
 * of its own, so nothing said of that question would be kept. The board's writers ask it; no agent names a question so.
 */
const aKeyOfItsOwn = (title: string) => title !== '__proto__';

const chosenDraftSpec = spec<(draft: Draft, q: DraftQuestion, label: string, on: boolean) => Draft>({
  requires: ({ input: [, q] }) => aKeyOfItsOwn(q.title),
  ensures: {
    aChoiceIsNotNone: {
      description: 'Choosing an option takes back "None of these"',
      condition: ({ input: [, q, , on], output }) => !on || entryOf(output, q.title).way !== 'none',
    },
    oneWhereOneIsTaken: {
      description: 'Choosing an option of a question that takes one leaves it the only choice, with no way out',
      condition: ({ input: [, q, label, on], output }) => {
        const after = entryOf(output, q.title);
        return !on || q.multiple || (after.chose.length === 1 && after.chose[0] === label && after.way === null);
      },
    },
    severalKeepTheirChoices: {
      description: 'Choosing an option of a question that takes several keeps every option chosen before, and adds it',
      condition: ({ input: [draft, q, label, on], output }) => {
        const after = entryOf(output, q.title).chose;
        return !on || !q.multiple || (after.includes(label) && entryOf(draft, q.title).chose.every((l) => after.includes(l)));
      },
    },
    unchosenIsGone: {
      description: 'An option no longer chosen is not among the choices',
      condition: ({ input: [, q, label, on], output }) => on || !entryOf(output, q.title).chose.includes(label),
    },
    wordsKept: {
      description: 'Choosing keeps the words the person wrote',
      condition: ({ input: [draft, q], output }) => entryOf(output, q.title).own === entryOf(draft, q.title).own,
    },
  },
});
/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type ChosenDraft = Implementation<typeof chosenDraftSpec>;

const wayDraftSpec = spec<(draft: Draft, q: DraftQuestion, way: WayOut, on: boolean) => Draft>({
  requires: ({ input: [, q] }) => aKeyOfItsOwn(q.title),
  ensures: {
    noneChoosesNothing: {
      description: 'Taking "None of these" takes back every choice of the question',
      condition: ({ input: [, q, way, on], output }) => {
        const after = entryOf(output, q.title);
        return !on || way !== 'none' || (after.way === 'none' && after.chose.length === 0);
      },
    },
    elseInsteadOfTheOne: {
      description: 'Taking "Something else" on a question that takes one takes back its choice',
      condition: ({ input: [, q, way, on], output }) => {
        const after = entryOf(output, q.title);
        return !on || way !== 'else' || q.multiple || (after.way === 'else' && after.chose.length === 0);
      },
    },
    elseBesideSeveral: {
      description: 'Taking "Something else" on a question that takes several keeps the options chosen beside it',
      condition: ({ input: [draft, q, way, on], output }) => {
        const after = entryOf(output, q.title);
        return (
          !on ||
          way !== 'else' ||
          !q.multiple ||
          (after.way === 'else' && entryOf(draft, q.title).chose.every((l) => after.chose.includes(l)))
        );
      },
    },
    takenBackIsGone: {
      description: 'A way out taken back is no longer taken',
      condition: ({ input: [, q, way, on], output }) => on || entryOf(output, q.title).way !== way,
    },
    wordsKept: {
      description: 'Taking or taking back a way out keeps the words the person wrote',
      condition: ({ input: [draft, q], output }) => entryOf(output, q.title).own === entryOf(draft, q.title).own,
    },
  },
});
/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type WayDraft = Implementation<typeof wayDraftSpec>;
