/**
 * The terminal's names for a step's questions: each question numbered 1, 2… across its asked fields in the order `askedQuestions` gives
 * them, the order the board answers them in, and each option lettered a, b… (`aa` past `z`). `nemia decide` prints them so
 * (`questionLines`), and `--answer 1=a` names them back, resolved to the board's own answers, by question title and option label
 * (`numberedAnswers`), before the package's `answerRefusal` and `answerText` read them. Pure.
 */
import type { Closeout } from '../closeout/index.ts';
import type { Workflow } from '../step/step.ts';
import { askedQuestions, type Answer, type Asked, type Question } from './question.ts';

/** The letter of the option at `index` from 0: `a` to `z`, then `aa`, `ab`… */
export const letterOf = (index: number): string =>
  index < 26 ? String.fromCharCode(97 + index) : `${letterOf(Math.floor(index / 26) - 1)}${letterOf(index % 26)}`;

/** One question as `nemia decide` prints it: its number and title, its body, each option lettered, the recommended one marked, and how. */
const questionBlock = (q: Question, n: number): string[] => [
  `  ${n}. ${q.title}`,
  ...(q.body.trim()
    ? q.body
        .trim()
        .split('\n')
        .map((line) => `     ${line}`)
    : []),
  ...q.options.map(
    (o, i) => `     ${letterOf(i)}  ${o.label}${o.meaning ? ` — ${o.meaning}` : ''}${o.label === q.recommended ? '  (recommended)' : ''}`,
  ),
  `     ${q.multiple ? 'choose one or more' : 'choose one'}, or answer in your own words`,
];

/** What a closeout asks, as `nemia decide` prints it: each field's name, then its questions, numbered on across the fields. */
export function questionLines(asked: readonly Asked[]): string[] {
  let n = 0;
  return asked.flatMap(({ field, questions }) => [`${field}:`, ...questions.flatMap((q) => questionBlock(q, ++n))]);
}

/** The `--answer` a line that offers the verb shows, one for each question asked: `--answer 1=<letter> --answer 2=<letter>`. */
export const answerForm = (count: number): string => Array.from({ length: count }, (_, i) => `--answer ${i + 1}=<letter>`).join(' ');

/**
 * What a line offering `nemia retry` or `nemia approve` to `step` gives after its name: an `--answer` for each question its closeout
 * `said` asks, and the note beside them; or `words`, the `--message` it offers where the closeout asks none.
 */
export const answersOr = (step: Workflow | undefined, said: Closeout | { error: string } | undefined, words: string): string => {
  const count = askedQuestions(step, said).flatMap((a) => a.questions).length;
  return count ? `${answerForm(count)} [--message "<note>"]` : words;
};

/** The forms an `--answer` takes, as its refusal says them. */
const FORMS = "`n=a`, `n=a,c` where the question takes several, `n=a: words` or `n: words`, n the question's number";

/** One `--answer` value read: the question's number, the letters chosen, and the person's own words. */
type Typed = { n: number; letters: string[]; own?: string };

/** An `--answer` value read (`1=a`, `2=a,c`, `3=b: words`, `3: words`), or null where it takes no form of them. */
function typedOf(value: string): Typed | null {
  const m = /^\s*(\d+)\s*(?:=\s*([a-z]+(?:\s*,\s*[a-z]+)*))?\s*(?::([\s\S]*))?$/i.exec(value);
  if (!m) return null;
  const own = m[3]?.trim();
  if (m[2] === undefined && !own) return null;
  return { n: Number(m[1]), letters: m[2] ? m[2].split(',').map((l) => l.trim().toLowerCase()) : [], ...(own ? { own } : {}) };
}

/** `typed` resolved against question `q`: its letters as the labels they name, or why one names none. */
function resolved(q: Question, typed: Typed, value: string): Answer | { error: string } {
  const letters = q.options.map((_, i) => letterOf(i));
  const stray = typed.letters.find((l) => !letters.includes(l));
  if (stray !== undefined) {
    const offered = q.options.map((o, i) => `${letters[i]} (${o.label})`).join(', ');
    return { error: `--answer ${value}: "${q.title}" offers no ${stray}: its options are ${offered}.` };
  }
  const chose = typed.letters.map((l) => q.options[letters.indexOf(l)].label);
  return { question: q.title, chose, ...(typed.own ? { own: typed.own } : {}) };
}

/**
 * Each `--answer` value `typed` names, resolved against the questions a step asks now, numbered as `questionLines` numbers them: the
 * question's title, the labels its letters name and the person's own words, as the board sends an answer; or why one cannot be read — a
 * value in no form of them, a number past the questions asked or below 1, a letter its question does not offer. None for a step that asks
 * none, which `answerRefusal` says itself. What is left to refuse — a question answered twice or not at all, several labels where one is
 * taken — is `answerRefusal`'s.
 *
 * @param decide The command that prints the numbering, as the refusal of a number past them names it.
 */
export function numberedAnswers(
  questions: readonly Question[],
  typed: readonly string[],
  decide = 'nemia decide <runId>',
): Answer[] | { error: string } {
  if (!questions.length) return [];
  const answers: Answer[] = [];
  for (const value of typed) {
    const read = typedOf(value);
    if (!read) return { error: `--answer ${value} is not an answer: it takes ${FORMS}, quoted where it has spaces.` };
    const q = questions[read.n - 1];
    if (!q) {
      return {
        error: `--answer ${value} names question ${read.n}, and the step asks ${questions.length} now, numbered from 1 as ${decide} prints them.`,
      };
    }
    const answer = resolved(q, read, value);
    if ('error' in answer) return answer;
    answers.push(answer);
  }
  return answers;
}
