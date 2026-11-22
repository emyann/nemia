/**
 * What a person has said so far of a step's questions on the board, and what it sends: the draft the one part that answers a series of
 * questions draws (`QuestionSeries`, components/gate/Questions.tsx). A press on an option's tile writes `chosenDraft`, a press on a way
 * out's tile ("Something else", "None of these") writes `wayDraft`; `unanswered` is what still holds the send back, and `answersFrom` is
 * what is sent. Pure; the four are proved by `contracts/question-draft.contract.ts`, read through this folder's tsconfig, which adds
 * `noUncheckedIndexedAccess` to the board's so the verifier reads the draft by a question's title.
 */
import type {
  AnswersFrom,
  ChosenDraft,
  Draft,
  DraftEntry,
  DraftQuestion,
  EntryOf,
  Unanswered,
  WayDraft,
  WayOut,
} from '../../../contracts/question-draft.contract.ts';

export type { Draft, WayOut } from '../../../contracts/question-draft.contract.ts';

/** Nothing said of a question: no choice, no words, no way out. */
const NOTHING: DraftEntry = { chose: [], own: '', way: null };

/**
 * What the person has said of `title`: nothing chosen, no words and no way out where they have said nothing; of the draft's own keys alone.
 *
 * @param draft what the person said so far
 * @param title the question's title
 */
export const entryOf: EntryOf = (draft, title) => (Object.hasOwn(draft, title) ? draft[title] : undefined) ?? NOTHING;

/** Whether `entry` holds words of the person's own: text that is not blank. */
const hasWords = (entry: DraftEntry) => entry.own.trim() !== '';

/** Whether `entry` answers its question: a choice, words, or none — and never "Something else" without its words. */
const answers = (entry: DraftEntry) =>
  (entry.chose.length > 0 || entry.way === 'none' || hasWords(entry)) && !(entry.way === 'else' && !hasWords(entry));

/**
 * The titles of the questions `draft` leaves unanswered, in the order asked.
 *
 * @param questions the questions a step asks
 * @param draft what the person said so far
 */
export const unanswered: Unanswered = (questions, draft) => questions.filter((q) => !answers(entryOf(draft, q.title))).map((q) => q.title);

/**
 * `draft` as the api takes it: one answer for each question, in the order asked, `none` and words only where there are.
 *
 * @param questions the questions a step asks
 * @param draft what the person said so far
 */
export const answersFrom: AnswersFrom = (questions, draft) =>
  questions.map((q) => {
    const entry = entryOf(draft, q.title);
    return {
      question: q.title,
      chose: entry.chose,
      ...(entry.way === 'none' ? { none: true as const } : {}),
      ...(hasWords(entry) ? { own: entry.own.trim() } : {}),
    };
  });

/**
 * `draft` with `label` chosen, or no longer chosen, on `q`: the one choice of a question that takes one, its way out taken back; among
 * others of one that takes several, "None of these" taken back and "Something else" kept beside them.
 *
 * @param draft what the person said so far
 * @param q the question the option is of
 * @param label the option's label
 * @param on whether it is now chosen, or no longer
 */
export const chosenDraft: ChosenDraft = (draft, q, label, on) => {
  const before = entryOf(draft, q.title);
  const kept = q.multiple ? before.chose.filter((l) => l !== label) : [];
  const way = !on ? before.way : q.multiple && before.way === 'else' ? 'else' : null;
  const next: Record<string, DraftEntry> = { ...draft };
  next[q.title] = { chose: on ? [...kept, label] : kept, own: before.own, way };
  return next;
};

/**
 * `draft` with `way` taken, or taken back, on `q`: "None of these" takes back every choice; "Something else" takes back the one choice of
 * a question that takes one, and sits beside those of one that takes several; the words are kept either way.
 *
 * @param draft what the person said so far
 * @param q the question the way out is on
 * @param way the way out pressed
 * @param on whether it is now taken, or taken back
 */
export const wayDraft: WayDraft = (draft, q, way, on) => {
  const before = entryOf(draft, q.title);
  const next: Record<string, DraftEntry> = { ...draft };
  next[q.title] = on
    ? { chose: way === 'none' || !q.multiple ? [] : before.chose, own: before.own, way }
    : { chose: before.chose, own: before.own, way: before.way === way ? null : before.way };
  return next;
};

/**
 * The labels `q` recommends, as a list: none for null, one for a label, and every label of a list, which a question that takes several
 * may recommend.
 *
 * @param q the question whose recommendation is read
 */
export const recommendedOf = (q: { readonly recommended: string | readonly string[] | null }) =>
  q.recommended === null ? [] : typeof q.recommended === 'string' ? [q.recommended] : q.recommended;

/**
 * `draft` with every question that has a recommendation set to it, "None of these" taken back and the words kept; a question without one
 * is left as it was.
 *
 * @param questions the questions a step asks
 * @param draft what the person said so far
 */
export const recommendedDraft = (
  questions: readonly (DraftQuestion & { readonly recommended: string | readonly string[] | null })[],
  draft: Draft,
) =>
  Object.fromEntries([
    ...Object.entries(draft),
    ...questions.flatMap((q) => {
      const chose = recommendedOf(q);
      const before = entryOf(draft, q.title);
      const way: WayOut | null = before.way === 'else' && q.multiple ? 'else' : null;
      return chose.length ? [[q.title, { chose, own: before.own, way }]] : [];
    }),
  ]) satisfies Draft as Draft;

/**
 * `draft` with the words on `q` set to `own`, its choices and way out kept.
 *
 * @param draft what the person said so far
 * @param q the question the words are on
 * @param own the words as typed
 */
export const wordsDraft = (draft: Draft, q: DraftQuestion, own: string) =>
  ({ ...draft, [q.title]: { ...entryOf(draft, q.title), own } }) satisfies Draft as Draft;
